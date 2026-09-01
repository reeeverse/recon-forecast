from datetime import date, timedelta

import pandas as pd

from forecasting.model import holt_forecast, naive_forecast


def _make_series(n: int, start_paise: int = 100_000_000, daily_change: int = -1_900_000) -> pd.Series:
    """Build a synthetic daily balance series with a constant trend."""
    today = date(2026, 8, 29)
    start = today - timedelta(days=n - 1)
    idx = pd.date_range(start, today, freq="D")
    values = [start_paise + daily_change * i for i in range(n)]
    return pd.Series(values, index=idx, dtype="int64")


# ── naive_forecast ─────────────────────────────────────────────────────────────

def test_naive_returns_horizon_points():
    series = _make_series(5)
    result = naive_forecast(series, horizon=14)
    assert len(result) == 14


def test_naive_dates_contiguous():
    series = _make_series(5)
    result = naive_forecast(series, horizon=14)
    today = date.today()
    for i, point in enumerate(result, start=1):
        assert point["horizon_date"] == today + timedelta(days=i)


def test_naive_empty_series():
    result = naive_forecast(pd.Series([], dtype="int64"), horizon=14)
    assert len(result) == 14
    assert all(p["predicted_close_paise"] == 0 for p in result)


def test_naive_declining_trend():
    series = _make_series(10, daily_change=-500_000)
    result = naive_forecast(series, horizon=3)
    balances = [p["predicted_close_paise"] for p in result]
    assert balances[0] > balances[1] > balances[2]


# ── holt_forecast ──────────────────────────────────────────────────────────────

def test_holt_falls_back_on_short_history():
    series = _make_series(5)
    result = holt_forecast(series, horizon=14)
    assert len(result) == 14
    # fallback returns None bands
    assert result[0]["predicted_low_paise"] is None


def test_holt_returns_horizon_points():
    series = _make_series(60)
    result = holt_forecast(series, horizon=14)
    assert len(result) == 14


def test_holt_dates_contiguous():
    series = _make_series(60)
    result = holt_forecast(series, horizon=14)
    today = date.today()
    for i, point in enumerate(result, start=1):
        assert point["horizon_date"] == today + timedelta(days=i)


def test_holt_declining_series_gives_declining_forecast():
    series = _make_series(60, daily_change=-1_000_000)
    result = holt_forecast(series, horizon=7)
    balances = [p["predicted_close_paise"] for p in result]
    # At least the overall direction should be declining
    assert balances[-1] < balances[0]


def test_holt_has_bands_with_enough_history():
    series = _make_series(60)
    result = holt_forecast(series, horizon=14)
    for point in result:
        assert point["predicted_low_paise"] is not None
        assert point["predicted_high_paise"] is not None
        assert point["predicted_low_paise"] <= point["predicted_close_paise"]
        assert point["predicted_high_paise"] >= point["predicted_close_paise"]


def test_holt_band_widens_over_horizon():
    series = _make_series(60)
    result = holt_forecast(series, horizon=14)
    bands = [p["predicted_high_paise"] - p["predicted_low_paise"] for p in result]
    # Band at day 14 should be wider than at day 1
    assert bands[-1] >= bands[0]
