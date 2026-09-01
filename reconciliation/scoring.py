"""
Feature scorers for reconciliation matching.

Each scorer returns a float in [0.0, 1.0].
weighted_confidence() combines them into a 0–100 confidence score.
"""

from datetime import date

from rapidfuzz import fuzz

from reconciliation.normalize import normalize_description, normalize_reference

# ── individual feature scorers ─────────────────────────────────────────────────

def amount_score(a: int, b: int) -> float:
    """
    1.0 for exact match; linear decay to 0 at tolerance boundary.
    Tolerance = max(100 paise, 1% of the larger absolute amount).
    0.0 if either amount is zero or beyond tolerance.
    """
    if a == b:
        return 1.0
    abs_a, abs_b = abs(a), abs(b)
    if abs_a == 0 and abs_b == 0:
        return 1.0
    tol = max(100, int(max(abs_a, abs_b) * 0.01))
    delta = abs(abs_a - abs_b)
    if delta >= tol:
        return 0.0
    return 1.0 - delta / tol


def date_score(a: date, b: date) -> float:
    """
    1.0 for same day; linear decay to 0 at ±5 days. 0.0 beyond 5 days.
    Handles posting lags (weekends, cut-off times) common in bank recon.
    """
    delta = abs((a - b).days)
    if delta >= 5:
        return 0.0
    return 1.0 - delta / 5


def reference_score(a: str, b: str) -> float:
    """
    1.0 for exact normalized match; fuzzy ratio otherwise.
    0.0 if either reference is blank — missing refs are not evidence of mismatch,
    so callers should handle the ref_missing case via weight redistribution.
    """
    norm_a = normalize_reference(a)
    norm_b = normalize_reference(b)
    if not norm_a or not norm_b:
        return 0.0
    if norm_a == norm_b:
        return 1.0
    return fuzz.ratio(norm_a, norm_b) / 100.0


def description_score(a: str, b: str) -> float:
    """token_set_ratio handles word-order differences and abbreviations."""
    norm_a = normalize_description(a)
    norm_b = normalize_description(b)
    if not norm_a or not norm_b:
        return 0.0
    return fuzz.token_set_ratio(norm_a, norm_b) / 100.0


# ── confidence aggregator ──────────────────────────────────────────────────────

def weighted_confidence(
    amount: float,
    date: float,
    reference: float,
    description: float,
    ref_missing: bool = False,
) -> float:
    """
    Return a 0–100 confidence score.

    Normal weights:   amount=0.45, date=0.25, reference=0.20, description=0.10
    Ref-missing path: amount=0.55, date=0.30, description=0.15
      (redistributes the reference weight so rows without UTR numbers
       aren't unfairly penalised)
    """
    if ref_missing:
        score = 0.55 * amount + 0.30 * date + 0.15 * description
    else:
        score = 0.45 * amount + 0.25 * date + 0.20 * reference + 0.10 * description
    return round(score * 100, 2)


def score_pair(
    bank_amount: int,
    bank_date: date,
    bank_ref: str,
    bank_desc: str,
    ledger_amount: int,
    ledger_date: date,
    ledger_ref: str,
    ledger_desc: str,
) -> dict:
    """
    Compute all feature scores and the final confidence for a bank/ledger pair.
    Returns a dict with individual scores and the combined confidence.
    """
    s_amount = amount_score(bank_amount, ledger_amount)
    s_date = date_score(bank_date, ledger_date)
    s_ref = reference_score(bank_ref, ledger_ref)
    s_desc = description_score(bank_desc, ledger_desc)

    ref_missing = not normalize_reference(bank_ref) or not normalize_reference(ledger_ref)

    confidence = weighted_confidence(
        s_amount, s_date, s_ref, s_desc, ref_missing=ref_missing
    )

    return {
        "score_amount": s_amount,
        "score_date": s_date,
        "score_reference": s_ref,
        "score_description": s_desc,
        "ref_missing": ref_missing,
        "confidence": confidence,
    }
