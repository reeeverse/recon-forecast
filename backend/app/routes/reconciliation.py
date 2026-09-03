"""Reconciliation API routes (5, 6, 7)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.auth import get_current_user
from backend.app.db import get_db
from backend.app.schemas import (
    BankSide,
    ExceptionItem,
    ExceptionsResponse,
    LedgerSide,
    ReconSummaryResponse,
    ReconTotals,
    RunReconRequest,
)
from reconciliation.classify import mark_duplicates
from reconciliation.matcher import BankLine, LedgerEntry, reconcile
from reconciliation.writer import (
    write_reconciliation_results,
    write_verified_transactions,
)

router = APIRouter(
    prefix="/api/v1/reconciliation",
    tags=["reconciliation"],
)


def _fetch_batch_lines(batch_id: int, db: Session):
    bank_rows = db.execute(
        text("""
            SELECT id, account_id, txn_date, amount_paise, direction, description, reference
            FROM bank_statement_lines WHERE batch_id = :bid ORDER BY id
        """),
        {"bid": batch_id},
    ).fetchall()

    ledger_rows = db.execute(
        text("""
            SELECT id, account_id, txn_date, amount_paise, direction, description, reference
            FROM ledger_entries WHERE batch_id = :bid ORDER BY id
        """),
        {"bid": batch_id},
    ).fetchall()

    bank_lines = [
        BankLine(
            id=str(r.id),
            account_id=r.account_id,
            txn_date=r.txn_date,
            amount_paise=r.amount_paise,
            direction=r.direction,
            description=r.description or "",
            reference=r.reference or "",
        )
        for r in bank_rows
    ]
    ledger_entries = [
        LedgerEntry(
            id=str(r.id),
            account_id=r.account_id,
            txn_date=r.txn_date,
            amount_paise=r.amount_paise,
            direction=r.direction,
            description=r.description or "",
            reference=r.reference or "",
        )
        for r in ledger_rows
    ]
    return bank_lines, ledger_entries


# ── Route 5: POST /reconciliation/run ─────────────────────────────────────────

@router.post("/run")
def run_reconciliation(body: RunReconRequest, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """Manually (re)run reconciliation for a batch."""
    batch = db.execute(
        text("""
            SELECT ib.id FROM import_batches ib
            JOIN accounts a ON a.id = ib.account_id
            WHERE ib.id = :bid AND a.user_id = :uid
        """),
        {"bid": body.batch_id, "uid": user["id"]},
    ).fetchone()
    if not batch:
        raise HTTPException(status_code=404, detail="batch not found")

    bank_lines, ledger_entries = _fetch_batch_lines(body.batch_id, db)

    # Detect duplicates via raw_row_hash before matching
    bank_dicts = [
        {"id": b.id, "hash": db.execute(
            text("SELECT raw_row_hash FROM bank_statement_lines WHERE id = :id"),
            {"id": int(b.id)},
        ).fetchone()[0]}
        for b in bank_lines
    ]
    dup_ids = mark_duplicates(bank_dicts, "id", "hash")

    results = reconcile(bank_lines, ledger_entries)
    write_reconciliation_results(results, body.batch_id, db)
    verified = write_verified_transactions(body.batch_id, db)

    auto = sum(1 for r in results if r.match_type == "auto_matched")
    review = sum(1 for r in results if r.match_type == "review")
    unmatched_bank = sum(1 for r in results if r.match_type == "unmatched_bank")
    unmatched_ledger = sum(1 for r in results if r.match_type == "unmatched_ledger")

    return {
        "batch_id": body.batch_id,
        "summary": {
            "bank": len(bank_lines),
            "ledger": len(ledger_entries),
            "auto_matched": auto,
            "review": review,
            "unmatched_bank": unmatched_bank,
            "unmatched_ledger": unmatched_ledger,
            "duplicates": len(dup_ids),
            "verified_count": verified,
        },
    }


# ── Route 6: GET /reconciliation/summary ──────────────────────────────────────

@router.get("/summary", response_model=ReconSummaryResponse)
def get_summary(
    batch_id: int | None = Query(default=None),
    account_id: str | None = Query(default=None),
    latest: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Headline counts for a reconciliation batch."""
    if batch_id is None:
        if not account_id:
            raise HTTPException(status_code=400, detail="batch_id or account_id required")
        # Verify account belongs to current user
        acct = db.execute(
            text("SELECT id FROM accounts WHERE id=:aid AND user_id=:uid"),
            {"aid": account_id, "uid": user["id"]},
        ).fetchone()
        if not acct:
            raise HTTPException(status_code=404, detail="account not found")
        row = db.execute(
            text("""
                SELECT id FROM import_batches ib
                WHERE ib.account_id = :aid
                  AND (ib.status != 'ingested'
                       OR EXISTS (SELECT 1 FROM bank_statement_lines WHERE batch_id = ib.id))
                ORDER BY ib.created_at DESC LIMIT 1
            """),
            {"aid": account_id},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="no batches for account")
        batch_id = row.id
    else:
        # Verify batch belongs to current user's account
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

    counts = db.execute(
        text("""
            SELECT
                COUNT(*) FILTER (WHERE match_type = 'auto_matched')  AS auto_matched,
                COUNT(*) FILTER (WHERE match_type = 'review')        AS review,
                COUNT(*) FILTER (WHERE match_type = 'unmatched_bank') AS unmatched_bank,
                COUNT(*) FILTER (WHERE match_type = 'unmatched_ledger') AS unmatched_ledger,
                AVG(confidence) FILTER (WHERE match_type IN ('auto_matched','review')) AS avg_conf
            FROM reconciliation_results WHERE batch_id = :bid
        """),
        {"bid": batch_id},
    ).fetchone()

    bank_count = db.execute(
        text("SELECT COUNT(*) FROM bank_statement_lines WHERE batch_id = :bid"),
        {"bid": batch_id},
    ).scalar() or 0

    ledger_count = db.execute(
        text("SELECT COUNT(*) FROM ledger_entries WHERE batch_id = :bid"),
        {"bid": batch_id},
    ).scalar() or 0

    dup_count = db.execute(
        text("""
            SELECT COUNT(*) - COUNT(DISTINCT raw_row_hash)
            FROM bank_statement_lines WHERE batch_id = :bid
        """),
        {"bid": batch_id},
    ).scalar() or 0

    verified_count = db.execute(
        text("""
            SELECT COUNT(*) FROM verified_transactions vt
            JOIN reconciliation_results rr ON rr.id = vt.recon_result_id
            WHERE rr.batch_id = :bid
        """),
        {"bid": batch_id},
    ).scalar() or 0

    status = db.execute(
        text("SELECT status FROM import_batches WHERE id = :bid"),
        {"bid": batch_id},
    ).scalar() or "unknown"

    return ReconSummaryResponse(
        batch_id=batch_id,
        status=status,
        totals=ReconTotals(
            bank=bank_count,
            ledger=ledger_count,
            auto_matched=counts.auto_matched or 0,
            review=counts.review or 0,
            unmatched_bank=counts.unmatched_bank or 0,
            unmatched_ledger=counts.unmatched_ledger or 0,
            duplicates=dup_count,
        ),
        avg_confidence=float(counts.avg_conf) if counts.avg_conf else None,
        verified_count=verified_count,
    )


# ── Route 7: GET /reconciliation/exceptions ───────────────────────────────────

@router.get("/exceptions", response_model=ExceptionsResponse)
def get_exceptions(
    batch_id: int = Query(...),
    kind: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Paged exception rows for the exceptions table."""
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

    filters = "rr.batch_id = :bid"
    params: dict = {"bid": batch_id, "offset": (page - 1) * page_size, "limit": page_size}
    if kind:
        filters += " AND rr.exception_kind = :kind"
        params["kind"] = kind

    rows = db.execute(
        text(f"""
            SELECT
                rr.id AS result_id, rr.match_type, rr.exception_kind, rr.confidence,
                rr.score_amount, rr.score_date, rr.score_reference, rr.score_description,
                b.id AS bank_id, b.txn_date AS bank_date, b.amount_paise AS bank_amount,
                b.direction AS bank_dir, b.description AS bank_desc, b.reference AS bank_ref,
                l.id AS ledger_id, l.txn_date AS ledger_date, l.amount_paise AS ledger_amount,
                l.direction AS ledger_dir, l.description AS ledger_desc, l.reference AS ledger_ref
            FROM reconciliation_results rr
            LEFT JOIN bank_statement_lines b ON b.id = rr.bank_line_id
            LEFT JOIN ledger_entries l ON l.id = rr.ledger_entry_id
            WHERE {filters}
            ORDER BY rr.confidence DESC NULLS LAST
            LIMIT :limit OFFSET :offset
        """),
        params,
    ).fetchall()

    total = db.execute(
        text(f"SELECT COUNT(*) FROM reconciliation_results rr WHERE {filters}"),
        {k: v for k, v in params.items() if k not in ("offset", "limit")},
    ).scalar() or 0

    items = []
    for r in rows:
        bank = (
            BankSide(
                id=r.bank_id,
                txn_date=r.bank_date,
                amount_paise=r.bank_amount,
                direction=r.bank_dir,
                description=r.bank_desc or "",
                reference=r.bank_ref or "",
            )
            if r.bank_id
            else None
        )
        ledger = (
            LedgerSide(
                id=r.ledger_id,
                txn_date=r.ledger_date,
                amount_paise=r.ledger_amount,
                direction=r.ledger_dir,
                description=r.ledger_desc or "",
                reference=r.ledger_ref or "",
            )
            if r.ledger_id
            else None
        )
        amount_delta = (
            abs(r.bank_amount - r.ledger_amount)
            if bank and ledger
            else None
        )
        date_delta = (
            abs((r.bank_date - r.ledger_date).days)
            if bank and ledger
            else None
        )
        items.append(
            ExceptionItem(
                result_id=r.result_id,
                match_type=r.match_type,
                exception_kind=r.exception_kind or "none",
                confidence=r.confidence or 0.0,
                bank=bank,
                ledger=ledger,
                amount_delta_paise=amount_delta,
                date_delta_days=date_delta,
                scores={
                    "amount": r.score_amount,
                    "date": r.score_date,
                    "reference": r.score_reference,
                    "description": r.score_description,
                } if r.score_amount is not None else None,
            )
        )

    return ExceptionsResponse(items=items, total=total)
