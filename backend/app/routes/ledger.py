"""Ledger entry CRUD routes."""

from __future__ import annotations

import hashlib
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.auth import get_current_user
from backend.app.db import get_db

router = APIRouter(prefix="/api/v1/ledger-entries", tags=["ledger"])


class LedgerEntryIn(BaseModel):
    batch_id: int
    account_id: str
    txn_date: date
    amount_paise: int
    direction: str
    description: str = ""
    reference: str = ""
    counterparty: str = ""


class LedgerEntryPatch(BaseModel):
    txn_date: date | None = None
    amount_paise: int | None = None
    direction: str | None = None
    description: str | None = None
    reference: str | None = None
    counterparty: str | None = None


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
        "txn_date": r.txn_date.isoformat(),
        "amount_paise": r.amount_paise,
        "direction": r.direction,
        "description": r.description or "",
        "reference": r.reference or "",
        "counterparty": r.counterparty or "",
    }


# ── GET /ledger-entries?batch_id= ─────────────────────────────────────────────

@router.get("")
def list_entries(
    batch_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    _verify_batch(batch_id, user["id"], db)
    rows = db.execute(
        text("""
            SELECT id, txn_date, amount_paise, direction, description, reference, counterparty
            FROM ledger_entries WHERE batch_id = :bid ORDER BY txn_date, id
        """),
        {"bid": batch_id},
    ).fetchall()
    return [_to_dict(r) for r in rows]


# ── POST /ledger-entries ───────────────────────────────────────────────────────

@router.post("", status_code=201)
def create_entry(
    body: LedgerEntryIn,
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
        body.counterparty.upper(),
    ])

    row = db.execute(
        text("""
            INSERT INTO ledger_entries
                (batch_id, account_id, txn_date, amount_paise, direction,
                 description, reference, counterparty, raw_row_hash)
            VALUES
                (:bid, :aid, :txn_date, :amt, :dir, :desc, :ref, :cpty, :hash)
            RETURNING id, txn_date, amount_paise, direction, description, reference, counterparty
        """),
        {
            "bid": body.batch_id, "aid": body.account_id,
            "txn_date": body.txn_date, "amt": body.amount_paise,
            "dir": body.direction, "desc": body.description,
            "ref": body.reference, "cpty": body.counterparty,
            "hash": raw_hash,
        },
    ).fetchone()
    db.commit()
    return _to_dict(row)


# ── PATCH /ledger-entries/{id} ────────────────────────────────────────────────

@router.patch("/{entry_id}")
def update_entry(
    entry_id: int,
    body: LedgerEntryPatch,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    existing = db.execute(
        text("""
            SELECT le.id, le.account_id, le.txn_date, le.amount_paise,
                   le.direction, le.description, le.reference, le.counterparty
            FROM ledger_entries le
            JOIN import_batches ib ON ib.id = le.batch_id
            JOIN accounts a ON a.id = ib.account_id
            WHERE le.id = :id AND a.user_id = :uid
        """),
        {"id": entry_id, "uid": user["id"]},
    ).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="entry not found")

    txn_date    = body.txn_date    if body.txn_date    is not None else existing.txn_date
    amount      = body.amount_paise if body.amount_paise is not None else existing.amount_paise
    direction   = body.direction   if body.direction   is not None else existing.direction
    description = body.description if body.description is not None else existing.description or ""
    reference   = body.reference   if body.reference   is not None else existing.reference or ""
    counterparty = body.counterparty if body.counterparty is not None else existing.counterparty or ""

    if direction not in ("credit", "debit"):
        raise HTTPException(status_code=422, detail="direction must be 'credit' or 'debit'")

    new_hash = _row_hash([
        existing.account_id,
        txn_date.isoformat(),
        amount, direction,
        description.upper(), reference.upper(), counterparty.upper(),
    ])

    row = db.execute(
        text("""
            UPDATE ledger_entries
            SET txn_date=:txn_date, amount_paise=:amt, direction=:dir,
                description=:desc, reference=:ref, counterparty=:cpty, raw_row_hash=:hash
            WHERE id=:id
            RETURNING id, txn_date, amount_paise, direction, description, reference, counterparty
        """),
        {
            "id": entry_id, "txn_date": txn_date, "amt": amount,
            "dir": direction, "desc": description, "ref": reference,
            "cpty": counterparty, "hash": new_hash,
        },
    ).fetchone()
    db.commit()
    return _to_dict(row)


# ── DELETE /ledger-entries/{id} ───────────────────────────────────────────────

@router.delete("/{entry_id}", status_code=204)
def delete_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = db.execute(
        text("""
            DELETE FROM ledger_entries le
            USING import_batches ib, accounts a
            WHERE le.id = :id
              AND le.batch_id = ib.id
              AND ib.account_id = a.id
              AND a.user_id = :uid
        """),
        {"id": entry_id, "uid": user["id"]},
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="entry not found")
