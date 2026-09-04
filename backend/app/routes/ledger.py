"""Ledger entry CRUD routes."""

from __future__ import annotations

import hashlib
import json
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


class LedgerCorrectionIn(BaseModel):
    txn_date: date
    amount_paise: int
    direction: str
    description: str = ""
    reference: str = ""
    counterparty: str = ""
    correction_note: str


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
    d = {
        "id": r.id,
        "txn_date": r.txn_date.isoformat(),
        "amount_paise": r.amount_paise,
        "direction": r.direction,
        "description": r.description or "",
        "reference": r.reference or "",
        "counterparty": r.counterparty or "",
        "is_corrected": getattr(r, "is_corrected", False) or False,
        "corrects_id": getattr(r, "corrects_id", None),
    }
    return d


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
            SELECT id, txn_date, amount_paise, direction, description, reference,
                   counterparty, is_corrected, corrects_id
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


# ── PATCH /ledger-entries/{id} — IMMUTABLE ────────────────────────────────────

@router.patch("/{entry_id}", status_code=409)
def update_entry(entry_id: int):
    raise HTTPException(
        status_code=409,
        detail="Ledger entries are immutable. Use POST /{id}/correct to add a correction.",
    )


# ── DELETE /ledger-entries/{id} — IMMUTABLE ───────────────────────────────────

@router.delete("/{entry_id}", status_code=409)
def delete_entry(entry_id: int):
    raise HTTPException(
        status_code=409,
        detail="Ledger entries are immutable and cannot be deleted.",
    )


# ── POST /ledger-entries/{id}/correct ────────────────────────────────────────

@router.post("/{entry_id}/correct", status_code=201)
def correct_entry(
    entry_id: int,
    body: LedgerCorrectionIn,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    existing = db.execute(
        text("""
            SELECT le.id, le.batch_id, le.account_id, le.txn_date, le.amount_paise,
                   le.direction, le.description, le.reference, le.counterparty, le.is_corrected
            FROM ledger_entries le
            JOIN import_batches ib ON ib.id = le.batch_id
            JOIN accounts a ON a.id = ib.account_id
            WHERE le.id = :id AND a.user_id = :uid
        """),
        {"id": entry_id, "uid": user["id"]},
    ).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="entry not found")
    if existing.is_corrected:
        raise HTTPException(status_code=409, detail="entry has already been corrected")
    if body.direction not in ("credit", "debit"):
        raise HTTPException(status_code=422, detail="direction must be 'credit' or 'debit'")

    new_hash = _row_hash([
        existing.account_id,
        body.txn_date.isoformat(),
        body.amount_paise, body.direction,
        body.description.upper(), body.reference.upper(), body.counterparty.upper(),
    ])

    new_row = db.execute(
        text("""
            INSERT INTO ledger_entries
                (batch_id, account_id, txn_date, amount_paise, direction,
                 description, reference, counterparty, raw_row_hash, corrects_id)
            VALUES
                (:bid, :aid, :txn_date, :amt, :dir, :desc, :ref, :cpty, :hash, :corrects_id)
            RETURNING id, txn_date, amount_paise, direction, description,
                      reference, counterparty, is_corrected, corrects_id
        """),
        {
            "bid": existing.batch_id, "aid": existing.account_id,
            "txn_date": body.txn_date, "amt": body.amount_paise,
            "dir": body.direction, "desc": body.description,
            "ref": body.reference, "cpty": body.counterparty,
            "hash": new_hash, "corrects_id": entry_id,
        },
    ).fetchone()

    db.execute(
        text("UPDATE ledger_entries SET is_corrected = true WHERE id = :id"),
        {"id": entry_id},
    )

    old_val = {
        "txn_date": existing.txn_date.isoformat(),
        "amount_paise": existing.amount_paise,
        "direction": existing.direction,
    }
    db.execute(
        text("""
            INSERT INTO audit_logs (user_id, entity_type, entity_id, action, old_value, new_value, notes)
            VALUES (:uid, 'ledger_entry', :eid, 'correction_added', :old, :new, :notes)
        """),
        {
            "uid": user["id"],
            "eid": entry_id,
            "old": json.dumps(old_val),
            "new": json.dumps({"correction_entry_id": new_row.id}),
            "notes": body.correction_note,
        },
    )
    db.commit()
    return _to_dict(new_row)
