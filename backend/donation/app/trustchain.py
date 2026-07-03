import asyncio
import hashlib
import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import httpx
from eth_account import Account

from .config import ANCHOR_CHAIN_ID, ANCHOR_EXPLORER_URL, ANCHOR_PRIVATE_KEY, ANCHOR_RPC_URL
from .domain import merkle_proof, merkle_root, verify_merkle_proof


def anchor_mode() -> str:
    return "SEPOLIA" if ANCHOR_RPC_URL and ANCHOR_PRIVATE_KEY else "LOCAL_SIMULATION"


async def rpc(method: str, params: list[Any]) -> Any:
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(ANCHOR_RPC_URL, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
        response.raise_for_status()
        payload = response.json()
        if payload.get("error"): raise RuntimeError(payload["error"].get("message", "Blockchain RPC error"))
        return payload.get("result")


async def send_sepolia_anchor(root: str) -> tuple[str, int | None, str]:
    account = Account.from_key(ANCHOR_PRIVATE_KEY)
    nonce = int(await rpc("eth_getTransactionCount", [account.address, "pending"]), 16)
    priority_fee = int(await rpc("eth_maxPriorityFeePerGas", []), 16)
    latest_block = await rpc("eth_getBlockByNumber", ["latest", False])
    base_fee = int(latest_block["baseFeePerGas"], 16)
    max_fee = base_fee * 2 + priority_fee
    data = "0x" + (b"CHARITYCONNECT:MERKLE:" + bytes.fromhex(root)).hex()
    transaction = {
        "type": 2, "nonce": nonce, "gas": 70000,
        "maxFeePerGas": max_fee, "maxPriorityFeePerGas": priority_fee,
        "to": account.address, "value": 0, "data": data, "chainId": ANCHOR_CHAIN_ID,
    }
    signed = Account.sign_transaction(transaction, ANCHOR_PRIVATE_KEY)
    tx_hash = await rpc("eth_sendRawTransaction", ["0x" + signed.raw_transaction.hex()])
    for _ in range(6):
        await asyncio.sleep(2)
        receipt = await rpc("eth_getTransactionReceipt", [tx_hash])
        if receipt:
            status = "CONFIRMED" if int(receipt.get("status", "0x0"), 16) == 1 else "FAILED"
            return tx_hash, int(receipt["blockNumber"], 16), status
    return tx_hash, None, "PENDING"


async def create_anchor(db: Any, created_by: UUID) -> dict[str, Any]:
    async with db.acquire() as connection:
        async with connection.transaction():
            await connection.execute("SELECT pg_advisory_xact_lock(hashtext('charityconnect-anchor'))")
            rows = await connection.fetch(
                """SELECT l.position,l.entry_hash FROM ledger_entries l
                   LEFT JOIN anchor_entries ae ON ae.ledger_position=l.position
                   WHERE ae.ledger_position IS NULL ORDER BY l.position LIMIT 100"""
            )
            if not rows: raise ValueError("NO_UNANCHORED_ENTRIES")
            leaves = [row["entry_hash"].strip() for row in rows]
            root = merkle_root(leaves)
            from_position, to_position = rows[0]["position"], rows[-1]["position"]
            mode = anchor_mode()
            timestamp = datetime.now(timezone.utc).isoformat()
            simulated_hash = "0x" + hashlib.sha256(f"SIMULATED|{root}|{from_position}|{to_position}|{timestamp}".encode()).hexdigest()
            anchor = await connection.fetchrow(
                """INSERT INTO ledger_anchors(merkle_root,from_position,to_position,network,anchor_tx_hash,block_number,explorer_url,status,created_by,confirmed_at)
                   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,CASE WHEN $8='SIMULATED' THEN now() ELSE NULL END)
                   RETURNING *""",
                root, from_position, to_position, mode, simulated_hash, to_position if mode == "LOCAL_SIMULATION" else None,
                None, "SIMULATED" if mode == "LOCAL_SIMULATION" else "PENDING", created_by,
            )
            for index, row in enumerate(rows):
                await connection.execute(
                    "INSERT INTO anchor_entries(anchor_id,ledger_position,leaf_index,merkle_proof) VALUES($1,$2,$3,$4::jsonb)",
                    anchor["id"], row["position"], index, json.dumps(merkle_proof(leaves, index)),
                )
    if mode == "SEPOLIA":
        try:
            tx_hash, block_number, status = await send_sepolia_anchor(root)
            explorer = f"{ANCHOR_EXPLORER_URL.rstrip('/')}/{tx_hash}"
            anchor = await db.fetchrow(
                """UPDATE ledger_anchors SET anchor_tx_hash=$1,block_number=$2,status=$3,explorer_url=$4,
                   confirmed_at=CASE WHEN $3='CONFIRMED' THEN now() ELSE NULL END WHERE id=$5 RETURNING *""",
                tx_hash, block_number, status, explorer, anchor["id"],
            )
        except Exception as error:
            anchor = await db.fetchrow("UPDATE ledger_anchors SET status='FAILED',last_error=$1 WHERE id=$2 RETURNING *", str(error)[:500], anchor["id"])
    return dict(anchor)


async def proof_for_position(db: Any, position: int) -> dict[str, Any] | None:
    row = await db.fetchrow(
        """SELECT l.position,l.entry_hash,ae.leaf_index,ae.merkle_proof,a.id AS anchor_id,a.merkle_root,
                  a.network,a.anchor_tx_hash,a.block_number,a.explorer_url,a.status,a.anchored_at
           FROM ledger_entries l LEFT JOIN anchor_entries ae ON ae.ledger_position=l.position
           LEFT JOIN ledger_anchors a ON a.id=ae.anchor_id WHERE l.position=$1""", position,
    )
    if not row: return None
    if not row["anchor_id"]:
        return {"ledger_position": position, "leaf_hash": row["entry_hash"].strip(), "proof": [], "merkle_root": None, "proof_valid": False, "anchor": None}
    proof = row["merkle_proof"] if isinstance(row["merkle_proof"], list) else json.loads(row["merkle_proof"])
    anchor = {key: row[key] for key in ["anchor_id", "network", "anchor_tx_hash", "block_number", "explorer_url", "status", "anchored_at"]}
    return {"ledger_position": position, "leaf_hash": row["entry_hash"].strip(), "leaf_index": row["leaf_index"], "proof": proof, "merkle_root": row["merkle_root"].strip(), "proof_valid": verify_merkle_proof(row["entry_hash"].strip(), proof, row["merkle_root"].strip()), "anchor": anchor}


PREFIX = b"CHARITYCONNECT:MERKLE:"


def decode_anchor_calldata(data: str | None) -> str | None:
    """Decode the Merkle root stored in a Sepolia anchor transaction's calldata.

    send_sepolia_anchor writes ``0x`` + b"CHARITYCONNECT:MERKLE:" + bytes.fromhex(root),
    so anyone can read the transaction input back and recover the anchored root."""
    if not data or not isinstance(data, str):
        return None
    hex_str = data[2:] if data.startswith("0x") else data
    try:
        raw = bytes.fromhex(hex_str)
    except ValueError:
        return None
    if not raw.startswith(PREFIX):
        return None
    return raw[len(PREFIX):].hex()


async def verify_onchain_anchor(anchor: dict[str, Any]) -> dict[str, Any]:
    """Independently confirm a Sepolia anchor: read the transaction back from the
    chain, decode its calldata and check the on-chain Merkle root matches what we
    stored, plus how many confirmations it has. No wallet or token involved."""
    tx_hash = anchor.get("anchor_tx_hash")
    network = anchor.get("network")
    expected_root = (anchor.get("merkle_root") or "").strip().lower()
    result: dict[str, Any] = {
        "onchain_verified": False,
        "network": network,
        "tx_hash": tx_hash,
        "expected_root": expected_root or None,
        "onchain_root": None,
        "confirmations": 0,
        "explorer_url": anchor.get("explorer_url"),
        "reason": None,
    }
    if network != "SEPOLIA" or not tx_hash or not str(tx_hash).startswith("0x") or len(str(tx_hash)) < 10:
        result["reason"] = "NOT_ON_CHAIN"
        return result
    transaction = await rpc("eth_getTransactionByHash", [tx_hash])
    if not transaction:
        result["reason"] = "TX_NOT_FOUND"
        return result
    onchain_root = decode_anchor_calldata(transaction.get("input"))
    result["onchain_root"] = onchain_root
    block_hex = transaction.get("blockNumber")
    if block_hex:
        latest = await rpc("eth_blockNumber", [])
        if latest:
            result["confirmations"] = max(0, int(latest, 16) - int(block_hex, 16) + 1)
    else:
        result["reason"] = "TX_PENDING"
    result["onchain_verified"] = bool(onchain_root and onchain_root.lower() == expected_root)
    if result["onchain_verified"] and result["reason"] is None:
        result["reason"] = "VERIFIED"
    elif not result["onchain_verified"] and result["reason"] is None:
        result["reason"] = "ROOT_MISMATCH"
    return result
