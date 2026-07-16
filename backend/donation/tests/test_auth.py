import jwt
import pytest
from fastapi import HTTPException
from types import SimpleNamespace

from app.auth import require_role, require_user
from app.config import JWT_SECRET


class FakeResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class FakeHttp:
    def __init__(self, response=None, error: Exception | None = None):
        self.response = response
        self.error = error
        self.calls = []

    async def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        if self.error:
            raise self.error
        return self.response


def fake_request(http):
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(http=http)))


@pytest.mark.asyncio
async def test_require_user_decodes_valid_bearer_token():
    token = jwt.encode({"sub": "u1", "email": "a@test.vn", "name": "A", "role": "DONOR"}, JWT_SECRET, algorithm="HS256")
    user = await require_user(SimpleNamespace(), f"Bearer {token}")
    assert user.id == "u1"
    assert user.role == "DONOR"


@pytest.mark.parametrize("header", [None, "Basic abc", "Bearer invalid"])
@pytest.mark.asyncio
async def test_require_user_rejects_missing_or_invalid_tokens(header):
    with pytest.raises(HTTPException) as caught:
        await require_user(SimpleNamespace(), header)
    assert caught.value.status_code == 401


@pytest.mark.asyncio
async def test_require_role_enforces_exact_role():
    token = jwt.encode({"sub": "u1", "email": "a@test.vn", "name": "A", "role": "DONOR"}, JWT_SECRET, algorithm="HS256")
    user = await require_user(SimpleNamespace(), f"Bearer {token}")
    require_role(user, "DONOR")
    with pytest.raises(HTTPException) as caught:
        require_role(user, "ADMIN")
    assert caught.value.status_code == 403


@pytest.mark.asyncio
async def test_require_user_checks_database_backed_session():
    token = jwt.encode(
        {"sub": "u1", "email": "a@test.vn", "name": "A", "role": "DONOR", "session_id": "session-1"},
        JWT_SECRET,
        algorithm="HS256",
    )
    http = FakeHttp(FakeResponse(200, {"active": True, "user_status": "ACTIVE"}))
    user = await require_user(fake_request(http), f"Bearer {token}")
    assert user.session_id == "session-1"
    assert http.calls[0][1]["params"] == {"user_id": "u1"}
    assert "x-internal-token" in http.calls[0][1]["headers"]


@pytest.mark.asyncio
async def test_require_user_rejects_revoked_session():
    token = jwt.encode(
        {"sub": "u1", "email": "a@test.vn", "name": "A", "role": "DONOR", "session_id": "revoked"},
        JWT_SECRET,
        algorithm="HS256",
    )
    with pytest.raises(HTTPException) as caught:
        await require_user(fake_request(FakeHttp(FakeResponse(200, {"active": False}))), f"Bearer {token}")
    assert caught.value.status_code == 401


@pytest.mark.asyncio
async def test_require_user_fails_closed_when_identity_is_unavailable():
    token = jwt.encode(
        {"sub": "u1", "email": "a@test.vn", "name": "A", "role": "DONOR", "session_id": "session-1"},
        JWT_SECRET,
        algorithm="HS256",
    )
    with pytest.raises(HTTPException) as caught:
        await require_user(fake_request(FakeHttp(error=RuntimeError("offline"))), f"Bearer {token}")
    assert caught.value.status_code == 503


@pytest.mark.asyncio
async def test_production_token_without_session_id_is_rejected(monkeypatch):
    monkeypatch.setattr("app.auth.NODE_ENV", "production")
    token = jwt.encode({"sub": "u1", "email": "a@test.vn", "name": "A", "role": "DONOR"}, JWT_SECRET, algorithm="HS256")
    with pytest.raises(HTTPException) as caught:
        await require_user(SimpleNamespace(), f"Bearer {token}")
    assert caught.value.status_code == 401
