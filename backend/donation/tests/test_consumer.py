import asyncio
import json

import pytest

import app.main as main
from tests.test_api import FakeDB


def _fields():
    return {
        "public_payload": json.dumps({"amount": 50000, "receipt_number": "CC-001"}),
        "created_at": "2026-06-21T00:00:00Z",
        "event_id": "11111111-1111-1111-1111-111111111111",
        "event_type": "DONATION_COMPLETED",
        "campaign_id": "22222222-2222-2222-2222-222222222222",
        "entity_id": "11111111-1111-1111-1111-111111111111",
    }


def _message():
    return [("transparency.record", [("1-0", _fields())])]


class FakeStreamRedis:
    """xreadgroup returns each queued batch in turn, then raises CancelledError
    to break the otherwise-infinite consumer loop."""

    def __init__(self, batches, group_error=None):
        self.batches = batches
        self.group_error = group_error
        self.calls = 0
        self.acked = []

    async def xgroup_create(self, *_a, **_k):
        if self.group_error:
            raise self.group_error
        return None

    async def xreadgroup(self, *_a, **_k):
        if self.calls >= len(self.batches):
            raise asyncio.CancelledError
        batch = self.batches[self.calls]
        self.calls += 1
        return batch

    async def xack(self, *args):
        self.acked.append(args)
        return 1


def _app(db, redis):
    return type("App", (), {"state": type("S", (), {"db": db, "redis": redis})()})()


@pytest.mark.asyncio
async def test_consumer_appends_and_acks_message(monkeypatch):
    async def fake_append(_conn, **_kw):
        return {"duplicate": False}

    monkeypatch.setattr(main, "append_ledger_entry", fake_append)
    redis = FakeStreamRedis([_message()])
    with pytest.raises(asyncio.CancelledError):
        await main.consume_transparency_events(_app(FakeDB(), redis))
    assert redis.acked and redis.acked[0][2] == "1-0"


@pytest.mark.asyncio
async def test_consumer_falls_back_to_new_messages_when_backlog_empty(monkeypatch):
    async def fake_append(_conn, **_kw):
        return {"duplicate": True}  # duplicate path skips the metric increment

    monkeypatch.setattr(main, "append_ledger_entry", fake_append)
    redis = FakeStreamRedis([[], _message()])  # "0" backlog empty -> read ">" new
    with pytest.raises(asyncio.CancelledError):
        await main.consume_transparency_events(_app(FakeDB(), redis))
    assert redis.acked[0][2] == "1-0"


@pytest.mark.asyncio
async def test_consumer_ignores_busygroup_on_create(monkeypatch):
    redis = FakeStreamRedis([], group_error=Exception("BUSYGROUP Consumer Group name already exists"))
    with pytest.raises(asyncio.CancelledError):
        await main.consume_transparency_events(_app(FakeDB(), redis))


@pytest.mark.asyncio
async def test_consumer_reraises_unexpected_group_error():
    redis = FakeStreamRedis([], group_error=RuntimeError("redis offline"))
    with pytest.raises(RuntimeError, match="redis offline"):
        await main.consume_transparency_events(_app(FakeDB(), redis))


@pytest.mark.asyncio
async def test_consumer_survives_processing_errors(monkeypatch):
    async def boom(_conn, **_kw):
        raise ValueError("append failed")

    async def stop_sleep(_seconds):
        raise asyncio.CancelledError

    monkeypatch.setattr(main, "append_ledger_entry", boom)
    monkeypatch.setattr(main.asyncio, "sleep", stop_sleep)
    redis = FakeStreamRedis([_message()])
    with pytest.raises(asyncio.CancelledError):
        await main.consume_transparency_events(_app(FakeDB(), redis))


@pytest.mark.asyncio
async def test_lifespan_initializes_state_and_closes(monkeypatch):
    class Pool:
        async def close(self):
            return None

    class RedisClient:
        async def aclose(self):
            return None

    async def fake_pool(*_a, **_k):
        return Pool()

    async def noop(_app):
        return None

    class HttpClient:
        async def aclose(self):
            return None

    monkeypatch.setattr(main.asyncpg, "create_pool", fake_pool)
    monkeypatch.setattr(main.Redis, "from_url", lambda *_a, **_k: RedisClient())
    monkeypatch.setattr(main.httpx, "AsyncClient", lambda *_a, **_k: HttpClient())
    monkeypatch.setattr(main, "publish_outbox", noop)
    monkeypatch.setattr(main, "consume_transparency_events", noop)
    async with main.lifespan(main.app):
        assert main.app.state.db is not None
        assert main.app.state.redis is not None
