from datetime import date

from reconciliation.classify import classify_exception, mark_duplicates

# ── mark_duplicates ────────────────────────────────────────────────────────────

def test_mark_duplicates_no_dupes():
    rows = [
        {"id": "B001", "hash": "aaa"},
        {"id": "B002", "hash": "bbb"},
    ]
    assert mark_duplicates(rows, "id", "hash") == set()


def test_mark_duplicates_finds_second_occurrence():
    rows = [
        {"id": "B001", "hash": "aaa"},
        {"id": "B002", "hash": "aaa"},  # duplicate
        {"id": "B003", "hash": "bbb"},
    ]
    dupes = mark_duplicates(rows, "id", "hash")
    assert dupes == {"B002"}


def test_mark_duplicates_keeps_first():
    rows = [
        {"id": "B001", "hash": "aaa"},
        {"id": "B002", "hash": "aaa"},
        {"id": "B003", "hash": "aaa"},
    ]
    dupes = mark_duplicates(rows, "id", "hash")
    assert "B001" not in dupes
    assert {"B002", "B003"} == dupes


def test_mark_duplicates_empty():
    assert mark_duplicates([], "id", "hash") == set()


# ── classify_exception ─────────────────────────────────────────────────────────

def test_classify_exact_match():
    result = classify_exception(
        bank_amount=10_000_000, bank_date=date(2026, 8, 1),
        ledger_amount=10_000_000, ledger_date=date(2026, 8, 1),
    )
    assert result == "none"


def test_classify_timing_diff():
    result = classify_exception(
        bank_amount=10_000_000, bank_date=date(2026, 8, 3),
        ledger_amount=10_000_000, ledger_date=date(2026, 8, 1),
    )
    assert result == "timing_diff"


def test_classify_amount_diff():
    result = classify_exception(
        bank_amount=10_050_000, bank_date=date(2026, 8, 1),
        ledger_amount=10_000_000, ledger_date=date(2026, 8, 1),
    )
    assert result == "amount_diff"


def test_classify_ambiguous():
    result = classify_exception(
        bank_amount=10_000_000, bank_date=date(2026, 8, 1),
        ledger_amount=10_000_000, ledger_date=date(2026, 8, 1),
        is_ambiguous=True,
    )
    assert result == "ambiguous"


def test_classify_both_differ_returns_amount_diff():
    result = classify_exception(
        bank_amount=10_050_000, bank_date=date(2026, 8, 3),
        ledger_amount=10_000_000, ledger_date=date(2026, 8, 1),
    )
    assert result == "amount_diff"
