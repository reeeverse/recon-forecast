from datetime import date

import pytest

from reconciliation.matcher import BankLine, LedgerEntry, reconcile
from reconciliation.normalize import normalize_description, normalize_reference
from reconciliation.scoring import (
    amount_score,
    date_score,
    description_score,
    reference_score,
    weighted_confidence,
)

# ── normalize ──────────────────────────────────────────────────────────────────

def test_normalize_reference_strips_separators():
    assert normalize_reference("UTR-300 012/345") == "UTR300012345"

def test_normalize_reference_upper():
    assert normalize_reference("utr12345") == "UTR12345"

def test_normalize_reference_blank():
    assert normalize_reference("") == ""
    assert normalize_reference("   ") == ""

def test_normalize_description_drops_stopwords():
    result = normalize_description("NEFT Payment from Acme Corp")
    assert "neft" not in result
    assert "payment" not in result
    assert "from" not in result
    assert "acme" in result

def test_normalize_description_lower():
    assert normalize_description("ACME CORP") == "acme corp"


# ── amount_score ───────────────────────────────────────────────────────────────

def test_amount_exact():
    assert amount_score(10_000_000, 10_000_000) == 1.0

def test_amount_both_zero():
    assert amount_score(0, 0) == 1.0

def test_amount_within_tolerance():
    # ₹1L amount, ₹500 delta (0.5%) — within 1% tol → score > 0
    score = amount_score(10_000_000, 10_050_000)
    assert 0 < score < 1.0

def test_amount_at_tolerance_boundary():
    # Exactly 1% delta → score = 0
    assert amount_score(10_000_000, 10_100_000) == pytest.approx(0.0, abs=0.01)

def test_amount_beyond_tolerance():
    assert amount_score(10_000_000, 12_000_000) == 0.0

def test_amount_minimum_tolerance():
    # tol = max(100, 500*0.01) = 100 paise; delta=50 → score = 0.5
    assert amount_score(500, 550) == pytest.approx(0.5)
    # delta=200 > tol=100 → 0
    assert amount_score(500, 700) == 0.0


# ── date_score ─────────────────────────────────────────────────────────────────

def test_date_same_day():
    d = date(2026, 8, 1)
    assert date_score(d, d) == 1.0

def test_date_one_day():
    score = date_score(date(2026, 8, 1), date(2026, 8, 2))
    assert score == pytest.approx(0.8)

def test_date_three_days():
    score = date_score(date(2026, 8, 1), date(2026, 8, 4))
    assert score == pytest.approx(0.4)

def test_date_five_days():
    assert date_score(date(2026, 8, 1), date(2026, 8, 6)) == 0.0

def test_date_six_days():
    assert date_score(date(2026, 8, 1), date(2026, 8, 7)) == 0.0

def test_date_symmetric():
    a, b = date(2026, 8, 1), date(2026, 8, 3)
    assert date_score(a, b) == date_score(b, a)


# ── reference_score ────────────────────────────────────────────────────────────

def test_reference_exact():
    assert reference_score("UTR300012345001", "UTR300012345001") == 1.0

def test_reference_normalised_match():
    assert reference_score("UTR-300-012-345", "UTR300012345") == 1.0

def test_reference_transposed_digits():
    score = reference_score("UTR300012345001", "UTR300012354001")
    assert score > 0.7

def test_reference_both_missing():
    assert reference_score("", "") == 0.0

def test_reference_one_missing():
    assert reference_score("UTR300012345001", "") == 0.0
    assert reference_score("", "UTR300012345001") == 0.0


# ── description_score ──────────────────────────────────────────────────────────

def test_description_identical():
    assert description_score("Acme Corp payment", "Acme Corp payment") == 1.0

def test_description_abbreviation():
    score = description_score("Acme Corp Ltd", "ACME CORP")
    assert score > 0.5

def test_description_reformatted():
    score = description_score("NEFT ACME CORP", "Payment from Acme Corp Ltd")
    assert score > 0.3

def test_description_both_blank():
    assert description_score("", "") == 0.0


# ── weighted_confidence ────────────────────────────────────────────────────────

def test_confidence_perfect():
    assert weighted_confidence(1.0, 1.0, 1.0, 1.0) == 100.0

def test_confidence_zero():
    assert weighted_confidence(0.0, 0.0, 0.0, 0.0) == 0.0

def test_confidence_weights_sum():
    # With all features = 1.0, should be 100 regardless of ref_missing
    assert weighted_confidence(1.0, 1.0, 0.0, 1.0, ref_missing=True) == 100.0

def test_confidence_ref_missing_redistribution():
    # ref_missing=True ignores reference score and redistributes weights
    normal = weighted_confidence(1.0, 1.0, 0.0, 1.0, ref_missing=False)
    missing = weighted_confidence(1.0, 1.0, 0.0, 1.0, ref_missing=True)
    assert missing > normal  # missing redistributes ref weight to other features

def test_confidence_monotone_amount():
    low  = weighted_confidence(0.5, 0.8, 0.8, 0.8)
    high = weighted_confidence(1.0, 0.8, 0.8, 0.8)
    assert high > low


# ── matcher direction gate ─────────────────────────────────────────────────────

def _make_pair(direction_b: str, direction_l: str):
    bank = [BankLine(
        id="B001", account_id="ACC-001",
        txn_date=date(2026, 8, 1),
        amount_paise=10_000_000,
        direction=direction_b,
        description="Acme Corp payment",
        reference="UTR300012345001",
    )]
    ledger = [LedgerEntry(
        id="L001", account_id="ACC-001",
        txn_date=date(2026, 8, 1),
        amount_paise=10_000_000,
        direction=direction_l,
        description="Acme Corp payment",
        reference="UTR300012345001",
    )]
    return bank, ledger

def test_direction_gate_same_matches():
    bank, ledger = _make_pair("credit", "credit")
    results = reconcile(bank, ledger)
    matched = [r for r in results if r.match_type == "auto_matched"]
    assert len(matched) == 1

def test_direction_gate_opposite_never_matches():
    bank, ledger = _make_pair("credit", "debit")
    results = reconcile(bank, ledger)
    matched = [r for r in results if r.match_type in ("auto_matched", "review")]
    assert len(matched) == 0

def test_ambiguity_guard():
    """Two ledger entries with same amount ±0 days → bank line should go to review."""
    bank = [BankLine(
        id="B001", account_id="ACC-001",
        txn_date=date(2026, 8, 1),
        amount_paise=5_000_000,
        direction="credit",
        description="Acme Corp",
        reference="",
    )]
    ledger = [
        LedgerEntry(id="L001", account_id="ACC-001", txn_date=date(2026, 8, 1),
                    amount_paise=5_000_000, direction="credit",
                    description="Acme Corp", reference=""),
        LedgerEntry(id="L002", account_id="ACC-001", txn_date=date(2026, 8, 1),
                    amount_paise=5_000_000, direction="credit",
                    description="Acme Corp", reference=""),
    ]
    results = reconcile(bank, ledger)
    bank_result = next(r for r in results if r.bank_id == "B001")
    assert bank_result.match_type == "review"
