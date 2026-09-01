"""
CSV loader for bank statements and ledger entries.

Validates headers, coerces types, computes raw_row_hash, and inserts rows
into the database. Raises ValueError on any malformed row — never silently drops.
"""

import contextlib
import csv
import hashlib
from datetime import date
from pathlib import Path
from typing import IO, Union

from sqlalchemy import text
from sqlalchemy.orm import Session

PathOrFile = Union[str, Path, IO[str]]


@contextlib.contextmanager
def _open(source: PathOrFile):
    """Yield a text file handle from a path or an already-open file-like object."""
    if isinstance(source, (str, Path)):
        with open(Path(source), newline="", encoding="utf-8") as f:
            yield f
    else:
        # File-like: rewind if possible, then hand it back without closing
        if hasattr(source, "seek"):
            source.seek(0)
        yield source

BANK_REQUIRED = {
    "account_id", "txn_date", "value_date",
    "amount_paise", "direction", "description", "reference",
}
LEDGER_REQUIRED = {
    "account_id", "txn_date", "amount_paise",
    "direction", "description", "reference", "counterparty",
}
VALID_DIRECTIONS = {"credit", "debit"}


def _row_hash(fields: list) -> str:
    return hashlib.sha1("|".join(str(f) for f in fields).encode()).hexdigest()


def _parse_date(value: str, field: str) -> date:
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        raise ValueError(f"{field} is not a valid ISO date: {value!r}")


def _parse_paise(value: str) -> int:
    try:
        return int(value)
    except ValueError:
        raise ValueError(f"amount_paise must be an integer, got {value!r}")


def _parse_direction(value: str) -> str:
    v = value.strip().lower()
    if v not in VALID_DIRECTIONS:
        raise ValueError(f"direction must be 'credit' or 'debit', got {value!r}")
    return v


def load_bank_csv(source: PathOrFile, batch_id: int, account_id: str, db: Session) -> int:
    """
    Load a bank statement CSV into bank_statement_lines.

    Accepts a file path (str/Path) or an already-open text file-like object.
    Only rows matching account_id are inserted. Returns the number of rows inserted.
    Raises ValueError listing all malformed rows (up to 10 shown).
    """
    errors: list[str] = []
    rows_inserted = 0

    with _open(source) as f:
        reader = csv.DictReader(f)
        missing_cols = BANK_REQUIRED - set(reader.fieldnames or [])
        if missing_cols:
            raise ValueError(f"Bank CSV missing required columns: {sorted(missing_cols)}")

        for lineno, raw in enumerate(reader, start=2):
            try:
                row_account = raw["account_id"].strip()
                if row_account != account_id:
                    continue  # skip rows for other accounts (multi-account CSV)

                txn_date = _parse_date(raw["txn_date"], "txn_date")
                value_date = (
                    _parse_date(raw["value_date"], "value_date")
                    if raw["value_date"].strip()
                    else txn_date
                )
                amount_paise = _parse_paise(raw["amount_paise"])
                direction = _parse_direction(raw["direction"])
                description = raw["description"].strip()
                reference = raw["reference"].strip()

                raw_row_hash = _row_hash([
                    row_account,
                    txn_date.isoformat(),
                    value_date.isoformat(),
                    amount_paise,
                    direction,
                    description.upper(),
                    reference.upper(),
                ])

                db.execute(
                    text("""
                        INSERT INTO bank_statement_lines
                            (batch_id, account_id, txn_date, value_date, amount_paise,
                             direction, description, reference, raw_row_hash)
                        VALUES
                            (:batch_id, :account_id, :txn_date, :value_date, :amount_paise,
                             :direction, :description, :reference, :raw_row_hash)
                    """),
                    {
                        "batch_id": batch_id,
                        "account_id": row_account,
                        "txn_date": txn_date,
                        "value_date": value_date,
                        "amount_paise": amount_paise,
                        "direction": direction,
                        "description": description,
                        "reference": reference,
                        "raw_row_hash": raw_row_hash,
                    },
                )
                rows_inserted += 1

            except (ValueError, KeyError) as exc:
                errors.append(f"line {lineno}: {exc}")

    if errors:
        shown = "\n".join(errors[:10])
        suffix = f"\n  ... and {len(errors) - 10} more" if len(errors) > 10 else ""
        raise ValueError(f"Bank CSV has {len(errors)} error(s):\n{shown}{suffix}")

    return rows_inserted


def load_ledger_csv(source: PathOrFile, batch_id: int, account_id: str, db: Session) -> int:
    """
    Load a ledger CSV into ledger_entries.

    Accepts a file path (str/Path) or an already-open text file-like object.
    Only rows matching account_id are inserted. Returns the number of rows inserted.
    Raises ValueError listing all malformed rows (up to 10 shown).
    """
    errors: list[str] = []
    rows_inserted = 0

    with _open(source) as f:
        reader = csv.DictReader(f)
        missing_cols = LEDGER_REQUIRED - set(reader.fieldnames or [])
        if missing_cols:
            raise ValueError(f"Ledger CSV missing required columns: {sorted(missing_cols)}")

        for lineno, raw in enumerate(reader, start=2):
            try:
                row_account = raw["account_id"].strip()
                if row_account != account_id:
                    continue

                txn_date = _parse_date(raw["txn_date"], "txn_date")
                amount_paise = _parse_paise(raw["amount_paise"])
                direction = _parse_direction(raw["direction"])
                description = raw["description"].strip()
                reference = raw["reference"].strip()
                counterparty = raw["counterparty"].strip()

                raw_row_hash = _row_hash([
                    row_account,
                    txn_date.isoformat(),
                    amount_paise,
                    direction,
                    description.upper(),
                    reference.upper(),
                    counterparty.upper(),
                ])

                db.execute(
                    text("""
                        INSERT INTO ledger_entries
                            (batch_id, account_id, txn_date, amount_paise,
                             direction, description, reference, counterparty, raw_row_hash)
                        VALUES
                            (:batch_id, :account_id, :txn_date, :amount_paise,
                             :direction, :description, :reference, :counterparty, :raw_row_hash)
                    """),
                    {
                        "batch_id": batch_id,
                        "account_id": row_account,
                        "txn_date": txn_date,
                        "amount_paise": amount_paise,
                        "direction": direction,
                        "description": description,
                        "reference": reference,
                        "counterparty": counterparty,
                        "raw_row_hash": raw_row_hash,
                    },
                )
                rows_inserted += 1

            except (ValueError, KeyError) as exc:
                errors.append(f"line {lineno}: {exc}")

    if errors:
        shown = "\n".join(errors[:10])
        suffix = f"\n  ... and {len(errors) - 10} more" if len(errors) > 10 else ""
        raise ValueError(f"Ledger CSV has {len(errors)} error(s):\n{shown}{suffix}")

    return rows_inserted
