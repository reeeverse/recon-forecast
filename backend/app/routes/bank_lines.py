"""Bank statement lines — read + manual entry."""

from __future__ import annotations

import hashlib
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.auth import get_current_user
from backend.app.db import get_db

router = APIRouter(prefix="/api/v1/bank-lines", tags=["bank-lines"])


class BankLineIn(BaseModel):
    batch_id: int
    account_id: str
    txn_date: date
    value_date: date | None = None
    amount_paise: int
    direction: str
    description: str = ""
    reference: str = ""


def _row_hash(fields: list) -> str:
    return hashlib.sha1("|".join(str(f) for f in fields).encode()).hexdigest()


def _verify_batch(batch_id: int, user_id: int, db: Session):
    row = db.execute(
        text("""
            SELECT ib.id, ib.account_id FROM import_batches ib
            JOIN accounts a ON a.id = ib.account_id
            WHERE ib.id = :bid AND a.user_id = :uid
        """),
        {"bid": batch_id, "uid": user_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="batch not found")
    return row


def _to_dict(r) -> dict:
    return {
        "id": r.id,
        "txn_date": r.txn_date.isoformat() if r.txn_date else None,
        "value_date": r.value_date.isoformat() if r.value_date else None,
        "amount_paise": r.amount_paise,
        "direction": r.direction,
        "description": r.description or "",
        "reference": r.reference or "",
    }


@router.get("")
def list_bank_lines(
    batch_id: int = Query(...),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    _verify_batch(batch_id, user["id"], db)

    rows = db.execute(
        text("""
            SELECT id, txn_date, value_date, amount_paise, direction, description, reference, created_at
            FROM bank_statement_lines
            WHERE batch_id = :bid
            ORDER BY txn_date, id
            LIMIT :limit OFFSET :offset
        """),
        {"bid": batch_id, "limit": page_size, "offset": (page - 1) * page_size},
    ).fetchall()

    total = db.execute(
        text("SELECT COUNT(*) FROM bank_statement_lines WHERE batch_id = :bid"),
        {"bid": batch_id},
    ).scalar() or 0

    return {
        "items": [
            {
                "id": r.id,
                "txn_date": r.txn_date.isoformat() if r.txn_date else None,
                "value_date": r.value_date.isoformat() if r.value_date else None,
                "amount_paise": r.amount_paise,
                "direction": r.direction,
                "description": r.description or "",
                "reference": r.reference or "",
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
        "total": total,
    }


@router.post("", status_code=201)
def create_bank_line(
    body: BankLineIn,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    _verify_batch(body.batch_id, user["id"], db)
    if body.direction not in ("credit", "debit"):
        raise HTTPException(status_code=422, detail="direction must be 'credit' or 'debit'")

    raw_hash = _row_hash([
        body.account_id,
        body.txn_date.isoformat(),
        body.amount_paise,
        body.direction,
        body.description.upper(),
        body.reference.upper(),
    ])

    row = db.execute(
        text("""
            INSERT INTO bank_statement_lines
                (batch_id, account_id, txn_date, value_date, amount_paise,
                 direction, description, reference, raw_row_hash)
            VALUES
                (:bid, :aid, :txn_date, :value_date, :amt,
                 :dir, :desc, :ref, :hash)
            RETURNING id, txn_date, value_date, amount_paise, direction, description, reference
        """),
        {
            "bid": body.batch_id, "aid": body.account_id,
            "txn_date": body.txn_date, "value_date": body.value_date,
            "amt": body.amount_paise, "dir": body.direction,
            "desc": body.description, "ref": body.reference,
            "hash": raw_hash,
        },
    ).fetchone()
    db.commit()
    return _to_dict(row)
