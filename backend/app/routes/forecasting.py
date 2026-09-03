"""
Forecasting & account API routes (4, 9, 10, 11, 13, 15).
Route 4 (/internal/ingest) orchestrates the full pipeline.
"""

from __future__ import annotations

import io
import logging
from datetime import date, datetime, timezone

import boto3
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.auth import get_current_user, require_ingest_secret
from backend.app.db import get_db
from backend.app.schemas import (
    AccountSummary,
    AlertItem,
    AlertsResponse,
    CashPositionResponse,
    ForecastPoint,
    ForecastResponse,
    HealthResponse,
    IngestRequest,
    IngestResponse,
)
from backend.app.settings import settings
from forecasting.cashflow import daily_balance_series
from forecasting.model import holt_forecast
from forecasting.sns import publish_alert, send_email_alert, send_sms_alert, _format_alert_message
from forecasting.threshold import evaluate_threshold, expire_stale_alerts
from reconciliation.classify import mark_duplicates
from reconciliation.loader import load_bank_csv, load_ledger_csv
from reconciliation.matcher import BankLine, LedgerEntry, reconcile
from reconciliation.writer import (
    write_reconciliation_results,
    write_verified_transactions,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["forecasting"])


# ── Route 4: POST /internal/ingest ────────────────────────────────────────────

@router.post(
    "/internal/ingest",
    response_model=IngestResponse,
    dependencies=[Depends(require_ingest_secret)],
)
def internal_ingest(body: IngestRequest, db: Session = Depends(get_db)):
    """
    Called by Lambda after S3 upload.
    Downloads CSVs from S3, loads, reconciles, forecasts, evaluates thresholds.
    """
    s3 = boto3.client("s3", region_name=settings.aws_region)

    # 1. Download from S3
    try:
        stmt_obj = s3.get_object(
            Bucket=body.bucket, Key=f"{body.prefix}statement.csv"
        )
        ledger_obj = s3.get_object(
            Bucket=body.bucket, Key=f"{body.prefix}ledger.csv"
        )
        stmt_bytes = stmt_obj["Body"].read()
        ledger_bytes = ledger_obj["Body"].read()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"S3 download failed: {exc}") from exc

    # 2. Create import batch
    batch_row = db.execute(
        text("""
            INSERT INTO import_batches (account_id, s3_key_statement, s3_key_ledger, status)
            VALUES (:aid, :stmt_key, :ledger_key, 'ingested')
            RETURNING id
        """),
        {
            "aid": body.account_id,
            "stmt_key": f"{body.prefix}statement.csv",
            "ledger_key": f"{body.prefix}ledger.csv",
        },
    ).fetchone()
    db.commit()
    batch_id = batch_row.id

    # 3. Load CSVs into DB
    try:
        bank_rows = load_bank_csv(
            io.StringIO(stmt_bytes.decode()), batch_id, body.account_id, db
        )
        ledger_rows = load_ledger_csv(
            io.StringIO(ledger_bytes.decode()), batch_id, body.account_id, db
        )
    except ValueError as exc:
        db.execute(
            text("UPDATE import_batches SET status='failed' WHERE id=:bid"),
            {"bid": batch_id},
        )
        db.commit()
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # 4. Reconcile
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
        for r in db.execute(
            text("""
                SELECT id, account_id, txn_date, amount_paise, direction, description, reference
                FROM bank_statement_lines WHERE batch_id = :bid ORDER BY id
            """),
            {"bid": batch_id},
        ).fetchall()
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
        for r in db.execute(
            text("""
                SELECT id, account_id, txn_date, amount_paise, direction, description, reference
                FROM ledger_entries WHERE batch_id = :bid ORDER BY id
            """),
            {"bid": batch_id},
        ).fetchall()
    ]

    bank_hashes = [
        {"id": str(r.id), "hash": r.raw_row_hash}
        for r in db.execute(
            text("SELECT id, raw_row_hash FROM bank_statement_lines WHERE batch_id = :bid"),
            {"bid": batch_id},
        ).fetchall()
    ]
    dup_ids = mark_duplicates(bank_hashes, "id", "hash")

    results = reconcile(bank_lines, ledger_entries)
    write_reconciliation_results(results, batch_id, db)
    verified_count = write_verified_transactions(batch_id, db)

    auto = sum(1 for r in results if r.match_type == "auto_matched")
    review = sum(1 for r in results if r.match_type == "review")

    # 5. Forecast
    series = daily_balance_series(body.account_id, db)
    forecast_points = holt_forecast(series, horizon=14)

    forecast_run_row = db.execute(
        text("""
            INSERT INTO forecasts (account_id, model, run_at, horizon_date,
                predicted_close_paise, predicted_low_paise, predicted_high_paise)
            VALUES (:aid, 'holt', now(), :hdate, :close, :low, :high)
            RETURNING id
        """),
        {
            "aid": body.account_id,
            "hdate": forecast_points[0]["horizon_date"],
            "close": forecast_points[0]["predicted_close_paise"],
            "low": forecast_points[0]["predicted_low_paise"],
            "high": forecast_points[0]["predicted_high_paise"],
        },
    ).fetchone()
    forecast_run_id = forecast_run_row.id

    for pt in forecast_points[1:]:
        db.execute(
            text("""
                INSERT INTO forecasts (account_id, model, run_at, horizon_date,
                    predicted_close_paise, predicted_low_paise, predicted_high_paise)
                VALUES (:aid, 'holt', now(), :hdate, :close, :low, :high)
                ON CONFLICT (account_id, run_at, horizon_date) DO NOTHING
            """),
            {
                "aid": body.account_id,
                "hdate": pt["horizon_date"],
                "close": pt["predicted_close_paise"],
                "low": pt["predicted_low_paise"],
                "high": pt["predicted_high_paise"],
            },
        )
    db.commit()

    # 6. Threshold evaluation
    account = db.execute(
        text("SELECT min_threshold_paise FROM accounts WHERE id = :id"),
        {"id": body.account_id},
    ).fetchone()
    threshold = account.min_threshold_paise if account else 0

    expire_stale_alerts(body.account_id, forecast_points, db)
    alert = evaluate_threshold(body.account_id, forecast_points, threshold, forecast_run_id, db)
    alerts_created = 0
    if alert:
        alerts_created = 1
        publish_alert(alert, settings.sns_topic_arn, settings.aws_region)

        # Per-user direct notifications (email + SMS)
        user_row = db.execute(
            text("""
                SELECT u.email, u.phone, u.notify_email, u.notify_sms
                FROM users u JOIN accounts a ON a.user_id = u.id
                WHERE a.id = :aid
            """),
            {"aid": body.account_id},
        ).fetchone()
        if user_row:
            severity = alert["severity"].upper()
            subject = f"[{severity}] Liquidity alert — breach on {alert['breach_date']}"
            msg = _format_alert_message(alert)
            if user_row.notify_email:
                send_email_alert(
                    user_row.email, subject, msg,
                    settings.ses_from_email, settings.aws_region,
                )
            if user_row.notify_sms and user_row.phone:
                send_sms_alert(user_row.phone, f"{subject}\n{msg}", settings.aws_region)

    # 7. Snapshot to DynamoDB
    _put_dynamo_snapshot(body.account_id, series, forecast_points, threshold)

    # 8. Mark batch done
    db.execute(
        text("UPDATE import_batches SET status='forecast_done' WHERE id=:bid"),
        {"bid": batch_id},
    )
    db.commit()

    return IngestResponse(
        batch_id=batch_id,
        summary={
            "bank_rows": bank_rows,
            "ledger_rows": ledger_rows,
            "auto_matched": auto,
            "review": review,
            "duplicates": len(dup_ids),
            "verified_count": verified_count,
        },
        forecast_run_id=forecast_run_id,
        alerts_created=alerts_created,
    )


def _put_dynamo_snapshot(
    account_id: str,
    series,
    forecast_points: list[dict],
    threshold_paise: int,
) -> None:
    if not settings.dynamodb_table:
        return
    try:
        dynamo = boto3.resource("dynamodb", region_name=settings.aws_region)
        table = dynamo.Table(settings.dynamodb_table)
        current = int(series.iloc[-1]) if len(series) else 0
        table.put_item(
            Item={
                "account_id": account_id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "current_balance_paise": current,
                "threshold_paise": threshold_paise,
                "forecast": [
                    {
                        "date": str(p["horizon_date"]),
                        "predicted_paise": p["predicted_close_paise"],
                        "low_paise": p.get("predicted_low_paise"),
                        "high_paise": p.get("predicted_high_paise"),
                    }
                    for p in forecast_points
                ],
            }
        )
    except Exception:
        logger.exception("DynamoDB snapshot failed for %s", account_id)


# ── Route 9: GET /accounts ─────────────────────────────────────────────────────

@router.get(
    "/accounts",
    response_model=list[AccountSummary],
)
def list_accounts(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    rows = db.execute(
        text("""
            SELECT
                a.id, a.name, a.currency,
                a.opening_balance_paise,
                a.min_threshold_paise,
                EXISTS (
                    SELECT 1 FROM alerts al
                    WHERE al.account_id = a.id AND al.status = 'active'
                ) AS has_active_alert
            FROM accounts a WHERE a.user_id = :uid ORDER BY a.id
        """),
        {"uid": user["id"]},
    ).fetchall()

    result = []
    for r in rows:
        # compute current balance from verified transactions
        balance = db.execute(
            text("""
                SELECT COALESCE(SUM(
                    CASE WHEN direction='credit' THEN amount_paise ELSE -amount_paise END
                ), 0) FROM verified_transactions WHERE account_id = :aid
            """),
            {"aid": r.id},
        ).scalar() or 0
        current = r.opening_balance_paise + balance
        result.append(
            AccountSummary(
                id=r.id,
                name=r.name,
                currency=r.currency,
                current_balance_paise=current,
                min_threshold_paise=r.min_threshold_paise,
                has_active_alert=r.has_active_alert,
            )
        )
    return result


# ── Route 10: GET /accounts/{id}/cash-position ────────────────────────────────

@router.get(
    "/accounts/{account_id}/cash-position",
    response_model=CashPositionResponse,
)
def get_cash_position(account_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    account = db.execute(
        text("SELECT opening_balance_paise, min_threshold_paise FROM accounts WHERE id=:id AND user_id=:uid"),
        {"id": account_id, "uid": user["id"]},
    ).fetchone()
    if not account:
        raise HTTPException(status_code=404, detail="account not found")

    series = daily_balance_series(account_id, db)
    current = int(series.iloc[-1]) if len(series) else account.opening_balance_paise

    txn_count = db.execute(
        text("SELECT COUNT(*) FROM verified_transactions WHERE account_id=:aid"),
        {"aid": account_id},
    ).scalar() or 0

    return CashPositionResponse(
        account_id=account_id,
        as_of=date.today(),
        current_balance_paise=current,
        opening_balance_paise=account.opening_balance_paise,
        verified_txn_count=txn_count,
        threshold_paise=account.min_threshold_paise,
    )


# ── Route 11: GET /accounts/{id}/forecast ─────────────────────────────────────

@router.get(
    "/accounts/{account_id}/forecast",
    response_model=ForecastResponse,
)
def get_forecast(account_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    account = db.execute(
        text("SELECT min_threshold_paise FROM accounts WHERE id=:id AND user_id=:uid"),
        {"id": account_id, "uid": user["id"]},
    ).fetchone()
    if not account:
        raise HTTPException(status_code=404, detail="account not found")

    rows = db.execute(
        text("""
            SELECT horizon_date, predicted_close_paise, predicted_low_paise,
                   predicted_high_paise, run_at, model
            FROM forecasts
            WHERE account_id = :aid
              AND run_at = (
                SELECT MAX(run_at) FROM forecasts WHERE account_id = :aid
              )
            ORDER BY horizon_date
        """),
        {"aid": account_id},
    ).fetchall()

    if not rows:
        # compute on-the-fly
        series = daily_balance_series(account_id, db)
        fc_points = holt_forecast(series, horizon=14)
        run_at = datetime.now(timezone.utc)
        model = "holt"
    else:
        fc_points = [
            {
                "horizon_date": r.horizon_date,
                "predicted_close_paise": r.predicted_close_paise,
                "predicted_low_paise": r.predicted_low_paise,
                "predicted_high_paise": r.predicted_high_paise,
            }
            for r in rows
        ]
        run_at = rows[0].run_at
        model = rows[0].model

    return ForecastResponse(
        account_id=account_id,
        model=model,
        run_at=run_at,
        threshold_paise=account.min_threshold_paise,
        points=[
            ForecastPoint(
                date=p["horizon_date"],
                predicted_paise=p["predicted_close_paise"],
                low_paise=p.get("predicted_low_paise"),
                high_paise=p.get("predicted_high_paise"),
            )
            for p in fc_points
        ],
    )


# ── Route 13: GET /alerts ──────────────────────────────────────────────────────

@router.get(
    "/alerts",
    response_model=AlertsResponse,
)
def get_alerts(
    status: str | None = Query(default=None),
    account_id: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    # Restrict to current user's accounts
    filters = "account_id IN (SELECT id FROM accounts WHERE user_id = :uid)"
    params: dict = {"offset": (page - 1) * page_size, "limit": page_size, "uid": user["id"]}
    if status:
        filters += " AND status = :status"
        params["status"] = status
    if account_id:
        filters += " AND account_id = :account_id"
        params["account_id"] = account_id

    rows = db.execute(
        text(f"""
            SELECT id, account_id, severity, breach_date, predicted_close_paise,
                   threshold_paise, shortfall_paise, status, created_at, updated_at
            FROM alerts
            WHERE {filters}
            ORDER BY
                CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                              WHEN 'medium' THEN 3 ELSE 4 END,
                created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    ).fetchall()

    total = db.execute(
        text(f"SELECT COUNT(*) FROM alerts WHERE {filters}"),
        {k: v for k, v in params.items() if k not in ("offset", "limit")},
    ).scalar() or 0

    return AlertsResponse(
        items=[
            AlertItem(
                id=r.id,
                account_id=r.account_id,
                severity=r.severity,
                breach_date=r.breach_date,
                predicted_close_paise=r.predicted_close_paise,
                threshold_paise=r.threshold_paise,
                shortfall_paise=r.shortfall_paise,
                status=r.status,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
            for r in rows
        ],
        total=total,
    )


# ── Route 15: GET /health ──────────────────────────────────────────────────────

@router.get("/health", response_model=HealthResponse)
def health(db: Session = Depends(get_db)):
    # DB check
    db_ok = "ok"
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_ok = "error"

    # DynamoDB check
    dynamo_ok = "ok"
    if settings.dynamodb_table:
        try:
            boto3.client("dynamodb", region_name=settings.aws_region).describe_table(
                TableName=settings.dynamodb_table
            )
        except Exception:
            dynamo_ok = "error"
    else:
        dynamo_ok = "not_configured"

    # SNS check
    sns_ok = "ok"
    if settings.sns_topic_arn:
        try:
            boto3.client("sns", region_name=settings.aws_region).get_topic_attributes(
                TopicArn=settings.sns_topic_arn
            )
        except Exception:
            sns_ok = "error"
    else:
        sns_ok = "not_configured"

    overall = "ok" if db_ok == "ok" else "degraded"
    return HealthResponse(
        status=overall,
        db=db_ok,
        dynamo=dynamo_ok,
        sns=sns_ok,
        version="0.1.0",
    )
