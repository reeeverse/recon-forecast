"""Simple bearer-token and ingest-secret auth dependencies."""

from fastapi import Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.app.settings import settings

_bearer = HTTPBearer(auto_error=False)


def require_dashboard_token(
    credentials: HTTPAuthorizationCredentials | None = None,
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
