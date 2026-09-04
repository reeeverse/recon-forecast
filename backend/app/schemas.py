"""Pydantic request/response models for all FastAPI routes."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel

# ── Upload ─────────────────────────────────────────────────────────────────────

class PresignRequest(BaseModel):
    account_id: str
    batch_ts: str  # ISO timestamp string, used as S3 prefix component


class PresignResponse(BaseModel):
    statement_url: str
    ledger_url: str
    prefix: str


class UploadResponse(BaseModel):
    batch_id: int
    rows: int


# ── Internal ingest ────────────────────────────────────────────────────────────

class IngestRequest(BaseModel):
    bucket: str
    prefix: str
    account_id: str


class IngestResponse(BaseModel):
    batch_id: int
    summary: dict[str, Any]
    forecast_run_id: int | None
    alerts_created: int


# ── Reconciliation ─────────────────────────────────────────────────────────────

class RunReconRequest(BaseModel):
    batch_id: int


class ReconTotals(BaseModel):
    bank: int
    ledger: int
    auto_matched: int
    review: int
    unmatched_bank: int
    unmatched_ledger: int
    duplicates: int


class ReconSummaryResponse(BaseModel):
    batch_id: int
    status: str
    totals: ReconTotals
    avg_confidence: float | None
    verified_count: int


class BankSide(BaseModel):
    id: int
    txn_date: date
    amount_paise: int
    direction: str
    description: str
    reference: str


class LedgerSide(BaseModel):
    id: int
    txn_date: date
    amount_paise: int
    direction: str
    description: str
    reference: str


class ExceptionItem(BaseModel):
    result_id: int
    match_type: str
    exception_kind: str
    confidence: float
    status: str
    bank: BankSide | None
    ledger: LedgerSide | None
    amount_delta_paise: int | None
    date_delta_days: int | None
    scores: dict[str, float] | None


class ExceptionsResponse(BaseModel):
    items: list[ExceptionItem]
    total: int


# ── Accounts ───────────────────────────────────────────────────────────────────

class AccountSummary(BaseModel):
    id: str
    name: str
    currency: str
    current_balance_paise: int
    min_threshold_paise: int
    has_active_alert: bool
    account_type: str = "current"
    bank_name: str | None = None
    bank_branch: str | None = None
    ifsc_code: str | None = None


class CashPositionResponse(BaseModel):
    account_id: str
    as_of: date
    current_balance_paise: int
    opening_balance_paise: int
    verified_txn_count: int
    threshold_paise: int


# ── Forecast ───────────────────────────────────────────────────────────────────

class ForecastPoint(BaseModel):
    date: date
    predicted_paise: int
    low_paise: int | None
    high_paise: int | None


class ForecastResponse(BaseModel):
    account_id: str
    model: str
    run_at: datetime
    threshold_paise: int
    points: list[ForecastPoint]


# ── Alerts ─────────────────────────────────────────────────────────────────────

class AlertItem(BaseModel):
    id: int
    account_id: str
    severity: str
    breach_date: date
    predicted_close_paise: int
    threshold_paise: int
    shortfall_paise: int
    status: str
    created_at: datetime
    updated_at: datetime


class AlertsResponse(BaseModel):
    items: list[AlertItem]
    total: int


# ── Health ─────────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    db: str
    dynamo: str
    sns: str
    version: str
