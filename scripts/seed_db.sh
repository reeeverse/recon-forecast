#!/bin/bash
# Apply schema and seed the 3 accounts + thresholds
set -euo pipefail
DB_URL=${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/recon}
psql "$DB_URL" -f backend/schema.sql
psql "$DB_URL" <<'SQL'
INSERT INTO accounts (id, name, currency, opening_balance_paise, opening_balance_date, min_threshold_paise)
VALUES
  ('ACC-001', 'Operating Account',  'INR', 0, '2026-05-30', 20000000),
  ('ACC-002', 'Payroll Account',    'INR', 0, '2026-05-30', 50000000),
  ('ACC-003', 'Reserve Account',    'INR', 0, '2026-05-30', 10000000)
ON CONFLICT (id) DO NOTHING;
SQL
echo "DB seeded."
