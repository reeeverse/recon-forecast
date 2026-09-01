"""Upload routes (1, 2, 3) — presigned S3 PUT and direct multipart fallback."""

from __future__ import annotations

import io
import logging

import boto3
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.auth import require_dashboard_token
from backend.app.db import get_db
from backend.app.schemas import PresignRequest, PresignResponse, UploadResponse
from backend.app.settings import settings
from reconciliation.loader import load_bank_csv, load_ledger_csv

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/upload",
    tags=["upload"],
    dependencies=[Depends(require_dashboard_token)],
)


def _make_batch(account_id: str, db: Session) -> int:
    row = db.execute(
        text("INSERT INTO import_batches (account_id, status) VALUES (:aid, 'ingested') RETURNING id"),
        {"aid": account_id},
    ).fetchone()
    db.commit()
    return row.id


# ── Route 1: POST /upload/presign ─────────────────────────────────────────────

@router.post("/presign", response_model=PresignResponse)
def presign(body: PresignRequest, db: Session = Depends(get_db)):
    """Return presigned S3 PUT URLs for statement + ledger CSVs."""
    if not settings.s3_bucket:
        raise HTTPException(status_code=503, detail="S3 not configured")

    prefix = f"raw/{body.account_id}/{body.batch_ts}/"
    s3 = boto3.client("s3", region_name=settings.aws_region)

    def _sign(key: str) -> str:
        return s3.generate_presigned_url(
            "put_object",
            Params={"Bucket": settings.s3_bucket, "Key": key, "ContentType": "text/csv"},
            ExpiresIn=900,
        )

    return PresignResponse(
        statement_url=_sign(f"{prefix}statement.csv"),
        ledger_url=_sign(f"{prefix}ledger.csv"),
        prefix=prefix,
    )


# ── Route 2: POST /upload/statement (fallback direct upload) ──────────────────

@router.post("/statement", response_model=UploadResponse)
def upload_statement(
    account_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Direct multipart upload of bank CSV — fallback when S3 unavailable."""
    batch_id = _make_batch(account_id, db)
    content = file.file.read().decode("utf-8", errors="replace")
    try:
        rows = load_bank_csv(io.StringIO(content), batch_id, account_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return UploadResponse(batch_id=batch_id, rows=rows)


# ── Route 3: POST /upload/ledger (fallback direct upload) ─────────────────────

@router.post("/ledger", response_model=UploadResponse)
def upload_ledger(
    account_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Direct multipart upload of ledger CSV — fallback when S3 unavailable."""
    batch_id = _make_batch(account_id, db)
    content = file.file.read().decode("utf-8", errors="replace")
    try:
        rows = load_ledger_csv(io.StringIO(content), batch_id, account_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return UploadResponse(batch_id=batch_id, rows=rows)
