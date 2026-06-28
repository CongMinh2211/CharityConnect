import asyncio
from datetime import datetime, timezone

from app.domain import (
    GENESIS_HASH,
    append_ledger_entry,
    canonical_json,
    ledger_hash,
    make_receipt_number,
    public_donor_name,
)


def test_receipt_number_is_stable_and_human_readable():
    number = make_receipt_number("12345678-1234-1234-1234-123456789000", datetime(2026, 6, 21, tzinfo=timezone.utc))
    assert number == "CC-20260621-1234567812"


def test_anonymous_donation_hides_identity_from_organization():
    assert public_donor_name("Nguyễn An", True) == "Ẩn danh"
    assert public_donor_name("Nguyễn An", False) == "Nguyễn An"


def test_canonical_json_and_genesis_hash_are_deterministic():
    assert canonical_json({"z": 1, "a": {"b": 2, "a": "Từ thiện"}}) == '{"a":{"a":"Từ thiện","b":2},"z":1}'
    assert GENESIS_HASH == "0" * 64
    options = dict(
        position=1,
        event_id="11111111-1111-1111-1111-111111111111",
        event_type="DONATION_COMPLETED",
        campaign_id="22222222-2222-2222-2222-222222222222",
        entity_id="11111111-1111-1111-1111-111111111111",
        public_payload={"amount": 100000, "receipt_number": "CC-001"},
        previous_hash=GENESIS_HASH,
        created_at=datetime(2026, 6, 21, tzinfo=timezone.utc),
    )
    value = ledger_hash(**options)
    assert len(value) == 64
    options["public_payload"] = {"receipt_number": "CC-001", "amount": 100000}
    assert value == ledger_hash(**options)


class FakeLedgerConnection:
    def __init__(self):
        self.rows = [None, None, {"position": 1, "entry_hash": "a" * 64}]
        self.executed = []

    async def execute(self, query, *args):
        self.executed.append((query, args))

    async def fetchrow(self, query, *args):
        self.executed.append((query, args))
        return self.rows.pop(0)


def test_append_ledger_entry_takes_lock_and_never_exposes_donor():
    connection = FakeLedgerConnection()
    result = asyncio.run(append_ledger_entry(
        connection,
        event_id="11111111-1111-1111-1111-111111111111",
        event_type="DONATION_COMPLETED",
        campaign_id="22222222-2222-2222-2222-222222222222",
        entity_id="11111111-1111-1111-1111-111111111111",
        public_payload={"amount": 100000, "receipt_number": "CC-001"},
        created_at=datetime(2026, 6, 21, tzinfo=timezone.utc),
    ))
    assert result == {"position": 1, "entry_hash": "a" * 64, "duplicate": False}
    serialized = " ".join(str(item) for item in connection.executed)
    assert "pg_advisory_xact_lock" in serialized
    assert "donor" not in serialized.lower()
