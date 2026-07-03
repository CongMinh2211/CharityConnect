import hashlib

import pytest

from app import trustchain
from app.domain import merkle_proof, merkle_root
from app.trustchain import create_anchor, proof_for_position, rpc


def leaf(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


# ---- rpc(): success + JSON-RPC error path -----------------------------------

class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self, payload):
        self._payload = payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def post(self, _url, json):  # noqa: A002 - mirrors httpx signature
        return _FakeResponse(self._payload)


@pytest.mark.asyncio
async def test_rpc_returns_result(monkeypatch):
    monkeypatch.setattr(trustchain, "ANCHOR_RPC_URL", "http://node.local")
    monkeypatch.setattr(trustchain.httpx, "AsyncClient", lambda *a, **k: _FakeClient({"result": "0x10"}))
    assert await rpc("eth_blockNumber", []) == "0x10"


@pytest.mark.asyncio
async def test_rpc_raises_on_jsonrpc_error(monkeypatch):
    monkeypatch.setattr(trustchain, "ANCHOR_RPC_URL", "http://node.local")
    monkeypatch.setattr(trustchain.httpx, "AsyncClient", lambda *a, **k: _FakeClient({"error": {"message": "boom"}}))
    with pytest.raises(RuntimeError, match="boom"):
        await rpc("eth_blockNumber", [])


# ---- proof_for_position(): fully anchored entry returns a valid proof -------

class _ProofDatabase:
    def __init__(self, row):
        self._row = row

    async def fetchrow(self, *_args):
        return self._row


@pytest.mark.asyncio
async def test_proof_for_position_anchored_entry_is_valid():
    leaves = [leaf("a"), leaf("b"), leaf("c")]
    root = merkle_root(leaves)
    row = {
        "position": 2, "entry_hash": leaves[1], "leaf_index": 1,
        "merkle_proof": merkle_proof(leaves, 1), "anchor_id": "anchor-1",
        "merkle_root": root, "network": "LOCAL_SIMULATION", "anchor_tx_hash": "0x0",
        "block_number": 3, "explorer_url": None, "status": "SIMULATED", "anchored_at": "now",
    }
    result = await proof_for_position(_ProofDatabase(row), 2)
    assert result["proof_valid"] is True
    assert result["anchor"]["status"] == "SIMULATED"
    assert result["leaf_index"] == 1


# ---- create_anchor(): SEPOLIA confirmed + failure branches ------------------

class _Txn:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None


class _Conn:
    def __init__(self, rows):
        self.rows = rows
        self.anchor = {"id": "anchor-1", "merkle_root": "", "from_position": 1,
                       "to_position": len(rows), "network": "SEPOLIA", "status": "PENDING"}

    def transaction(self):
        return _Txn()

    async def execute(self, *_args):
        return "OK"

    async def fetch(self, _query):
        return self.rows

    async def fetchrow(self, query, *args):
        if "INSERT INTO ledger_anchors" in query:
            self.anchor["merkle_root"] = args[0]
            return self.anchor
        return None


class _Acquire:
    def __init__(self, conn):
        self.conn = conn

    async def __aenter__(self):
        return self.conn

    async def __aexit__(self, *_args):
        return None


class _SepoliaDatabase:
    def __init__(self, rows):
        self.conn = _Conn(rows)
        self.updated = None

    def acquire(self):
        return _Acquire(self.conn)

    async def fetchrow(self, query, *args):
        # The post-transaction UPDATE ledger_anchors call.
        self.updated = {"query": query, "args": args}
        status = "FAILED" if "status='FAILED'" in query else args[2]
        return {**self.conn.anchor, "status": status}


@pytest.fixture
def _sepolia_env(monkeypatch):
    monkeypatch.setattr(trustchain, "ANCHOR_RPC_URL", "http://node.local")
    monkeypatch.setattr(trustchain, "ANCHOR_PRIVATE_KEY", "0xkey")
    monkeypatch.setattr(trustchain, "ANCHOR_EXPLORER_URL", "https://sepolia.example/tx")


@pytest.mark.asyncio
async def test_create_anchor_sepolia_confirmed(monkeypatch, _sepolia_env):
    async def fake_send(_root):
        return "0xabc", 123, "CONFIRMED"

    monkeypatch.setattr(trustchain, "send_sepolia_anchor", fake_send)
    rows = [{"position": i + 1, "entry_hash": leaf(str(i))} for i in range(2)]
    db = _SepoliaDatabase(rows)
    result = await create_anchor(db, "00000000-0000-0000-0000-000000000001")
    assert result["status"] == "CONFIRMED"
    assert "0xabc" in db.updated["args"]


@pytest.mark.asyncio
async def test_create_anchor_sepolia_failure_marks_failed(monkeypatch, _sepolia_env):
    async def boom(_root):
        raise RuntimeError("rpc down")

    monkeypatch.setattr(trustchain, "send_sepolia_anchor", boom)
    rows = [{"position": i + 1, "entry_hash": leaf(str(i))} for i in range(2)]
    db = _SepoliaDatabase(rows)
    result = await create_anchor(db, "00000000-0000-0000-0000-000000000001")
    assert result["status"] == "FAILED"
