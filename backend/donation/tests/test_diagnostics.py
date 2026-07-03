import app.main as main
from app.diagnostics import anchor_status, build_diagnostics, recommendation

from tests.test_api import client  # noqa: F401


# ---- pure helpers: full branch coverage of recommendation()/anchor_status() --

def test_anchor_status_maps_missing_and_present():
    assert anchor_status(None) == "UNANCHORED"
    assert anchor_status({"status": "SIMULATED"}) == "SIMULATED"
    assert anchor_status({"network": "LOCAL"}) == "UNKNOWN"


def test_recommendation_covers_every_branch():
    assert "hợp lệ" in recommendation([])
    assert "ledger gốc" in recommendation(["Hash-chain không hợp lệ tại vị trí 2"])
    assert "anchor" in recommendation(["Còn 3 bản ghi chưa neo điểm neo"]).lower()
    assert recommendation(["Một sự cố không xác định"]).startswith("Kiểm tra lại")


def test_build_diagnostics_shape():
    payload = build_diagnostics(chain_valid=True, ledger_position=1, anchor={"status": "CONFIRMED"})
    assert payload["anchor_status"] == "CONFIRMED"
    assert payload["chain_valid"] is True
    assert set(payload) >= {
        "chain_valid", "receipt_valid", "ledger_position", "entry_hash",
        "previous_hash", "merkle_root", "anchor_status", "issues", "recommendation",
    }


# ---- endpoint branches: invalid chain + unanchored entries ------------------

def test_diagnostics_endpoint_flags_invalid_chain_and_unanchored(client, monkeypatch):
    api, db, *_ = client

    async def fake_verify(_db):
        return {"valid": False, "invalid_position": 2, "entries": 3, "donation_total": 0, "fund_usage_total": 0}

    monkeypatch.setattr(main, "verify_ledger", fake_verify)
    db.fetchrow_results.append({"position": 3, "entry_hash": "a" * 64, "previous_hash": "b" * 64})  # head
    db.fetchval_results.append(2)  # unanchored count
    db.fetchrow_results.append(None)  # latest anchor
    body = api.get("/transparency/diagnostics").json()
    assert body["chain_valid"] is False
    assert any("không hợp lệ" in issue for issue in body["issues"])
    assert any("chưa neo" in issue for issue in body["issues"])
    assert body["anchor_status"] == "UNANCHORED"


def test_ledger_diagnostics_flags_invalid_chain_without_merkle(client, monkeypatch):
    api, db, *_ = client
    db.fetchrow_results.append({
        "position": 1, "entry_hash": "a" * 64, "previous_hash": "0" * 64,
        "event_type": "DONATION_COMPLETED", "campaign_id": None,
        "public_payload": {"amount": 1000}, "created_at": None,
    })

    async def fake_verify(_db):
        return {"valid": False, "invalid_position": 1}

    async def fake_proof(_db, _position):
        return None

    monkeypatch.setattr(main, "verify_ledger", fake_verify)
    monkeypatch.setattr(main, "proof_for_position", fake_proof)
    body = api.get("/transparency/diagnostics/ledger/1").json()
    assert body["chain_valid"] is False
    assert any("Merkle" in issue for issue in body["issues"])


def test_ledger_diagnostics_returns_404_for_missing_position(client):
    api, db, *_ = client
    db.fetchrow_results.append(None)
    assert api.get("/transparency/diagnostics/ledger/999").status_code == 404
