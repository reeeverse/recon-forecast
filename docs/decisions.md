# Design Decisions — locked Day 1

Both team members sign off on these. Change requires a joint sync + immediate commit.

## Currency
- **INR only.** All amounts stored as `BIGINT` paise (₹1 = 100 paise). No floats ever.
- Convert at the edges: CSV ingestion converts to paise on read; API responses express paise with a display helper.

## `verified_transactions` contract
Forecasting reads **only** this table — never `bank_statement_lines` or `ledger_entries`.

```json
{
  "account_id": "ACC-001",
  "txn_date": "2026-08-01",
  "amount_paise": -19000000,
  "direction": "debit",
  "source_ref": "UTR300012345001",
  "verified_via": "auto"
}
```

## DB tables (8)
`accounts`, `import_batches`, `bank_statement_lines`, `ledger_entries`,
`reconciliation_results`, `verified_transactions`, `forecasts`, `alerts`

Schema: `backend/schema.sql`

## Matching weights
| Feature | Weight |
|---|---|
| Amount | 45% |
| Date | 25% |
| Reference | 20% |
| Description | 10% |

Re-normalised when both references are absent: amount 55%, date 30%, description 15%.

## Thresholds
| Band | Confidence | Action |
|---|---|---|
| Auto-match | ≥ 85 | Write `verified_transactions` |
| Review | 60–84 | Surface in exceptions table |
| Unmatched | < 60 | `unmatched_bank` / `unmatched_ledger` |

Both are config constants in `backend/app/settings.py`.

## API endpoints (15)
See `docs/08-api.md` for full list. JSON shapes locked Day 4 AM.

## Branch ownership
- Person A: `reconciliation/`, `data/`, recon routes, recon frontend components
- Person B: `forecasting/`, `lambda/`, `infrastructure/`, forecast routes, forecast frontend components
- Shared files (edit only in joint sync): `backend/schema.sql`, `backend/app/settings.py`, `backend/app/main.py`, `docs/08-api.md`
