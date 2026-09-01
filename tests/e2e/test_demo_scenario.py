"""
E2E harness: run reconcile() on synthetic data, score results against expected.json.

Usage:
    python -m pytest tests/e2e/test_demo_scenario.py -v

Requires data/bank_statement.csv, data/ledger.csv, data/expected.json.
Run `python data/generate.py --seed 42` first if they don't exist.
"""

import json
from pathlib import Path

import pandas as pd
import pytest

from reconciliation.matcher import BankLine, LedgerEntry, reconcile

DATA_DIR = Path(__file__).parent.parent.parent / "data"


def _load_bank(path: Path) -> list[BankLine]:
    df = pd.read_csv(path)
    lines = []
    for _, row in df.iterrows():
        lines.append(
            BankLine(
                id=str(row["id"]) if "id" in df.columns else str(_),
                account_id=row["account_id"],
                txn_date=pd.to_datetime(row["txn_date"]).date(),
                amount_paise=int(row["amount_paise"]),
                direction=row["direction"],
                description=str(row.get("description", "")),
                reference=str(row.get("reference", "")),
            )
        )
    return lines


def _load_ledger(path: Path) -> list[LedgerEntry]:
    df = pd.read_csv(path)
    entries = []
    for _, row in df.iterrows():
        entries.append(
            LedgerEntry(
                id=str(row["id"]) if "id" in df.columns else str(_),
                account_id=row["account_id"],
                txn_date=pd.to_datetime(row["txn_date"]).date(),
                amount_paise=int(row["amount_paise"]),
                direction=row["direction"],
                description=str(row.get("description", "")),
                reference=str(row.get("reference", "")),
            )
        )
    return entries


@pytest.fixture(scope="module")
def synthetic_data():
    bank_path = DATA_DIR / "bank_statement.csv"
    ledger_path = DATA_DIR / "ledger.csv"
    expected_path = DATA_DIR / "expected.json"

    if not all(p.exists() for p in [bank_path, ledger_path, expected_path]):
        pytest.skip("Synthetic data not generated — run: python data/generate.py --seed 42")

    bank = _load_bank(bank_path)
    ledger = _load_ledger(ledger_path)
    expected = json.loads(expected_path.read_text())
    return bank, ledger, expected


@pytest.fixture(scope="module")
def reconcile_results(synthetic_data):
    bank, ledger, _ = synthetic_data
    return reconcile(bank, ledger)


def test_match_rate_above_70_pct(reconcile_results, synthetic_data):
    """At least 70% of bank rows should be auto-matched or review."""
    bank, _, _ = synthetic_data
    auto = sum(1 for r in reconcile_results if r.match_type == "auto_matched")
    total = len(bank)
    rate = auto / total
    assert rate >= 0.70, f"auto-match rate {rate:.1%} < 70%"


def test_no_double_assignment(reconcile_results):
    """Each bank_id and ledger_id appears at most once in matched results."""
    matched = [r for r in reconcile_results if r.ledger_id is not None]
    bank_ids = [r.bank_id for r in matched]
    ledger_ids = [r.ledger_id for r in matched]
    assert len(bank_ids) == len(set(bank_ids)), "bank_id assigned to multiple matches"
    assert len(ledger_ids) == len(set(ledger_ids)), "ledger_id assigned to multiple matches"


def test_confusion_matrix(reconcile_results, synthetic_data):
    """
    Compare matched pairs against expected.json ground truth.
    Compute precision and recall; both must be ≥ 0.70 for auto_matched pairs.
    """
    _, _, expected = synthetic_data

    # Build ground-truth lookup: bank_id → ledger_id for clean matches
    gt_pairs: dict[str, str] = {}
    for item in expected:
        if item.get("label") == "clean":
            gt_pairs[str(item["bank_row_id"])] = str(item["ledger_row_id"])

    if not gt_pairs:
        pytest.skip("No clean ground-truth pairs in expected.json")

    auto_matched = {
        r.bank_id: r.ledger_id
        for r in reconcile_results
        if r.match_type == "auto_matched" and r.ledger_id is not None
    }

    tp = sum(1 for bid, lid in auto_matched.items() if gt_pairs.get(bid) == lid)
    fp = sum(1 for bid, lid in auto_matched.items() if gt_pairs.get(bid) != lid)
    fn = sum(1 for bid in gt_pairs if bid not in auto_matched)

    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0

    print(f"\nConfusion matrix: TP={tp}, FP={fp}, FN={fn}")
    print(f"Precision={precision:.2%}, Recall={recall:.2%}")

    assert precision >= 0.70, f"Precision {precision:.2%} < 70%"
    assert recall >= 0.70, f"Recall {recall:.2%} < 70%"


def test_high_confidence_no_mismatches(reconcile_results, synthetic_data):
    """Auto-matched rows with confidence ≥ 90 should never mismatch ground truth."""
    _, _, expected = synthetic_data
    gt_pairs = {
        str(item["bank_row_id"]): str(item["ledger_row_id"])
        for item in expected
        if item.get("label") == "clean"
    }
    high_conf_mismatches = [
        r
        for r in reconcile_results
        if r.match_type == "auto_matched"
        and r.confidence >= 90.0
        and r.ledger_id is not None
        and gt_pairs.get(r.bank_id) not in (r.ledger_id, None)
    ]
    assert high_conf_mismatches == [], (
        f"{len(high_conf_mismatches)} high-confidence mismatches found"
    )
