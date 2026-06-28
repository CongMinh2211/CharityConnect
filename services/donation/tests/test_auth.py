import jwt
import pytest
from fastapi import HTTPException

from app.auth import require_role, require_user
from app.config import JWT_SECRET


def test_require_user_decodes_valid_bearer_token():
    token = jwt.encode({"sub": "u1", "email": "a@test.vn", "name": "A", "role": "DONOR"}, JWT_SECRET, algorithm="HS256")
    user = require_user(f"Bearer {token}")
    assert user.id == "u1"
    assert user.role == "DONOR"


@pytest.mark.parametrize("header", [None, "Basic abc", "Bearer invalid"])
def test_require_user_rejects_missing_or_invalid_tokens(header):
    with pytest.raises(HTTPException) as caught:
        require_user(header)
    assert caught.value.status_code == 401


def test_require_role_enforces_exact_role():
    token = jwt.encode({"sub": "u1", "email": "a@test.vn", "name": "A", "role": "DONOR"}, JWT_SECRET, algorithm="HS256")
    user = require_user(f"Bearer {token}")
    require_role(user, "DONOR")
    with pytest.raises(HTTPException) as caught:
        require_role(user, "ADMIN")
    assert caught.value.status_code == 403

