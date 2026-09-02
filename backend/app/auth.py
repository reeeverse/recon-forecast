"""Auth dependencies — bearer token, ingest secret, and JWT user auth."""

from datetime import datetime, timedelta, timezone

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from backend.app.settings import settings

_bearer = HTTPBearer(auto_error=False)


# ── Legacy bearer token (Lambda / internal use) ───────────────────────────────

def require_dashboard_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    authorization: str | None = Header(default=None),
) -> None:
    token = None
    if credentials is not None:
        token = credentials.credentials
    elif authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1]

    if not token or token != settings.dashboard_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing dashboard token",
        )


def require_ingest_secret(x_ingest_secret: str = Header(default="")) -> None:
    if x_ingest_secret != settings.ingest_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid ingest secret",
        )


# ── JWT user auth ─────────────────────────────────────────────────────────────

def create_access_token(user_id: int, email: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_expire_days)
    payload = {"sub": str(user_id), "email": email, "role": role, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        return {
            "id": int(payload["sub"]),
            "email": payload["email"],
            "role": payload["role"],
        }
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user
