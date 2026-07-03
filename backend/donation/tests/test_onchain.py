from uuid import uuid4

import pytest

import app.main as main
from app import trustchain
from app.trustchain import decode_anchor_calldata, verify_onchain_anchor

from tests.test_api import client  # noqa: F401

ROOT = "ab" * 32


def _calldata(root: str) -> str:
    return "0x" + (b"CHARITYCONNECT:MERKLE:" + bytes.fromhex(root)).hex()


# ---- pure decoder -----------------------------------------------------------

def test_decode_anchor_calldata_roundtrip_and_rejects_bad_input():
    assert decode_anchor_calldata(_calldata(ROOT)) == ROOT
    assert decode_anchor_calldata("0xdeadbeef") is None  # wrong prefix
    assert decode_anchor_calldata("zznothex") is None
    assert decode_anchor_calldata(None) is None


# ---- verify_onchain_anchor branches ----------------------------------------

def _rpc_factory(tx, latest="0x6e"):
    async def fake_rpc(method, _params):
        if method == "eth_getTransactionByHash":
            return tx
        if method == "eth_blockNumber":
            return latest
        return None
    return fake_rpc


@pytest.mark.asyncio
async def test_onchain_verified_with_confirmations(monkeypatch):
    monkeypatch.setattr(trustchain, "rpc", _rpc_factory({"input": _calldata(ROOT), "blockNumber": "0x64"}))
    anchor = {"network": "SEPOLIA", "anchor_tx_hash": "0x" + "11" * 32, "merkle_root": ROOT, "block_number": 100}
    result = await verify_onchain_anchor(anchor)
    assert result["onchain_verified"] is True
    assert result["onchain_root"] == ROOT
    assert result["confirmations"] == 110 - 100 + 1
    assert result["reason"] == "VERIFIED"


@pytest.mark.asyncio
async def test_onchain_root_mismatch(monkeypatch):
    monkeypatch.setattr(trustchain, "rpc", _rpc_factory({"input": _calldata("cd" * 32), "blockNumber": "0x64"}))
    result = await verify_onchain_anchor({"network": "SEPOLIA", "anchor_tx_hash": "0x" + "11" * 32, "merkle_root": ROOT})
    assert result["onchain_verified"] is False
    assert result["reason"] == "ROOT_MISMATCH"


@pytest.mark.asyncio
async def test_onchain_local_simulation_is_not_on_chain():
    result = await verify_onchain_anchor({"network": "LOCAL_SIMULATION", "anchor_tx_hash": "0xabc", "merkle_root": ROOT})
    assert result["onchain_verified"] is False
    assert result["reason"] == "NOT_ON_CHAIN"


@pytest.mark.asyncio
async def test_onchain_tx_not_found(monkeypatch):
    monkeypatch.setattr(trustchain, "rpc", _rpc_factory(None))
    result = await verify_onchain_anchor({"network": "SEPOLIA", "anchor_tx_hash": "0x" + "11" * 32, "merkle_root": ROOT})
    assert result["reason"] == "TX_NOT_FOUND"


@pytest.mark.asyncio
async def test_onchain_pending_transaction(monkeypatch):
    monkeypatch.setattr(trustchain, "rpc", _rpc_factory({"input": _calldata(ROOT), "blockNumber": None}))
    result = await verify_onchain_anchor({"network": "SEPOLIA", "anchor_tx_hash": "0x" + "11" * 32, "merkle_root": ROOT})
    assert result["confirmations"] == 0
    assert result["reason"] == "TX_PENDING"
    assert result["onchain_verified"] is True  # root still matches even while pending


# ---- endpoints --------------------------------------------------------------

def test_verify_anchor_onchain_endpoint(client, monkeypatch):
    api, db, *_ = client
    db.fetchrow_results.append({
        "id": uuid4(), "merkle_root": ROOT, "from_position": 1, "to_position": 5,
        "network": "SEPOLIA", "anchor_tx_hash": "0x" + "11" * 32, "block_number": 100,
        "explorer_url": "https://sepolia.example/tx/0xtx", "status": "CONFIRMED", "anchored_at": None,
    })

    async def fake_verify(_anchor):
        return {"onchain_verified": True, "confirmations": 12, "reason": "VERIFIED"}

    monkeypatch.setattr(main, "verify_onchain_anchor", fake_verify)
    body = api.get(f"/transparency/anchors/{uuid4()}/verify-onchain").json()
    assert body["onchain"]["onchain_verified"] is True
    assert body["network"] == "SEPOLIA"


def test_verify_anchor_onchain_404_and_503(client, monkeypatch):
    api, db, *_ = client
    db.fetchrow_results.append(None)
    assert api.get(f"/transparency/anchors/{uuid4()}/verify-onchain").status_code == 404

    db.fetchrow_results.append({
        "id": uuid4(), "merkle_root": ROOT, "from_position": 1, "to_position": 5,
        "network": "SEPOLIA", "anchor_tx_hash": "0x" + "11" * 32, "block_number": 100,
        "explorer_url": None, "status": "PENDING", "anchored_at": None,
    })

    async def boom(_anchor):
        raise RuntimeError("rpc down")

    monkeypatch.setattr(main, "verify_onchain_anchor", boom)
    assert api.get(f"/transparency/anchors/{uuid4()}/verify-onchain").status_code == 503


def test_export_merkle_proof_bundle(client, monkeypatch):
    api, *_ = client

    async def fake_proof(_db, position):
        return {
            "ledger_position": position, "leaf_hash": "a" * 64, "leaf_index": 1,
            "proof": [{"direction": "LEFT", "hash": "b" * 64}], "merkle_root": "c" * 64,
            "proof_valid": True, "anchor": {"status": "SIMULATED"},
        }

    monkeypatch.setattr(main, "proof_for_position", fake_proof)
    body = api.get("/transparency/proofs/1/export").json()
    assert body["schema"] == "charityconnect-merkle-proof-v1"
    assert body["merkle_root"] == "c" * 64
    assert "SHA-256" in body["verify_instructions"] or body["algorithm"] == "SHA-256"


def test_export_merkle_proof_404(client, monkeypatch):
    api, *_ = client

    async def none_proof(_db, _position):
        return None

    monkeypatch.setattr(main, "proof_for_position", none_proof)
    assert api.get("/transparency/proofs/999/export").status_code == 404


# ---- admin anchor health dashboard -----------------------------------------

def test_anchors_health_summarizes_onchain_and_issues(client):
    api, db, *_ = client
    db.fetch_results.append([
        {"status": "SIMULATED", "network": "LOCAL_SIMULATION", "n": 2},
        {"status": "CONFIRMED", "network": "SEPOLIA", "n": 1},
        {"status": "FAILED", "network": "SEPOLIA", "n": 1},
    ])
    db.fetchval_results.append(3)  # unanchored entries
    db.fetchrow_results.append({
        "anchor_id": "a1", "network": "SEPOLIA", "status": "CONFIRMED",
        "anchor_tx_hash": "0x" + "11" * 32, "block_number": 100,
        "explorer_url": "https://sepolia.example/tx", "anchored_at": None,
    })
    db.fetch_results.append([])  # verify_ledger reads an empty ledger -> valid
    body = api.get("/transparency/anchors/health").json()
    assert body["total_anchors"] == 4
    assert body["onchain_anchors"] == 2
    assert body["simulated_anchors"] == 2
    assert body["unanchored_entries"] == 3
    assert body["statuses"]["FAILED"] == 1
    assert body["chain_valid"] is True
    assert any("chưa neo" in issue for issue in body["issues"])
    assert any("FAILED" in issue for issue in body["issues"])
    assert body["latest_anchor"]["network"] == "SEPOLIA"


def test_anchors_health_clean_when_all_anchored(client):
    api, db, *_ = client
    db.fetch_results.append([{"status": "SIMULATED", "network": "LOCAL_SIMULATION", "n": 1}])
    db.fetchval_results.append(0)
    db.fetchrow_results.append(None)
    db.fetch_results.append([])
    body = api.get("/transparency/anchors/health").json()
    assert body["issues"] == []
    assert "hợp lệ" in body["recommendation"]
    assert body["latest_anchor"] is None
