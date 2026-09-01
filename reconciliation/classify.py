"""
Exception classification and duplicate detection for reconciliation.
"""

from datetime import date


def mark_duplicates(rows: list[dict], id_field: str, hash_field: str) -> set[str]:
    """
    Return IDs of rows that are 2nd+ occurrence of the same raw_row_hash.
    First occurrence is kept; duplicates are excluded from matching.
    """
    seen: dict[str, str] = {}
    duplicates: set[str] = set()
    for row in rows:
        h = row[hash_field]
        rid = row[id_field]
        if h in seen:
            duplicates.add(rid)
        else:
            seen[h] = rid
    return duplicates


def classify_exception(
    bank_amount: int,
    bank_date: date,
    ledger_amount: int,
    ledger_date: date,
    is_ambiguous: bool = False,
) -> str:
    """
    Determine exception_kind for a matched bank/ledger pair.

    Returns one of: none | timing_diff | amount_diff | ambiguous
    Callers set missing_ledger / missing_bank / duplicate for unmatched rows.
    """
    if is_ambiguous:
        return "ambiguous"

    amount_delta = abs(abs(bank_amount) - abs(ledger_amount))
    date_delta = abs((bank_date - ledger_date).days)

    if amount_delta == 0 and date_delta == 0:
        return "none"
    if date_delta > 0 and amount_delta == 0:
        return "timing_diff"
    if amount_delta > 0 and date_delta == 0:
        return "amount_diff"
    return "amount_diff"  # both differ — amount is more operationally significant
