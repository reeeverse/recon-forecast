#!/bin/bash
# Full local pipeline: generate → load → reconcile → forecast → threshold
# Usage:
#   scripts/run_local.sh           # generate synthetic data then run
#   scripts/run_local.sh --demo    # same (alias)
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

export PYTHONPATH="$REPO"
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/recon}"
export SNS_TOPIC_ARN="${SNS_TOPIC_ARN:-}"
export DYNAMODB_TABLE="${DYNAMODB_TABLE:-cash_snapshot}"
export INGEST_SECRET="${INGEST_SECRET:-changeme}"
export DASHBOARD_TOKEN="${DASHBOARD_TOKEN:-changeme}"

echo "==> [1/6] Generating synthetic data (seed=42)..."
python3 data/generate.py --seed 42 --output-dir data/
echo "    Generated: bank_statement.csv, ledger.csv, expected.json"

echo "==> [2/6] Applying schema..."
docker exec -i localstack-postgres-1 psql -U postgres -d recon < backend/schema.sql 2>/dev/null || true

echo "==> [3/6] Seeding accounts..."
docker exec -i localstack-postgres-1 psql -U postgres -d recon <<'SQL'
INSERT INTO accounts (id, name, currency, opening_balance_paise, opening_balance_date, min_threshold_paise)
VALUES
  ('ACC-001', 'Operating Account', 'INR', 5000000000, '2026-06-01', 2000000000),
  ('ACC-002', 'Payroll Account',   'INR', 2000000000, '2026-06-01',  500000000),
  ('ACC-003', 'Reserve Account',   'INR', 8000000000, '2026-06-01', 3000000000)
ON CONFLICT (id) DO NOTHING;
SQL

echo "==> [4/6] Running Python pipeline..."
python3 - <<'PYEOF'
import sys, json
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os

DATABASE_URL = os.environ["DATABASE_URL"]
engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)

from reconciliation.loader import load_bank_csv, load_ledger_csv
from reconciliation.matcher import BankLine, LedgerEntry, reconcile
from reconciliation.writer import write_reconciliation_results, write_verified_transactions
from forecasting.cashflow import daily_balance_series
from forecasting.model import holt_forecast
from forecasting.threshold import evaluate_threshold, expire_stale_alerts

DATA = Path("data")
ACCOUNTS = ["ACC-001", "ACC-002", "ACC-003"]

with Session() as db:
    # Create one shared import batch
    batch_row = db.execute(
        text("INSERT INTO import_batches (account_id, status) VALUES ('ACC-001', 'ingested') RETURNING id")
    ).fetchone()
    db.commit()
    batch_id = batch_row.id
    print(f"  batch_id={batch_id}")

    # Load CSVs for all accounts into this batch
    total_bank = total_ledger = 0
    for acct in ACCOUNTS:
        b = load_bank_csv(DATA / "bank_statement.csv", batch_id, acct, db)
        l = load_ledger_csv(DATA / "ledger.csv", batch_id, acct, db)
        total_bank += b; total_ledger += l
    db.commit()
    print(f"  Loaded {total_bank} bank rows, {total_ledger} ledger rows")

    # Reconcile per account
    total_auto = total_review = 0
    for acct in ACCOUNTS:
        bank_rows = db.execute(
            text("SELECT id,account_id,txn_date,amount_paise,direction,description,reference FROM bank_statement_lines WHERE batch_id=:bid AND account_id=:aid"),
            {"bid": batch_id, "aid": acct}
        ).fetchall()
        ledger_rows = db.execute(
            text("SELECT id,account_id,txn_date,amount_paise,direction,description,reference FROM ledger_entries WHERE batch_id=:bid AND account_id=:aid"),
            {"bid": batch_id, "aid": acct}
        ).fetchall()

        bank_lines = [BankLine(id=str(r.id), account_id=r.account_id, txn_date=r.txn_date,
            amount_paise=r.amount_paise, direction=r.direction, description=r.description or "",
            reference=r.reference or "") for r in bank_rows]
        ledger_entries = [LedgerEntry(id=str(r.id), account_id=r.account_id, txn_date=r.txn_date,
            amount_paise=r.amount_paise, direction=r.direction, description=r.description or "",
            reference=r.reference or "") for r in ledger_rows]

        results = reconcile(bank_lines, ledger_entries)
        write_reconciliation_results(results, batch_id, db)
        auto = sum(1 for r in results if r.match_type == "auto_matched")
        rev  = sum(1 for r in results if r.match_type == "review")
        total_auto += auto; total_review += rev
        print(f"  {acct}: {len(bank_lines)} bank, {len(ledger_entries)} ledger → auto={auto}, review={rev}")

    verified = write_verified_transactions(batch_id, db)
    print(f"  Verified transactions written: {verified}")

    # Forecast + threshold per account
    for acct in ACCOUNTS:
        series = daily_balance_series(acct, db)
        fc = holt_forecast(series, horizon=14)
        acct_row = db.execute(text("SELECT min_threshold_paise FROM accounts WHERE id=:id"), {"id": acct}).fetchone()
        threshold = acct_row.min_threshold_paise if acct_row else 0

        # Save forecast rows
        run_id_row = db.execute(
            text("INSERT INTO forecasts (account_id,model,run_at,horizon_date,predicted_close_paise,predicted_low_paise,predicted_high_paise) VALUES (:aid,'holt',now(),:hd,:c,:lo,:hi) RETURNING id"),
            {"aid": acct, "hd": fc[0]["horizon_date"], "c": fc[0]["predicted_close_paise"],
             "lo": fc[0]["predicted_low_paise"], "hi": fc[0]["predicted_high_paise"]}
        ).fetchone()
        forecast_run_id = run_id_row.id
        for pt in fc[1:]:
            db.execute(
                text("INSERT INTO forecasts (account_id,model,run_at,horizon_date,predicted_close_paise,predicted_low_paise,predicted_high_paise) VALUES (:aid,'holt',now(),:hd,:c,:lo,:hi) ON CONFLICT DO NOTHING"),
                {"aid": acct, "hd": pt["horizon_date"], "c": pt["predicted_close_paise"],
                 "lo": pt.get("predicted_low_paise"), "hi": pt.get("predicted_high_paise")}
            )
        db.commit()

        expire_stale_alerts(acct, fc, db)
        alert = evaluate_threshold(acct, fc, threshold, forecast_run_id, db)
        if alert:
            print(f"  ALERT [{alert['severity'].upper()}] {acct}: breach {alert['breach_date']}, shortfall ₹{alert['shortfall_paise']/100:,.0f}")
        else:
            balance_paise = int(series.iloc[-1]) if len(series) else 0
            print(f"  {acct}: no breach. Balance ₹{balance_paise/100:,.0f}, threshold ₹{threshold/100:,.0f}")

    db.execute(text("UPDATE import_batches SET status='forecast_done' WHERE id=:bid"), {"bid": batch_id})
    db.commit()
    print(f"\nDone. batch_id={batch_id}, auto={total_auto}, review={total_review}, verified={verified}")
PYEOF

echo "==> [5/6] Spot-checking DB..."
docker exec -i localstack-postgres-1 psql -U postgres -d recon <<'SQL'
SELECT 'import_batches'       AS tbl, COUNT(*) FROM import_batches
UNION ALL SELECT 'bank_lines',         COUNT(*) FROM bank_statement_lines
UNION ALL SELECT 'ledger_entries',     COUNT(*) FROM ledger_entries
UNION ALL SELECT 'recon_results',      COUNT(*) FROM reconciliation_results
UNION ALL SELECT 'verified_txns',      COUNT(*) FROM verified_transactions
UNION ALL SELECT 'forecasts',          COUNT(*) FROM forecasts
UNION ALL SELECT 'alerts',             COUNT(*) FROM alerts;
SQL

echo "==> [6/6] Running e2e harness..."
python3 -m pytest tests/e2e/test_demo_scenario.py -v 2>&1 | tail -20

echo ""
echo "Pipeline complete."
