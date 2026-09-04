"""Audit log route — append-only read access."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.auth import get_current_user
from backend.app.db import get_db

router = APIRouter(prefix="/api/v1/audit-logs", tags=["audit"])


@router.get("")
def list_audit_logs(
    account_id: str | None = Query(default=None),
    batch_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    if not account_id and not batch_id:
        raise HTTPException(status_code=400, detail="account_id or batch_id required")

    if account_id:
        acct = db.execute(
            text("SELECT id FROM accounts WHERE id = :aid AND user_id = :uid"),
            {"aid": account_id, "uid": user["id"]},
        ).fetchone()
        if not acct:
            raise HTTPException(status_code=404, detail="account not found")

    rows = db.execute(
        text("""
            SELECT
                al.id, al.entity_type, al.entity_id, al.action,
                al.old_value, al.new_value, al.notes, al.created_at,
                u.email AS user_email
            FROM audit_logs al
            JOIN users u ON u.id = al.user_id
            WHERE al.user_id = :uid
              AND (
                :account_id IS NULL
                OR EXISTS (
                    SELECT 1 FROM ledger_entries le
                    JOIN import_batches ib ON ib.id = le.batch_id
                    WHERE le.id = al.entity_id
                      AND al.entity_type = 'ledger_entry'
                      AND ib.account_id = :account_id
                )
                OR EXISTS (
                    SELECT 1 FROM reconciliation_results rr
                    JOIN import_batches ib ON ib.id = rr.batch_id
                    WHERE rr.id = al.entity_id
                      AND al.entity_type = 'recon_result'
                      AND ib.account_id = :account_id
                )
              )
            ORDER BY al.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {
            "uid": user["id"],
            "account_id": account_id,
            "limit": page_size,
            "offset": (page - 1) * page_size,
        },
    ).fetchall()

    total = db.execute(
        text("""
            SELECT COUNT(*) FROM audit_logs al
            WHERE al.user_id = :uid
              AND (
                :account_id IS NULL
                OR EXISTS (
                    SELECT 1 FROM ledger_entries le
                    JOIN import_batches ib ON ib.id = le.batch_id
                    WHERE le.id = al.entity_id
                      AND al.entity_type = 'ledger_entry'
                      AND ib.account_id = :account_id
                )
                OR EXISTS (
                    SELECT 1 FROM reconciliation_results rr
                    JOIN import_batches ib ON ib.id = rr.batch_id
                    WHERE rr.id = al.entity_id
                      AND al.entity_type = 'recon_result'
                      AND ib.account_id = :account_id
                )
              )
        """),
        {"uid": user["id"], "account_id": account_id},
    ).scalar() or 0

    return {
        "items": [
            {
                "id": r.id,
                "entity_type": r.entity_type,
                "entity_id": r.entity_id,
                "action": r.action,
                "old_value": r.old_value,
                "new_value": r.new_value,
                "notes": r.notes,
                "created_at": r.created_at.isoformat(),
                "user_email": r.user_email,
            }
            for r in rows
        ],
        "total": total,
    }
