import hashlib
import json

import pytest

from app.domain import merkle_proof, merkle_root, verify_merkle_proof
from app import trustchain
from app.trustchain import anchor_mode, create_anchor, proof_for_position


def leaf(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


@pytest.mark.parametrize("count", [1, 2, 3, 4, 5])
def test_merkle_proof_is_valid_for_even_and_odd_trees(count):
    leaves = [leaf(str(index)) for index in range(count)]
    root = merkle_root(leaves)
    assert len(root) == 64
    for index, item in enumerate(leaves):
        assert verify_merkle_proof(item, merkle_proof(leaves, index), root)


def test_merkle_proof_detects_modified_leaf_node_and_root():
    leaves = [leaf("a"), leaf("b"), leaf("c")]
    root = merkle_root(leaves)
    proof = merkle_proof(leaves, 1)
    assert not verify_merkle_proof(leaf("changed"), proof, root)
    modified = [{**node, "hash": leaf("changed")} if index == 0 else node for index, node in enumerate(proof)]
    assert not verify_merkle_proof(leaves[1], modified, root)
    assert not verify_merkle_proof(leaves[1], proof, leaf("other-root"))
    assert not verify_merkle_proof(leaves[1], [{"direction": "LEFT"}], root)


def test_merkle_rejects_empty_invalid_and_out_of_range_inputs():
    with pytest.raises(ValueError): merkle_root([])
    with pytest.raises(ValueError): merkle_root(["not-a-hash"])
    with pytest.raises(IndexError): merkle_proof([leaf("a")], 1)


class Transaction:
    async def __aenter__(self): return self
    async def __aexit__(self, *_args): return None


class Connection:
    def __init__(self, rows):
        self.rows = rows
        self.anchor = {
            "id": "anchor-1", "merkle_root": "", "from_position": 1, "to_position": len(rows),
            "network": "LOCAL_SIMULATION", "anchor_tx_hash": "0x0", "block_number": len(rows),
            "explorer_url": None, "status": "SIMULATED", "anchored_at": "now", "confirmed_at": "now",
        }
        self.entry_inserts = []

    def transaction(self): return Transaction()
    async def execute(self, query, *args):
        if "INSERT INTO anchor_entries" in query: self.entry_inserts.append(args)
        return "OK"
    async def fetch(self, _query): return self.rows
    async def fetchrow(self, query, *args):
        if "INSERT INTO ledger_anchors" in query:
            self.anchor["merkle_root"] = args[0]
            self.anchor["anchor_tx_hash"] = args[4]
            return self.anchor
        return None


class Acquire:
    def __init__(self, connection): self.connection = connection
    async def __aenter__(self): return self.connection
    async def __aexit__(self, *_args): return None


class Database:
    def __init__(self, rows): self.connection = Connection(rows)
    def acquire(self): return Acquire(self.connection)


@pytest.mark.asyncio
async def test_simulated_anchor_covers_contiguous_rows_once(monkeypatch):
    monkeypatch.setattr("app.trustchain.ANCHOR_RPC_URL", "")
    monkeypatch.setattr("app.trustchain.ANCHOR_PRIVATE_KEY", "")
    rows = [{"position": index + 1, "entry_hash": leaf(str(index))} for index in range(3)]
    db = Database(rows)
    result = await create_anchor(db, "00000000-0000-0000-0000-000000000001")
    assert anchor_mode() == "LOCAL_SIMULATION"
    assert result["status"] == "SIMULATED"
    assert result["from_position"] == 1 and result["to_position"] == 3
    assert len(db.connection.entry_inserts) == 3
    for index, inserted in enumerate(db.connection.entry_inserts):
        proof = json.loads(inserted[3])
        assert verify_merkle_proof(rows[index]["entry_hash"], proof, result["merkle_root"])


@pytest.mark.asyncio
async def test_anchor_rejects_when_no_unanchored_entries():
    with pytest.raises(ValueError, match="NO_UNANCHORED_ENTRIES"):
        await create_anchor(Database([]), "00000000-0000-0000-0000-000000000001")


class ProofDatabase:
    def __init__(self, row): self.row = row
    async def fetchrow(self, *_args): return self.row


@pytest.mark.asyncio
async def test_proof_for_position_handles_missing_and_unanchored():
    assert await proof_for_position(ProofDatabase(None), 9) is None
    result = await proof_for_position(ProofDatabase({"position": 2, "entry_hash": leaf("x"), "anchor_id": None}), 2)
    assert result["anchor"] is None
    assert result["proof_valid"] is False


@pytest.mark.asyncio
async def test_sepolia_anchor_signs_eip1559_without_sending_real_transaction(monkeypatch):
    calls = []
    responses = iter(["0x2", "0x3b9aca00", {"baseFeePerGas": "0x77359400"}, "0xtx", {"status": "0x1", "blockNumber": "0x64"}])

    async def fake_rpc(method, params):
        calls.append((method, params))
        return next(responses)

    signed = type("Signed", (), {"raw_transaction": bytes.fromhex("1234")})()
    monkeypatch.setattr(trustchain, "ANCHOR_PRIVATE_KEY", "test-key")
    monkeypatch.setattr(trustchain, "rpc", fake_rpc)
    monkeypatch.setattr(trustchain.asyncio, "sleep", lambda _seconds: _no_sleep())
    monkeypatch.setattr(trustchain.Account, "from_key", lambda _key: type("Account", (), {"address": "0x0000000000000000000000000000000000000001"})())
    captured = {}

    def sign(transaction, _key):
        captured.update(transaction)
        return signed

    monkeypatch.setattr(trustchain.Account, "sign_transaction", sign)
    tx_hash, block, status = await trustchain.send_sepolia_anchor(leaf("root"))
    assert (tx_hash, block, status) == ("0xtx", 100, "CONFIRMED")
    assert captured["type"] == 2
    assert "gasPrice" not in captured
    assert captured["maxFeePerGas"] > captured["maxPriorityFeePerGas"]
    assert calls[-2][0] == "eth_sendRawTransaction"


async def _no_sleep():
    return None
