"""Auth routes: signup, login, me."""

from fastapi import APIRouter, Depends, HTTPException, status
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.auth import create_access_token, get_current_user
from backend.app.db import get_db

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    role: str = "analyst"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


# ── POST /auth/signup ─────────────────────────────────────────────────────────

@router.post("/signup", response_model=TokenResponse)
def signup(body: SignupRequest, db: Session = Depends(get_db)):
    existing = db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": body.email},
    ).fetchone()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    if len(body.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")

    role = body.role if body.role in ("admin", "analyst") else "analyst"
    pw_hash = _pwd.hash(body.password)

    row = db.execute(
        text("""
            INSERT INTO users (email, password_hash, role)
            VALUES (:email, :pw, :role) RETURNING id, email, role
        """),
        {"email": body.email, "pw": pw_hash, "role": role},
    ).fetchone()
    db.commit()

    token = create_access_token(row.id, row.email, row.role)
    return TokenResponse(
        access_token=token,
        user={"id": row.id, "email": row.email, "role": row.role},
    )


# ── POST /auth/login ──────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    row = db.execute(
        text("SELECT id, email, password_hash, role FROM users WHERE email = :email"),
        {"email": body.email},
    ).fetchone()

    if not row or not _pwd.verify(body.password, row.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(row.id, row.email, row.role)
    return TokenResponse(
        access_token=token,
        user={"id": row.id, "email": row.email, "role": row.role},
    )


# ── GET /auth/me ──────────────────────────────────────────────────────────────

@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return user
