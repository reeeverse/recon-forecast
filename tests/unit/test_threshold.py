from datetime import date, timedelta
from unittest.mock import MagicMock

from forecasting.threshold import evaluate_threshold, severity

# ── severity ───────────────────────────────────────────────────────────────────

def test_severity_critical_on_overdraft():
    assert severity(-1, 20_000_000, 5) == "critical"

def test_severity_high_within_3_days():
    assert severity(15_000_000, 20_000_000, 3) == "high"

def test_severity_high_large_shortfall():
    # shortfall = 10_000_000 = 50% of threshold → high
    assert severity(10_000_000, 20_000_000, 10) == "high"

def test_severity_medium_4_to_7_days():
    assert severity(18_000_000, 20_000_000, 6) == "medium"

def test_severity_low_8_to_14_days():
    assert severity(19_000_000, 20_000_000, 10) == "low"

def test_severity_boundary_day_7_is_medium():
    assert severity(19_000_000, 20_000_000, 7) == "medium"

def test_severity_boundary_day_8_is_low():
    assert severity(19_000_000, 20_000_000, 8) == "low"


# ── evaluate_threshold ─────────────────────────────────────────────────────────

def _make_points(n: int = 14, start: int = 25_000_000, daily: int = -1_900_000) -> list[dict]:
    today = date(2026, 8, 29)
    return [
        {
            "horizon_date": today + timedelta(days=i),
            "predicted_close_paise": start + daily * i,
        }
        for i in range(1, n + 1)
    ]


def _mock_db(existing_alert=None):
    db = MagicMock()
    execute_result = MagicMock()
    execute_result.fetchone.return_value = existing_alert
    db.execute.return_value = execute_result
    return db


def test_evaluate_no_breach_returns_none():
    points = [
        {"horizon_date": date(2026, 8, 30) + timedelta(days=i), "predicted_close_paise": 50_000_000}
        for i in range(14)
    ]
    db = _mock_db(existing_alert=None)
    result = evaluate_threshold("ACC-001", points, 20_000_000, 1, db)
    assert result is None
    db.commit.assert_not_called()


def test_evaluate_breach_creates_alert():
    points = _make_points(start=25_000_000, daily=-1_900_000)
    # With threshold 20_000_000, breach happens around day 3 (25M - 1.9M*3 = 19.3M < 20M)
    db = _mock_db(existing_alert=None)
    result = evaluate_threshold("ACC-001", points, 20_000_000, 1, db)
    assert result is not None
    assert result["account_id"] == "ACC-001"
    assert result["severity"] in ("high", "critical")
    assert result["shortfall_paise"] > 0
    db.commit.assert_called_once()


def test_evaluate_dedupe_returns_none_if_active_alert_exists():
    points = _make_points(start=25_000_000, daily=-1_900_000)
    existing = MagicMock()  # truthy — alert already exists
    db = _mock_db(existing_alert=existing)
    result = evaluate_threshold("ACC-001", points, 20_000_000, 1, db)
    assert result is None
    db.commit.assert_not_called()


def test_evaluate_first_breach_day_only():
    """Only the first breach should produce an alert, not subsequent days."""
    points = _make_points(start=25_000_000, daily=-1_900_000)
    db = _mock_db(existing_alert=None)
    evaluate_threshold("ACC-001", points, 20_000_000, 1, db)
    # One SELECT (dedupe check) + one INSERT = 2 total execute calls
    assert db.execute.call_count == 2
    db.commit.assert_called_once()


def test_evaluate_returns_correct_shortfall():
    threshold = 20_000_000
    # Force a specific breach amount
    points = [{"horizon_date": date(2026, 8, 30), "predicted_close_paise": 18_000_000}]
    db = _mock_db(existing_alert=None)
    result = evaluate_threshold("ACC-001", points, threshold, 1, db)
    assert result["shortfall_paise"] == 2_000_000
