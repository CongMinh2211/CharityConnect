from dataclasses import dataclass

import jwt
from fastapi import Header, HTTPException

from .config import JWT_SECRET


@dataclass(frozen=True)
class UserClaims:
    id: str
    email: str
    name: str
    role: str


def require_user(authorization: str | None = Header(default=None)) -> UserClaims:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Vui lòng đăng nhập")
    try:
        claims = jwt.decode(authorization.split(" ", 1)[1], JWT_SECRET, algorithms=["HS256"])
        return UserClaims(id=claims["sub"], email=claims["email"], name=claims["name"], role=claims["role"])
    except (jwt.PyJWTError, KeyError) as error:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ") from error


def require_role(user: UserClaims, role: str) -> None:
    if user.role != role:
        raise HTTPException(status_code=403, detail="Bạn không có quyền thực hiện thao tác này")

