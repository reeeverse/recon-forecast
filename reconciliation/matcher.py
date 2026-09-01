"""
Greedy reconciliation matcher.

reconcile(bank_lines, ledger_entries) scores every valid pair, then assigns
matches highest-confidence-first with a one-consumption rule so each ledger
entry backs at most one bank line.
"""

from dataclasses import dataclass
from datetime import date

from reconciliation.scoring import score_pair

AUTO_MIN = 85.0   # confidence ≥ AUTO_MIN → auto_matched
REVIEW_MIN = 60.0  # confidence ≥ REVIEW_MIN → review; below → unmatched
AMBIGUITY_MARGIN = 5.0  # rival within this many points → force to review


@dataclass
class BankLine:
    id: str
    account_id: str
    txn_date: date
    amount_paise: int
    direction: str
    description: str
    reference: str


@dataclass
class LedgerEntry:
    id: str
    account_id: str
    txn_date: date
    amount_paise: int
    direction: str
    description: str
    reference: str


@dataclass
class MatchResult:
    bank_id: str | None
    ledger_id: str | None
    match_type: str          # auto_matched | review | unmatched_bank | unmatched_ledger | duplicate_bank | duplicate_ledger
    exception_kind: str      # none | timing_diff | amount_diff | missing_ledger | missing_bank | duplicate | ambiguous
    confidence: float
    score_amount: float = 0.0
    score_date: float = 0.0
    score_reference: float = 0.0
    score_description: float = 0.0
    amount_delta_paise: int = 0
    date_delta_days: int = 0


def _classify_exception(scores: dict, bank: BankLine, ledger: LedgerEntry) -> str:
    """Determine the exception_kind for a matched pair."""
    date_delta = abs((bank.txn_date - ledger.txn_date).days)
    amount_delta = abs(abs(bank.amount_paise) - abs(ledger.amount_paise))

    if amount_delta == 0 and date_delta == 0:
        return "none"
    if amount_delta > 0 and date_delta == 0:
        return "amount_diff"
    if date_delta > 0 and amount_delta == 0:
        return "timing_diff"
    # Both differ — report whichever is more significant
    return "amount_diff" if amount_delta > 0 else "timing_diff"


def reconcile(
    bank_lines: list[BankLine],
    ledger_entries: list[LedgerEntry],
    auto_min: float = AUTO_MIN,
    review_min: float = REVIEW_MIN,
    ambiguity_margin: float = AMBIGUITY_MARGIN,
) -> list[MatchResult]:
    """
    Match bank lines against ledger entries.

    Algorithm:
    1. Score all valid pairs (same account, same direction).
    2. Sort by confidence descending.
    3. Greedy assignment: claim highest-scoring pairs first, skip if either
       side already consumed.
    4. Ambiguity guard: if a rival candidate is within ambiguity_margin points,
       force the result to 'review' regardless of confidence.
    5. Leftovers become unmatched_bank / unmatched_ledger.
    """
    results: list[MatchResult] = []
    matched_bank: set[str] = set()
    consumed_ledger: set[str] = set()

    # ── score all candidate pairs ──────────────────────────────────────────────
    scored: list[tuple[float, BankLine, LedgerEntry, dict]] = []

    for b in bank_lines:
        for le in ledger_entries:
            # Hard gates
            if b.account_id != le.account_id:
                continue
            if b.direction != le.direction:
                continue
            # Only score within a ±5-day window to avoid O(n²) on large datasets
            if abs((b.txn_date - le.txn_date).days) > 5:
                continue

            s = score_pair(
                b.amount_paise, b.txn_date, b.reference, b.description,
                le.amount_paise, le.txn_date, le.reference, le.description,
            )
            if s["confidence"] >= review_min:
                scored.append((s["confidence"], b, le, s))

    scored.sort(key=lambda t: t[0], reverse=True)

    # ── greedy assignment ──────────────────────────────────────────────────────
    # Pre-compute best rival confidence per bank line for ambiguity detection
    best_per_bank: dict[str, list[float]] = {}
    for conf, b, le, _ in scored:
        best_per_bank.setdefault(b.id, []).append(conf)

    for conf, b, le, s in scored:
        if b.id in matched_bank or le.id in consumed_ledger:
            continue

        rivals = best_per_bank.get(b.id, [])
        # rivals list is sorted desc; check if 2nd-best is within margin
        ambiguous = len(rivals) >= 2 and (rivals[0] - rivals[1]) <= ambiguity_margin

        if conf >= auto_min and not ambiguous and s["score_amount"] >= 0.6:
            match_type = "auto_matched"
        else:
            match_type = "review"

        exception_kind = "ambiguous" if ambiguous else _classify_exception(s, b, le)

        results.append(MatchResult(
            bank_id=b.id,
            ledger_id=le.id,
            match_type=match_type,
            exception_kind=exception_kind,
            confidence=conf,
            score_amount=s["score_amount"],
            score_date=s["score_date"],
            score_reference=s["score_reference"],
            score_description=s["score_description"],
            amount_delta_paise=abs(b.amount_paise) - abs(le.amount_paise),
            date_delta_days=(b.txn_date - le.txn_date).days,
        ))
        matched_bank.add(b.id)
        consumed_ledger.add(le.id)

    # ── leftovers ──────────────────────────────────────────────────────────────
    for b in bank_lines:
        if b.id not in matched_bank:
            results.append(MatchResult(
                bank_id=b.id,
                ledger_id=None,
                match_type="unmatched_bank",
                exception_kind="missing_ledger",
                confidence=0.0,
            ))

    for le in ledger_entries:
        if le.id not in consumed_ledger:
            results.append(MatchResult(
                bank_id=None,
                ledger_id=le.id,
                match_type="unmatched_ledger",
                exception_kind="missing_bank",
                confidence=0.0,
            ))

    return results
