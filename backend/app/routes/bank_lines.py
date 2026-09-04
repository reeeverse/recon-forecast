"""Bank statement lines — read-only view."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.auth import get_current_user
from backend.app.db import get_db

router = APIRouter(prefix="/api/v1/bank-lines", tags=["bank-lines"])


@router.get("")
def list_bank_lines(
    batch_id: int = Query(...),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    owned = db.execute(
        text("""
            SELECT ib.id FROM import_batches ib
            JOIN accounts a ON a.id = ib.account_id
            WHERE ib.id = :bid AND a.user_id = :uid
        """),
        {"bid": batch_id, "uid": user["id"]},
    ).fetchone()
    if not owned:
        raise HTTPException(status_code=404, detail="batch not found")

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
