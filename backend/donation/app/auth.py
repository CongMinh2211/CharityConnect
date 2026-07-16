from dataclasses import dataclass

import jwt
from fastapi import Header, HTTPException, Request

from .config import IDENTITY_SERVICE_URL, INTERNAL_SERVICE_TOKEN, JWT_SECRET, NODE_ENV


@dataclass(frozen=True)
class UserClaims:
    id: str
    email: str
    name: str
    role: str
    session_id: str | None = None


async def require_user(request: Request, authorization: str | None = Header(default=None)) -> UserClaims:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Vui lòng đăng nhập")
    try:
        claims = jwt.decode(authorization.split(" ", 1)[1], JWT_SECRET, algorithms=["HS256"])
        user = UserClaims(
            id=claims["sub"], email=claims["email"], name=claims["name"],
            role=claims["role"], session_id=claims.get("session_id"),
        )
    except (jwt.PyJWTError, KeyError) as error:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ") from error

    if user.session_id:
        try:
            response = await request.app.state.http.get(
                f"{IDENTITY_SERVICE_URL}/internal/sessions/{user.session_id}/status",
                params={"user_id": user.id}, headers={"x-internal-token": INTERNAL_SERVICE_TOKEN},
            )
            if response.status_code != 200 or response.json().get("active") is not True:
                raise HTTPException(status_code=401, detail="Phiên đăng nhập đã bị thu hồi hoặc tài khoản đã bị khóa")
        except HTTPException:
            raise
        except Exception as error:
            raise HTTPException(status_code=503, detail="Không thể xác thực trạng thái tài khoản") from error
    elif NODE_ENV == "production":
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không có định danh phiên hợp lệ")
    return user


def require_role(user: UserClaims, role: str) -> None:
    if user.role != role:
        raise HTTPException(status_code=403, detail="Bạn không có quyền thực hiện thao tác này")
