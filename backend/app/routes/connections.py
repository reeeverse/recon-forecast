"""Bank DB connection routes: CRUD + sync."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.auth import get_current_user
from backend.app.db import get_db
from backend.app.settings import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/connections", tags=["connections"])


def _fernet() -> Fernet:
    if not settings.fernet_key:
        raise HTTPException(status_code=503, detail="Encryption not configured — set FERNET_KEY")
    try:
        return Fernet(settings.fernet_key.encode() if isinstance(settings.fernet_key, str) else settings.fernet_key)
    except Exception:
        raise HTTPException(status_code=503, detail="Invalid FERNET_KEY")


def _test_connection(db_type: str, conn_str: str) -> None:
    """Attempt a real connection to verify credentials before saving."""
    try:
        if db_type == "postgresql":
            import psycopg2
            conn = psycopg2.connect(conn_str, connect_timeout=5)
            conn.close()
        elif db_type == "mysql":
            import pymysql
            # pymysql expects a dict or DSN; parse basic DSN
            conn = pymysql.connect(
                **_parse_mysql_dsn(conn_str),
                connect_timeout=5,
            )
            conn.close()
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Connection failed: {e}")


def _parse_mysql_dsn(dsn: str) -> dict:
    """Parse mysql://user:pass@host:port/db into pymysql kwargs."""
    from urllib.parse import urlparse
    p = urlparse(dsn)
    return {
        "host": p.hostname or "localhost",
        "port": p.port or 3306,
        "user": p.username,
        "password": p.password or "",
        "database": (p.path or "/").lstrip("/"),
    }


def _pull_transactions(db_type: str, conn_str: str) -> list[dict[str, Any]]:
    """Pull rows from external DB. Expects a table named bank_transactions with standard columns."""
    rows = []
    query = """
        SELECT
            txn_date    AS date,
            description,
            amount,
            direction,
            reference
        FROM bank_transactions
        ORDER BY txn_date DESC
        LIMIT 5000
    """
    if db_type == "postgresql":
        import psycopg2
        import psycopg2.extras
        conn = psycopg2.connect(conn_str, connect_timeout=10)
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(query)
                rows = [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()
    elif db_type == "mysql":
        import pymysql
        import pymysql.cursors
        conn = pymysql.connect(**_parse_mysql_dsn(conn_str), connect_timeout=10,
                               cursorclass=pymysql.cursors.DictCursor)
        try:
            with conn.cursor() as cur:
                cur.execute(query)
                rows = cur.fetchall()
        finally:
            conn.close()
    return rows


# ── Request / Response models ─────────────────────────────────────────────────

class ConnectionCreate(BaseModel):
    name: str
    db_type: str            # "postgresql" | "mysql"
    connection_string: str  # plain; encrypted before storage


class ConnectionOut(BaseModel):
    id: int
    name: str
    db_type: str
    last_sync_at: str | None
    created_at: str


# ── POST /connections ─────────────────────────────────────────────────────────

@router.post("", status_code=201)
def create_connection(
    body: ConnectionCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    if body.db_type not in ("postgresql", "mysql"):
        raise HTTPException(status_code=422, detail="db_type must be 'postgresql' or 'mysql'")

    _test_connection(body.db_type, body.connection_string)

    f = _fernet()
    enc = f.encrypt(body.connection_string.encode()).decode()

    row = db.execute(
        text("""
            INSERT INTO bank_connections (user_id, name, db_type, connection_string_enc)
            VALUES (:uid, :name, :db_type, :enc)
            RETURNING id, name, db_type, last_sync_at, created_at
        """),
        {"uid": user["id"], "name": body.name, "db_type": body.db_type, "enc": enc},
    ).fetchone()
    db.commit()

    return {
        "id": row.id,
        "name": row.name,
        "db_type": row.db_type,
        "last_sync_at": row.last_sync_at.isoformat() if row.last_sync_at else None,
        "created_at": row.created_at.isoformat(),
    }


# ── GET /connections ──────────────────────────────────────────────────────────

@router.get("")
def list_connections(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    rows = db.execute(
        text("""
            SELECT id, name, db_type, last_sync_at, created_at
            FROM bank_connections WHERE user_id = :uid ORDER BY created_at DESC
        """),
        {"uid": user["id"]},
    ).fetchall()

    return [
        {
            "id": r.id,
            "name": r.name,
            "db_type": r.db_type,
            "last_sync_at": r.last_sync_at.isoformat() if r.last_sync_at else None,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


# ── DELETE /connections/{id} ──────────────────────────────────────────────────

@router.delete("/{conn_id}", status_code=204)
def delete_connection(
    conn_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = db.execute(
        text("DELETE FROM bank_connections WHERE id = :id AND user_id = :uid"),
        {"id": conn_id, "uid": user["id"]},
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Connection not found")


# ── POST /connections/{id}/sync ───────────────────────────────────────────────

@router.post("/{conn_id}/sync")
def sync_connection(
    conn_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Pull transactions from external DB into bank_statement_lines for the first account."""
    row = db.execute(
        text("""
            SELECT id, db_type, connection_string_enc
            FROM bank_connections WHERE id = :id AND user_id = :uid
        """),
        {"id": conn_id, "uid": user["id"]},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")

    f = _fernet()
    try:
        conn_str = f.decrypt(row.connection_string_enc.encode()).decode()
    except InvalidToken:
        raise HTTPException(status_code=500, detail="Failed to decrypt connection string")

    try:
        transactions = _pull_transactions(row.db_type, conn_str)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Sync failed for connection %s: %s", conn_id, e)
        raise HTTPException(status_code=502, detail=f"Sync failed: {e}")

    if not transactions:
        return {"synced": 0, "message": "No rows found in bank_transactions table"}

    # Resolve account: use the first account belonging to this user
    acct = db.execute(
        text("SELECT id FROM accounts WHERE user_id = :uid ORDER BY id LIMIT 1"),
        {"uid": user["id"]},
    ).fetchone()
    if not acct:
        raise HTTPException(status_code=422, detail="No accounts found — create an account first")
    account_id = acct.id

    # Find or create an import batch for this sync
    batch = db.execute(
        text("""
            INSERT INTO import_batches (account_id, source, status)
            VALUES (:aid, 'db_sync', 'pending')
            RETURNING id
        """),
        {"aid": account_id},
    ).fetchone()
    db.commit()
    batch_id = batch.id

    inserted = 0
    for t in transactions:
        date_val = t.get("date")
        desc = str(t.get("description", ""))[:500]
        raw_amount = t.get("amount", 0)
        direction = t.get("direction", "debit")
        reference = str(t.get("reference", "") or "")[:100]

        try:
            amount_paise = int(float(raw_amount) * 100)
        except (TypeError, ValueError):
            continue

        db.execute(
            text("""
                INSERT INTO bank_statement_lines
                    (batch_id, account_id, txn_date, description, amount_paise, direction, reference)
                VALUES (:bid, :aid, :dt, :desc, :amt, :dir, :ref)
                ON CONFLICT DO NOTHING
            """),
            {
                "bid": batch_id,
                "aid": account_id,
                "dt": date_val,
                "desc": desc,
                "amt": amount_paise,
                "dir": direction,
                "ref": reference,
            },
        )
        inserted += 1

    db.commit()

    # Update last_sync_at
    db.execute(
        text("UPDATE bank_connections SET last_sync_at = now() WHERE id = :id"),
        {"id": conn_id},
    )
    db.commit()

    return {
        "synced": inserted,
        "batch_id": batch_id,
        "account_id": account_id,
        "message": f"Inserted {inserted} transactions. Run reconciliation to process.",
    }
