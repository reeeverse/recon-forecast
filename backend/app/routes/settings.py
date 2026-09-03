"""User notification settings route."""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.auth import get_current_user
from backend.app.db import get_db

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])

_E164 = re.compile(r"^\+[1-9]\d{7,14}$")


class SettingsPatch(BaseModel):
    notify_email: bool | None = None
    notify_sms: bool | None = None
    phone: str | None = None


@router.get("")
def get_settings(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    row = db.execute(
        text("SELECT email, notify_email, notify_sms, phone FROM users WHERE id = :uid"),
        {"uid": user["id"]},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="user not found")
    return {
        "email": row.email,
        "notify_email": row.notify_email,
        "notify_sms": row.notify_sms,
        "phone": row.phone or "",
    }


@router.patch("")
def update_settings(
    body: SettingsPatch,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    # Validate phone if provided and non-empty
    if body.phone is not None and body.phone != "":
        if not _E164.match(body.phone):
            raise HTTPException(
                status_code=422,
                detail="phone must be E.164 format (e.g. +919876543210)",
            )

    updates = {}
    if body.notify_email is not None:
        updates["notify_email"] = body.notify_email
    if body.notify_sms is not None:
        updates["notify_sms"] = body.notify_sms
    if body.phone is not None:
        updates["phone"] = body.phone or None  # store NULL for empty string

    if not updates:
        return get_settings(db, user)

    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["uid"] = user["id"]
    db.execute(text(f"UPDATE users SET {set_clause} WHERE id = :uid"), updates)
    db.commit()

    return get_settings(db, user)
