# API Contract — recon-forecast v0.1.0

**Base URL:** `https://<ec2-domain>/api/v1`  
**Auth:** `Authorization: Bearer <DASHBOARD_TOKEN>` on all routes except `/internal/ingest` and `/health`.  
Internal route uses `X-Ingest-Secret` header.

---

## 1. POST /upload/presign

**Request:**
```json
{ "account_id": "ACC-001", "batch_ts": "2026-08-29T10:00:00" }
```
**Response:**
```json
{
  "statement_url": "https://s3.amazonaws.com/...",
  "ledger_url":    "https://s3.amazonaws.com/...",
  "prefix":        "raw/ACC-001/2026-08-29T10:00:00/"
}
```

---

## 2. POST /upload/statement *(fallback)*

Multipart form: `account_id` + `file` (CSV).  
**Response:** `{ "batch_id": 7, "rows": 203 }`

---

## 3. POST /upload/ledger *(fallback)*

Same shape as `/upload/statement`.

---

## 4. POST /internal/ingest *(Lambda → EC2)*

**Header:** `X-Ingest-Secret: <secret>`  
**Request:**
```json
{ "bucket": "recon-forecast-083363539900-uploads", "prefix": "raw/ACC-001/…/", "account_id": "ACC-001" }
```
**Response:**
```json
{
  "batch_id": 7,
  "summary": {
    "bank_rows": 203, "ledger_rows": 198,
    "auto_matched": 180, "review": 12,
    "duplicates": 3, "verified_count": 180
  },
  "forecast_run_id": 42,
  "alerts_created": 1
}
```

---

## 5. POST /reconciliation/run *(manual re-run)*

**Request:** `{ "batch_id": 7 }`  
**Response:** Same shape as ingest `summary` wrapper.

---

## 6. GET /reconciliation/summary

**Query:** `?batch_id=7` OR `?account_id=ACC-001&latest=true`  
**Response:**
```json
{
  "batch_id": 7,
  "status": "done",
  "totals": {
    "bank": 203, "ledger": 198,
    "auto_matched": 180, "review": 12,
    "unmatched_bank": 5, "unmatched_ledger": 6,
    "duplicates": 3
  },
  "avg_confidence": 91.4,
  "verified_count": 180
}
```

---

## 7. GET /reconciliation/exceptions

**Query:** `?batch_id=7&kind=amount_diff&page=1&page_size=20`  
`kind` ∈ `none | timing_diff | amount_diff | ambiguous`  
**Response:**
```json
{
  "items": [{
    "result_id": 1234,
    "match_type": "review",
    "exception_kind": "amount_diff",
    "confidence": 78.3,
    "bank":   { "id": 501, "txn_date": "2026-08-15", "amount_paise": 10050000, "direction": "debit",  "description": "...", "reference": "UTR123" },
    "ledger": { "id": 302, "txn_date": "2026-08-15", "amount_paise": 10000000, "direction": "debit",  "description": "...", "reference": "UTR123" },
    "amount_delta_paise": 50000,
    "date_delta_days": 0,
    "scores": { "amount": 0.95, "date": 1.0, "reference": 1.0, "description": 0.88 }
  }],
  "total": 27
}
```

---

## 9. GET /accounts

**Response:**
```json
[
  {
    "id": "ACC-001", "name": "Operating Account", "currency": "INR",
    "current_balance_paise": 4823000000,
    "min_threshold_paise":   2000000000,
    "has_active_alert": false
  }
]
```

---

## 10. GET /accounts/{id}/cash-position

**Response:**
```json
{
  "account_id": "ACC-001",
  "as_of": "2026-08-29",
  "current_balance_paise": 4823000000,
  "opening_balance_paise": 5000000000,
  "verified_txn_count": 180,
  "threshold_paise": 2000000000
}
```

---

## 11. GET /accounts/{id}/forecast

**Query:** `?run=latest` (default)  
**Response:**
```json
{
  "account_id": "ACC-001",
  "model": "holt",
  "run_at": "2026-08-29T10:05:00Z",
  "threshold_paise": 2000000000,
  "points": [
    { "date": "2026-08-30", "predicted_paise": 4700000000, "low_paise": 4400000000, "high_paise": 5000000000 }
  ]
}
```

---

## 13. GET /alerts

**Query:** `?status=active&account_id=ACC-001&page=1&page_size=20`  
**Response:**
```json
{
  "items": [{
    "id": 3,
    "account_id": "ACC-001",
    "severity": "high",
    "breach_date": "2026-09-05",
    "predicted_close_paise": 1800000000,
    "threshold_paise": 2000000000,
    "shortfall_paise": 200000000,
    "status": "active",
    "created_at": "2026-08-29T10:05:00Z",
    "updated_at": "2026-08-29T10:05:00Z"
  }],
  "total": 1
}
```

---

## 15. GET /health

**Response:**
```json
{ "status": "ok", "db": "ok", "dynamo": "ok", "sns": "ok", "version": "0.1.0" }
```

---

## Error format

All 4xx/5xx responses:
```json
{ "detail": "human-readable message" }
```
