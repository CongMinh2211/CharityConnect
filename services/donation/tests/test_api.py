import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.auth import UserClaims, require_user


class AsyncContext:
    def __init__(self, value): self.value = value
    async def __aenter__(self): return self.value
    async def __aexit__(self, *_args): return False


class FakeDB:
    def __init__(self):
        self.fetch_results = []
        self.fetchrow_results = []
        self.fetchval_results = []
        self.executed = []
    async def fetch(self, *_args): return self.fetch_results.pop(0) if self.fetch_results else []
    async def fetchrow(self, *_args): return self.fetchrow_results.pop(0) if self.fetchrow_results else None
    async def fetchval(self, *_args): return self.fetchval_results.pop(0) if self.fetchval_results else 0
    async def execute(self, *args): self.executed.append(args); return "OK"
    def acquire(self): return AsyncContext(self)
    def transaction(self): return AsyncContext(self)


class FakeResponse:
    def __init__(self, status_code=200, payload=None): self.status_code = status_code; self.payload = payload or {}
    def json(self): return self.payload


class FakeHTTP:
    def __init__(self): self.responses = []
    async def get(self, *_args, **_kwargs): return self.responses.pop(0)


class FakeRedis:
    def __init__(self): self.events = []
    async def xadd(self, stream, payload): self.events.append((stream, payload))


@asynccontextmanager
async def no_lifespan(_app):
    yield


@pytest.fixture
def client():
    main.app.router.lifespan_context = no_lifespan
    db = FakeDB(); http = FakeHTTP(); redis = FakeRedis()
    main.app.state.db = db; main.app.state.http = http; main.app.state.redis = redis
    main.app.dependency_overrides[require_user] = lambda: UserClaims(
        id="00000000-0000-0000-0000-000000000001", email="donor@test.vn", name="Nguyễn An", role="DONOR"
    )
    with TestClient(main.app) as test_client:
        yield test_client, db, http, redis
    main.app.dependency_overrides.clear()


def test_health_and_metrics(client):
    api, *_ = client
    assert api.get("/health").json()["service"] == "donation"
    assert api.get("/metrics").status_code == 200


def test_create_donation_writes_receipt_and_outbox(client):
    api, db, http, _redis = client
    http.responses.append(FakeResponse(payload={"eligible": True, "title": "Lớp học vùng cao"}))
    donation_id = uuid4()
    db.fetchrow_results.append({
        "id": donation_id, "campaign_id": UUID("00000000-0000-0000-0000-000000000010"), "campaign_title": "Lớp học vùng cao",
        "amount": 50000, "anonymous": True, "status": "COMPLETED", "created_at": datetime.now(timezone.utc)
    })
    db.fetchrow_results.extend([None, None, {"position": 1, "entry_hash": "a" * 64}])
    response = api.post("/donations", json={"campaign_id": "00000000-0000-0000-0000-000000000010", "amount": 50000, "anonymous": True})
    assert response.status_code == 201
    assert response.json()["status"] == "COMPLETED"
    assert response.json()["proof_status"] == "CONFIRMED"
    assert response.json()["ledger_position"] == 1
    assert len(db.executed) == 3


def test_create_donation_rejects_missing_and_inactive_campaigns(client):
    api, _db, http, _redis = client
    http.responses.append(FakeResponse(status_code=404))
    assert api.post("/donations", json={"campaign_id": "00000000-0000-0000-0000-000000000010", "amount": 50000}).status_code == 404
    http.responses.append(FakeResponse(payload={"eligible": False, "reason": "NOT_ACTIVE"}))
    assert api.post("/donations", json={"campaign_id": "00000000-0000-0000-0000-000000000010", "amount": 50000}).status_code == 409


def test_history_and_receipt(client):
    api, db, _http, _redis = client
    donation_id = uuid4()
    row = {"id": donation_id, "campaign_id": uuid4(), "campaign_title": "C", "amount": 50000, "anonymous": False, "status": "COMPLETED", "created_at": datetime.now(timezone.utc), "receipt_number": "CC-1"}
    db.fetch_results.append([row])
    assert len(api.get("/donations/history").json()) == 1
    db.fetchrow_results.append({**row, "donor_name": "Nguyễn An", "issued_at": datetime.now(timezone.utc)})
    assert api.get(f"/donations/{donation_id}/receipt").status_code == 200
    db.fetchrow_results.append(None)
    assert api.get(f"/donations/{uuid4()}/receipt").status_code == 404


def test_annual_statement_returns_pdf_for_donor(client):
    api, db, _http, _redis = client
    year = datetime.now(timezone.utc).year
    db.fetch_results.append([
        {
            "campaign_title": "Lop hoc vung cao",
            "amount": 125000,
            "created_at": datetime(year, 6, 21, tzinfo=timezone.utc),
            "receipt_number": "CC-2026-000001",
            "proof_status": "CONFIRMED",
        }
    ])
    response = api.get(f"/donations/me/annual-statement?year={year}")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
    assert api.get("/donations/me/annual-statement?year=1999").status_code == 422


def test_organization_view_masks_anonymous_donors(client):
    api, db, http, _redis = client
    organization_id = "00000000-0000-0000-0000-000000000001"
    main.app.dependency_overrides[require_user] = lambda: UserClaims(id=organization_id, email="org@test.vn", name="Quỹ", role="ORGANIZATION")
    http.responses.append(FakeResponse(payload={"organization_id": organization_id}))
    db.fetch_results.append([{"id": uuid4(), "donor_name": "Nguyễn An", "amount": 50000, "anonymous": True, "status": "COMPLETED", "created_at": datetime.now(timezone.utc)}])
    response = api.get("/organization/donations/00000000-0000-0000-0000-000000000010")
    assert response.json()[0]["donor_name"] == "Ẩn danh"
    http.responses.append(FakeResponse(payload={"organization_id": "someone-else"}))
    assert api.get("/organization/donations/00000000-0000-0000-0000-000000000010").status_code == 403


@pytest.mark.asyncio
async def test_outbox_publisher_emits_and_marks_event(monkeypatch):
    db = FakeDB(); redis = FakeRedis()
    event_id = uuid4()
    db.fetch_results.append([{"id": event_id, "payload": {"event_id": str(event_id), "campaign_id": str(uuid4()), "amount": "50000"}}])
    fake_app = type("FakeApp", (), {"state": type("State", (), {"db": db, "redis": redis})()})()
    async def stop_after_first(_seconds): raise asyncio.CancelledError
    monkeypatch.setattr(main.asyncio, "sleep", stop_after_first)
    with pytest.raises(asyncio.CancelledError):
        await main.publish_outbox(fake_app)
    assert redis.events[0][0] == "donation.completed"
    assert db.executed


def make_ledger_row(position=1, previous_hash="0" * 64, payload=None):
    event_id = UUID("11111111-1111-1111-1111-111111111111")
    campaign_id = UUID("22222222-2222-2222-2222-222222222222")
    created_at = datetime(2026, 6, 21, tzinfo=timezone.utc)
    public_payload = payload or {"amount": 50000, "receipt_number": "CC-001", "campaign_title": "Lớp học"}
    entry_hash = main.ledger_hash(
        position=position, event_id=str(event_id), event_type="DONATION_COMPLETED",
        campaign_id=str(campaign_id), entity_id=str(event_id), public_payload=public_payload,
        previous_hash=previous_hash, created_at=created_at,
    )
    return {
        "position": position, "event_id": event_id, "event_type": "DONATION_COMPLETED",
        "campaign_id": campaign_id, "entity_id": event_id, "public_payload": public_payload,
        "previous_hash": previous_hash, "entry_hash": entry_hash, "created_at": created_at,
    }


def test_public_ledger_filters_and_receipt_proof(client):
    api, db, *_ = client
    row = make_ledger_row()
    db.fetch_results.append([row])
    response = api.get("/transparency/ledger?event_type=DONATION_COMPLETED&limit=10")
    assert response.status_code == 200
    assert response.json()["items"][0]["position"] == 1
    assert api.get("/transparency/ledger?event_type=WRONG").status_code == 422
    db.fetchrow_results.append(row)
    proof = api.get("/transparency/receipts/CC-001")
    assert proof.status_code == 200
    assert proof.json()["proof_status"] == "CONFIRMED"
    assert "donor" not in proof.text.lower()
    db.fetchrow_results.append(None)
    assert api.get("/transparency/receipts/CC-404").status_code == 404


def test_chain_verification_detects_tampering(client):
    api, db, *_ = client
    db.fetch_results.append([make_ledger_row()])
    verified = api.get("/transparency/verify").json()
    assert verified["valid"] is True
    assert verified["donation_total"] == 50000
    tampered = make_ledger_row(payload={"amount": 999999, "receipt_number": "CC-001"})
    tampered["entry_hash"] = "f" * 64
    db.fetch_results.append([tampered])
    invalid = api.get("/transparency/verify").json()
    assert invalid["status"] == "INVALID"
    assert invalid["invalid_position"] == 1


def queue_analytics(db, amount=500_000, usage=125_000):
    db.fetchrow_results.append({
        "donation_amount": amount, "donation_count": 2, "unique_donors": 1,
        "campaign_count": 1, "average_amount": amount // 2,
    })
    db.fetch_results.extend([
        [{"bucket": "2026-06-21", "donation_amount": amount, "donation_count": 2}],
        [{"campaign_id": uuid4(), "campaign_title": "Chiến dịch", "donation_amount": amount, "donation_count": 2}],
    ])
    db.fetchval_results.append(usage)


def test_public_and_personal_analytics_are_reconciled(client):
    api, db, *_ = client
    queue_analytics(db)
    result = api.get("/analytics/donations/public?period=all").json()
    assert result["granularity"] == "month"
    assert result["totals"]["transparent_balance"] == 375_000
    assert result["timeline"][0]["donation_count"] == 2
    assert api.get("/analytics/donations/public?period=bad").status_code == 422

    queue_analytics(db, 200_000, 0)
    personal = api.get("/analytics/donations/me?period=7d")
    assert personal.status_code == 200
    assert personal.json()["totals"]["donation_amount"] == 200_000


def test_organization_and_admin_analytics_enforce_roles(client):
    api, db, http, _ = client
    org_id = "00000000-0000-0000-0000-000000000001"
    campaign_id = str(uuid4())
    main.app.dependency_overrides[require_user] = lambda: UserClaims(id=org_id, email="org@test.vn", name="Quỹ", role="ORGANIZATION")
    http.responses.append(FakeResponse(payload={"campaign_ids": [campaign_id]}))
    queue_analytics(db)
    assert api.get("/analytics/donations/organization?period=30d").status_code == 200
    http.responses.append(FakeResponse(status_code=500))
    assert api.get("/analytics/donations/organization").status_code == 503

    main.app.dependency_overrides[require_user] = lambda: UserClaims(id=org_id, email="admin@test.vn", name="Admin", role="ADMIN")
    queue_analytics(db)
    assert api.get("/analytics/donations/admin?period=90d").status_code == 200


def test_anchor_list_create_and_public_proof(client, monkeypatch):
    api, db, *_ = client
    user_id = "00000000-0000-0000-0000-000000000001"
    main.app.dependency_overrides[require_user] = lambda: UserClaims(id=user_id, email="admin@test.vn", name="Admin", role="ADMIN")

    async def fake_create(_db, created_by):
        assert str(created_by) == user_id
        return {"id": "anchor-1", "status": "SIMULATED"}

    monkeypatch.setattr(main, "create_anchor", fake_create)
    assert api.post("/admin/transparency/anchors").json()["status"] == "SIMULATED"

    db.fetch_results.append([
        {"id": "a1", "merkle_root": "a" * 64, "from_position": 1, "to_position": 2, "network": "LOCAL_SIMULATION", "anchor_tx_hash": "0x1", "block_number": 2, "explorer_url": None, "status": "SIMULATED", "anchored_at": datetime.now(timezone.utc), "confirmed_at": datetime.now(timezone.utc)},
        {"id": "a2", "merkle_root": "b" * 64, "from_position": 3, "to_position": 4, "network": "LOCAL_SIMULATION", "anchor_tx_hash": "0x2", "block_number": 4, "explorer_url": None, "status": "SIMULATED", "anchored_at": datetime.now(timezone.utc), "confirmed_at": datetime.now(timezone.utc)},
    ])
    listed = api.get("/transparency/anchors?limit=1").json()
    assert len(listed["items"]) == 1 and listed["next_cursor"] == 1

    async def fake_proof(_db, position):
        return {"ledger_position": position, "proof_valid": True} if position == 1 else None

    monkeypatch.setattr(main, "proof_for_position", fake_proof)
    assert api.get("/transparency/proofs/1").json()["proof_valid"] is True
    assert api.get("/transparency/proofs/2").status_code == 404


def test_anchor_returns_conflict_when_every_entry_is_already_anchored(client, monkeypatch):
    api, *_ = client
    main.app.dependency_overrides[require_user] = lambda: UserClaims(id="00000000-0000-0000-0000-000000000001", email="admin@test.vn", name="Admin", role="ADMIN")

    async def no_rows(*_args):
        raise ValueError("NO_UNANCHORED_ENTRIES")

    monkeypatch.setattr(main, "create_anchor", no_rows)
    assert api.post("/admin/transparency/anchors").status_code == 409
