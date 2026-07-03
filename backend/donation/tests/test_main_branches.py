from datetime import datetime, timezone
from uuid import UUID, uuid4

import app.main as main

from tests.test_api import FakeDB, client  # reuse fixtures/fakes  # noqa: F401


def _ledger_row(position, event_type, payload, previous_hash):
    event_id = UUID(int=position)
    campaign_id = UUID("22222222-2222-2222-2222-222222222222")
    created_at = datetime(2026, 6, 21, tzinfo=timezone.utc)
    entry_hash = main.ledger_hash(
        position=position, event_id=str(event_id), event_type=event_type,
        campaign_id=str(campaign_id), entity_id=str(event_id), public_payload=payload,
        previous_hash=previous_hash, created_at=created_at,
    )
    return {
        "position": position, "event_id": event_id, "event_type": event_type,
        "campaign_id": campaign_id, "entity_id": event_id, "public_payload": payload,
        "previous_hash": previous_hash, "entry_hash": entry_hash, "created_at": created_at,
    }


# ---- 343: PDF font falls back to Helvetica when no TTF is available ----------

def test_statement_font_falls_back_to_helvetica(monkeypatch):
    class _NoFont:
        def __init__(self, *_a):
            pass

        def exists(self):
            return False

    monkeypatch.setattr(main, "Path", _NoFont)
    assert main._statement_font() == "Helvetica"


# ---- 439: annual statement renders a placeholder row when there are none -----

def test_annual_statement_empty_year_renders_placeholder(client):
    api, db, *_ = client
    year = datetime.now(timezone.utc).year
    db.fetch_results.append([])  # no donations this year
    response = api.get(f"/donations/me/annual-statement?year={year}")
    assert response.status_code == 200
    assert response.content.startswith(b"%PDF")


# ---- 548 + 554: ledger query builds campaign_id and cursor filters ----------

def test_public_ledger_accepts_campaign_and_cursor_filters(client):
    api, db, *_ = client
    db.fetch_results.append([_ledger_row(1, "DONATION_COMPLETED", {"amount": 50000, "receipt_number": "CC-001"}, "0" * 64)])
    response = api.get(f"/transparency/ledger?campaign_id={uuid4()}&cursor=5&limit=10")
    assert response.status_code == 200
    assert response.json()["items"][0]["position"] == 1


# ---- 599: verify accumulates FUND_USAGE_VERIFIED into fund_usage_total -------

def test_verify_accumulates_fund_usage_total(client):
    api, db, *_ = client
    row1 = _ledger_row(1, "DONATION_COMPLETED", {"amount": 50000, "receipt_number": "CC-001"}, "0" * 64)
    row2 = _ledger_row(2, "FUND_USAGE_VERIFIED", {"amount_used": 30000}, row1["entry_hash"])
    db.fetch_results.append([row1, row2])
    result = api.get("/transparency/verify").json()
    assert result["valid"] is True
    assert result["donation_total"] == 50000
    assert result["fund_usage_total"] == 30000


# ---- 662 / 664: receipt verification reports UNANCHORED states ---------------

def _receipt_row():
    return {
        "position": 1, "campaign_id": UUID("22222222-2222-2222-2222-222222222222"),
        "entry_hash": "a" * 64, "previous_hash": "0" * 64,
        "public_payload": {"amount": 50000, "receipt_number": "CC-001", "campaign_title": "Lớp học"},
    }


def test_receipt_unanchored_when_proof_valid_but_no_anchor(client, monkeypatch):
    api, db, *_ = client
    db.fetchrow_results.append(_receipt_row())

    async def fake_verify(_db):
        return {"valid": True, "status": "OK"}

    async def fake_proof(_db, _position):
        return {"proof_valid": True, "anchor": None, "proof": [], "merkle_root": None}

    monkeypatch.setattr(main, "verify_ledger", fake_verify)
    monkeypatch.setattr(main, "proof_for_position", fake_proof)
    assert api.get("/transparency/receipts/CC-001").json()["verification_status"] == "UNANCHORED"


def test_receipt_unanchored_when_proof_invalid_but_no_anchor(client, monkeypatch):
    api, db, *_ = client
    db.fetchrow_results.append(_receipt_row())

    async def fake_verify(_db):
        return {"valid": True, "status": "OK"}

    async def fake_proof(_db, _position):
        return {"proof_valid": False, "anchor": None, "proof": [], "merkle_root": None}

    monkeypatch.setattr(main, "verify_ledger", fake_verify)
    monkeypatch.setattr(main, "proof_for_position", fake_proof)
    assert api.get("/transparency/receipts/CC-001").json()["verification_status"] == "UNANCHORED"


# ---- 578: verify_ledger parses public_payload stored as a JSON string --------

def test_verify_handles_string_public_payload(client):
    import json as _json

    api, db, *_ = client
    row = _ledger_row(1, "DONATION_COMPLETED", {"amount": 50000, "receipt_number": "CC-001"}, "0" * 64)
    row["public_payload"] = _json.dumps(row["public_payload"])  # stored as text, like JSONB-as-str
    db.fetch_results.append([row])
    result = api.get("/transparency/verify").json()
    assert result["valid"] is True
    assert result["donation_total"] == 50000


# ---- 623: anchor endpoint re-raises non NO_UNANCHORED_ENTRIES ValueErrors ----

def test_create_anchor_reraises_unexpected_value_error(client, monkeypatch):
    import pytest

    from app.auth import UserClaims, require_user

    api, *_ = client
    main.app.dependency_overrides[require_user] = lambda: UserClaims(
        id="00000000-0000-0000-0000-000000000001", email="admin@test.vn", name="Admin", role="ADMIN"
    )

    async def boom(*_args):
        raise ValueError("UNEXPECTED")

    monkeypatch.setattr(main, "create_anchor", boom)
    with pytest.raises(ValueError, match="UNEXPECTED"):
        api.post("/admin/transparency/anchors")


# ---- 657: receipt endpoint parses public_payload stored as a JSON string -----

def test_receipt_handles_string_public_payload(client, monkeypatch):
    import json as _json

    api, db, *_ = client
    row = {
        "position": 1, "campaign_id": UUID("22222222-2222-2222-2222-222222222222"),
        "entry_hash": "a" * 64, "previous_hash": "0" * 64,
        "public_payload": _json.dumps({"amount": 50000, "receipt_number": "CC-001", "campaign_title": "Lớp học"}),
    }
    db.fetchrow_results.append(row)

    async def fake_verify(_db):
        return {"valid": True}

    async def fake_proof(_db, _position):
        return {"proof_valid": True, "anchor": {"status": "SIMULATED"}, "proof": [], "merkle_root": "a" * 64}

    monkeypatch.setattr(main, "verify_ledger", fake_verify)
    monkeypatch.setattr(main, "proof_for_position", fake_proof)
    body = api.get("/transparency/receipts/CC-001").json()
    assert body["amount"] == 50000
    assert body["verification_status"] == "CONFIRMED"


def test_transparency_diagnostics_summarizes_chain_and_anchor(client, monkeypatch):
    api, db, *_ = client

    async def fake_verify(_db):
        return {"valid": True, "entries": 2, "donation_total": 50000, "fund_usage_total": 10000}

    monkeypatch.setattr(main, "verify_ledger", fake_verify)
    db.fetchrow_results.extend([
        {"position": 2, "entry_hash": "b" * 64, "previous_hash": "a" * 64},
        {"anchor_id": "anchor-1", "network": "LOCAL_SIMULATION", "anchor_tx_hash": "0xabc", "block_number": 2, "explorer_url": None, "status": "SIMULATED", "anchored_at": datetime.now(timezone.utc)},
    ])
    db.fetchval_results.append(0)
    body = api.get("/transparency/diagnostics").json()
    assert body["chain_valid"] is True
    assert body["ledger_position"] == 2
    assert body["anchor_status"] == "SIMULATED"
    assert body["issues"] == []


def test_receipt_diagnostics_reports_unanchored_receipt(client, monkeypatch):
    api, db, *_ = client
    db.fetchrow_results.append(_receipt_row())

    async def fake_verify(_db):
        return {"valid": True}

    async def fake_proof(_db, _position):
        return {"proof_valid": True, "anchor": None, "proof": [], "merkle_root": None}

    monkeypatch.setattr(main, "verify_ledger", fake_verify)
    monkeypatch.setattr(main, "proof_for_position", fake_proof)
    body = api.get("/transparency/diagnostics/receipts/CC-001").json()
    assert body["chain_valid"] is True
    assert body["receipt_valid"] is False
    assert body["anchor_status"] == "UNANCHORED"
    assert "chưa neo" in body["issues"][0]


def test_ledger_diagnostics_detects_invalid_chain(client, monkeypatch):
    api, db, *_ = client
    row = _ledger_row(1, "DONATION_COMPLETED", {"amount": 50000, "receipt_number": "CC-001"}, "0" * 64)
    db.fetchrow_results.append(row)

    async def fake_verify(_db):
        return {"valid": False, "invalid_position": 1}

    async def fake_proof(_db, _position):
        return {"proof_valid": False, "anchor": None, "merkle_root": None}

    monkeypatch.setattr(main, "verify_ledger", fake_verify)
    monkeypatch.setattr(main, "proof_for_position", fake_proof)
    body = api.get("/transparency/diagnostics/ledger/1").json()
    assert body["chain_valid"] is False
    assert body["ledger_position"] == 1
    assert any("Hash-chain" in issue for issue in body["issues"])
