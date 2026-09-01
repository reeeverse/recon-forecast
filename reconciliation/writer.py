"""
Persist reconciliation results and verified transactions to the database.

MatchResult.bank_id / ledger_id must be string representations of the DB
integer primary keys (as returned when loading rows from the DB).
"""

from sqlalchemy import text
from sqlalchemy.orm import Session

from reconciliation.matcher import MatchResult


def write_reconciliation_results(
    results: list[MatchResult],
    batch_id: int,
    db: Session,
) -> int:
    """Insert MatchResult list into reconciliation_results. Returns row count."""
    count = 0
    for r in results:
        db.execute(
            text("""
                INSERT INTO reconciliation_results (
                    batch_id, bank_line_id, ledger_entry_id,
                    match_type, exception_kind, confidence,
                    score_amount, score_date, score_reference, score_description,
                    amount_delta_paise, date_delta_days, status
                ) VALUES (
                    :batch_id, :bank_line_id, :ledger_entry_id,
                    :match_type, :exception_kind, :confidence,
                    :score_amount, :score_date, :score_reference, :score_description,
                    :amount_delta_paise, :date_delta_days, 'open'
                )
            """),
            {
                "batch_id": batch_id,
                "bank_line_id": int(r.bank_id) if r.bank_id is not None else None,
                "ledger_entry_id": int(r.ledger_id) if r.ledger_id is not None else None,
                "match_type": r.match_type,
                "exception_kind": r.exception_kind,
                "confidence": r.confidence,
                "score_amount": r.score_amount,
                "score_date": r.score_date,
                "score_reference": r.score_reference,
                "score_description": r.score_description,
                "amount_delta_paise": r.amount_delta_paise,
                "date_delta_days": r.date_delta_days,
            },
        )
        count += 1
    db.commit()
    return count


def write_verified_transactions(batch_id: int, db: Session) -> int:
    """
    For every auto_matched result in this batch, write a verified_transactions row.
    Uses the bank value_date as the canonical txn_date (correct for timing diffs).
    Returns the number of rows inserted.
    """
    result = db.execute(
        text("""
            INSERT INTO verified_transactions (
                account_id, recon_result_id, txn_date,
                amount_paise, direction, source_ref, verified_via
            )
            SELECT
                bsl.account_id,
                rr.id,
                bsl.value_date,
                bsl.amount_paise,
                bsl.direction,
                bsl.reference,
                'auto'
            FROM reconciliation_results rr
            JOIN bank_statement_lines bsl ON bsl.id = rr.bank_line_id
            WHERE rr.batch_id = :batch_id
              AND rr.match_type = 'auto_matched'
            ON CONFLICT (recon_result_id) DO NOTHING
        """),
        {"batch_id": batch_id},
    )
    db.commit()
    return result.rowcount
