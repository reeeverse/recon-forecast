"""Account management routes."""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.auth import get_current_user
from backend.app.db import get_db

router = APIRouter(prefix="/api/v1/accounts", tags=["accounts"])

_IFSC = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")


class AccountCreate(BaseModel):
    id: str
    name: str
    account_type: str = "current"
    opening_balance_paise: int = 0
    opening_balance_date: str | None = None
    min_threshold_paise: int = 0
    bank_name: str | None = None
    bank_branch: str | None = None
    ifsc_code: str | None = None



@router.post("", status_code=201)
def create_account(
    body: AccountCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    if body.account_type not in ("current", "savings"):
        raise HTTPException(status_code=422, detail="account_type must be 'current' or 'savings'")
    if body.ifsc_code and not _IFSC.match(body.ifsc_code):
        raise HTTPException(status_code=422, detail="ifsc_code must be 11-char format (e.g. HDFC0001234)")

    existing = db.execute(
        text("SELECT id FROM accounts WHERE id = :id"),
        {"id": body.id},
    ).fetchone()
    if existing:
        raise HTTPException(status_code=409, detail=f"account '{body.id}' already exists")

    row = db.execute(
        text("""
            INSERT INTO accounts
                (id, user_id, name, currency, account_type, opening_balance_paise,
                 opening_balance_date, min_threshold_paise,
                 bank_name, bank_branch, ifsc_code)
            VALUES
                (:id, :uid, :name, 'INR', :acct_type, :ob_paise,
                 :ob_date, :threshold,
                 :bank_name, :bank_branch, :ifsc_code)
            RETURNING id, name, currency, account_type, opening_balance_paise,
                      min_threshold_paise, bank_name, bank_branch, ifsc_code
        """),
        {
            "id": body.id, "uid": user["id"], "name": body.name,
            "acct_type": body.account_type,
            "ob_paise": body.opening_balance_paise,
            "ob_date": body.opening_balance_date,
            "threshold": body.min_threshold_paise,
            "bank_name": body.bank_name, "bank_branch": body.bank_branch,
            "ifsc_code": body.ifsc_code,
        },
    ).fetchone()
    db.commit()

    return {
        "id": row.id,
        "name": row.name,
        "currency": row.currency,
        "account_type": row.account_type,
        "current_balance_paise": row.opening_balance_paise,
        "min_threshold_paise": row.min_threshold_paise,
        "bank_name": row.bank_name,
        "bank_branch": row.bank_branch,
        "ifsc_code": row.ifsc_code,
        "has_active_alert": False,
    }
