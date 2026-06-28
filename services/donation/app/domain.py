import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any

GENESIS_HASH = "0" * 64


def _hash_pair(left: str, right: str) -> str:
    return hashlib.sha256(bytes.fromhex(left) + bytes.fromhex(right)).hexdigest()


def merkle_root(leaves: list[str]) -> str:
    if not leaves:
        raise ValueError("Merkle tree requires at least one leaf")
    level = [leaf.lower() for leaf in leaves]
    if any(not re.fullmatch(r"[0-9a-f]{64}", leaf) for leaf in level):
        raise ValueError("Merkle leaves must be SHA-256 hex values")
    while len(level) > 1:
        if len(level) % 2: level.append(level[-1])
        level = [_hash_pair(level[index], level[index + 1]) for index in range(0, len(level), 2)]
    return level[0]


def merkle_proof(leaves: list[str], leaf_index: int) -> list[dict[str, str]]:
    if leaf_index < 0 or leaf_index >= len(leaves):
        raise IndexError("Leaf index is outside the tree")
    proof: list[dict[str, str]] = []
    index = leaf_index
    level = [leaf.lower() for leaf in leaves]
    while len(level) > 1:
        if len(level) % 2: level.append(level[-1])
        sibling_index = index - 1 if index % 2 else index + 1
        proof.append({"hash": level[sibling_index], "direction": "LEFT" if sibling_index < index else "RIGHT"})
        level = [_hash_pair(level[offset], level[offset + 1]) for offset in range(0, len(level), 2)]
        index //= 2
    return proof


def verify_merkle_proof(leaf: str, proof: list[dict[str, str]], expected_root: str) -> bool:
    value = leaf.lower()
    try:
        for node in proof:
            value = _hash_pair(node["hash"], value) if node["direction"] == "LEFT" else _hash_pair(value, node["hash"])
    except (KeyError, ValueError):
        return False
    return value == expected_root.lower()


def make_receipt_number(donation_id: str, created_at: datetime | None = None) -> str:
    instant = created_at or datetime.now(timezone.utc)
    return f"CC-{instant:%Y%m%d}-{donation_id.replace('-', '')[:10].upper()}"


def public_donor_name(donor_name: str, anonymous: bool) -> str:
    return "Ẩn danh" if anonymous else donor_name


def utc_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def ledger_hash(
    *, position: int, event_id: str, event_type: str, campaign_id: str,
    entity_id: str, public_payload: dict[str, Any], previous_hash: str,
    created_at: datetime,
) -> str:
    record = {
        "campaign_id": campaign_id,
        "created_at": utc_iso(created_at),
        "entity_id": entity_id,
        "event_id": event_id,
        "event_type": event_type,
        "position": position,
        "previous_hash": previous_hash,
        "public_payload": public_payload,
        "version": 1,
    }
    return hashlib.sha256(canonical_json(record).encode("utf-8")).hexdigest()


async def append_ledger_entry(
    connection: Any, *, event_id: str, event_type: str, campaign_id: str,
    entity_id: str, public_payload: dict[str, Any], created_at: datetime,
) -> dict[str, Any]:
    """Append exactly once while holding a transaction-scoped PostgreSQL lock."""
    await connection.execute("SELECT pg_advisory_xact_lock(hashtext('charityconnect-ledger'))")
    existing = await connection.fetchrow(
        "SELECT position,entry_hash FROM ledger_entries WHERE event_id=$1", event_id
    )
    if existing:
        return {"position": existing["position"], "entry_hash": existing["entry_hash"], "duplicate": True}

    previous = await connection.fetchrow(
        "SELECT position,entry_hash FROM ledger_entries ORDER BY position DESC LIMIT 1"
    )
    position = int(previous["position"]) + 1 if previous else 1
    previous_hash = previous["entry_hash"] if previous else GENESIS_HASH
    entry_hash = ledger_hash(
        position=position, event_id=event_id, event_type=event_type,
        campaign_id=campaign_id, entity_id=entity_id,
        public_payload=public_payload, previous_hash=previous_hash,
        created_at=created_at,
    )
    row = await connection.fetchrow(
        """INSERT INTO ledger_entries(
               position,event_id,event_type,campaign_id,entity_id,public_payload,
               previous_hash,entry_hash,created_at
           ) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)
           RETURNING position,entry_hash""",
        position, event_id, event_type, campaign_id, entity_id,
        canonical_json(public_payload), previous_hash, entry_hash, created_at,
    )
    return {"position": row["position"], "entry_hash": row["entry_hash"], "duplicate": False}
