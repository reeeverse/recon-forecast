"""
Cash position and daily balance series from verified_transactions.
"""

from datetime import date

import pandas as pd
from sqlalchemy import text
from sqlalchemy.orm import Session


def daily_balance_series(account_id: str, db: Session) -> pd.Series:
    """
    Build a daily closing balance series from verified_transactions.

    Returns a pandas Series indexed by Timestamp, values in paise.
    Zero-fills days with no transactions. Used as input for Holt forecasting.
    """
    row = db.execute(
        text("SELECT opening_balance_paise, opening_balance_date FROM accounts WHERE id = :id"),
        {"id": account_id},
    ).fetchone()

    if row is None:
        raise ValueError(f"Account {account_id!r} not found")

    opening_paise: int = row.opening_balance_paise
    opening_date: date = row.opening_balance_date

    txns = db.execute(
        text("""
            SELECT txn_date, amount_paise
            FROM verified_transactions
            WHERE account_id = :id
            ORDER BY txn_date
        """),
        {"id": account_id},
    ).fetchall()

    idx = pd.date_range(opening_date, date.today(), freq="D")
    net = pd.Series(0, index=idx, dtype="int64")

    for t in txns:
        ts = pd.Timestamp(t.txn_date)
        if ts in net.index:
            net.loc[ts] += t.amount_paise

    return (opening_paise + net.cumsum()).rename(account_id)


def current_cash_position(account_id: str, db: Session) -> int:
    """Return current cash balance in paise (opening + all verified movements)."""
    row = db.execute(
        text("""
            SELECT a.opening_balance_paise + COALESCE(SUM(vt.amount_paise), 0) AS balance
            FROM accounts a
            LEFT JOIN verified_transactions vt ON vt.account_id = a.id
            WHERE a.id = :id
            GROUP BY a.opening_balance_paise
        """),
        {"id": account_id},
    ).fetchone()
    return int(row.balance) if row else 0
