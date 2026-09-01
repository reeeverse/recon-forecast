"""
Holdout backtest: truncate the real series, forecast forward, compare to actuals.
Reports MAPE and MAE at horizons 1, 3, 7, 14 days.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from forecasting.model import holt_forecast


def _mape(actual: float, predicted: float) -> float:
    if actual == 0:
        return 0.0
    return abs(actual - predicted) / abs(actual) * 100.0


def run_backtest(
    series: pd.Series,
    horizons: tuple[int, ...] = (1, 3, 7, 14),
) -> dict:
    """
    Walk-forward backtest: for each origin t, forecast up to max(horizons) steps
    ahead and compare to actuals.  Requires at least 28 days of history.

    Returns:
        {
          "n_origins": int,
          "horizons": [{"h": int, "mape": float, "mae_paise": int}],
          "baseline_mape": float,   # naive yesterday-carries-forward
        }
    """
    max_h = max(horizons)
    min_train = 14
    if len(series) < min_train + max_h:
        return {"n_origins": 0, "horizons": [], "baseline_mape": None}

    errors: dict[int, list[tuple[float, float]]] = {h: [] for h in horizons}
    baseline_errors: list[float] = []

    n_origins = 0
    for end in range(min_train, len(series) - max_h + 1):
        train = series.iloc[:end]
        actuals = series.iloc[end : end + max_h]

        fc = holt_forecast(train, horizon=max_h)
        n_origins += 1

        for h in horizons:
            if h > len(actuals):
                continue
            actual = float(actuals.iloc[h - 1])
            predicted = float(fc[h - 1]["predicted_close_paise"])
            errors[h].append((actual, predicted))

        # naive baseline: last known value repeated
        last_val = float(train.iloc[-1])
        for i in range(min(max_h, len(actuals))):
            baseline_errors.append(_mape(float(actuals.iloc[i]), last_val))

    result_horizons = []
    for h in horizons:
        pairs = errors[h]
        if not pairs:
            continue
        mape = float(np.mean([_mape(a, p) for a, p in pairs]))
        mae = float(np.mean([abs(a - p) for a, p in pairs]))
        result_horizons.append({"h": h, "mape": round(mape, 2), "mae_paise": int(mae)})

    baseline_mape = float(np.mean(baseline_errors)) if baseline_errors else None

    return {
        "n_origins": n_origins,
        "horizons": result_horizons,
        "baseline_mape": round(baseline_mape, 2) if baseline_mape is not None else None,
    }
