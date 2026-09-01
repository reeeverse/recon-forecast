"""
Holt double exponential smoothing forecast + naive fallback.

holt_forecast() takes an already-built balance series (from cashflow.py)
and returns a list of 14-day point + band predictions.
"""

from datetime import date, timedelta

import numpy as np
import pandas as pd


def naive_forecast(series: pd.Series, horizon: int = 14) -> list[dict]:
    """
    Fallback when history < 14 days.
    Projects last balance + average of last 7 daily changes.
    """
    if len(series) == 0:
        last = 0
        avg_change = 0
    else:
        last = int(series.iloc[-1])
        changes = series.diff().dropna()
        avg_change = int(changes.tail(7).mean()) if len(changes) >= 1 else 0

    today = date.today()
    return [
        {
            "horizon_date": today + timedelta(days=i),
            "predicted_close_paise": last + avg_change * i,
            "predicted_low_paise": None,
            "predicted_high_paise": None,
        }
        for i in range(1, horizon + 1)
    ]


def holt_forecast(series: pd.Series, horizon: int = 14) -> list[dict]:
    """
    Holt (level + trend) exponential smoothing on a daily balance series.

    alpha=0.4 weights recent days without being jumpy.
    beta=0.2 lets the trend adapt slowly — right for steady cash burns.
    optimized=True lets statsmodels refine; fixed values are the fallback.

    Uncertainty band: residual σ × √horizon (widens as horizon grows).
    Falls back to naive_forecast if series is too short or fitting fails.
    """
    if len(series) < 14:
        return naive_forecast(series, horizon)

    try:
        from statsmodels.tsa.holtwinters import Holt

        y = series.values.astype(float)
        fit = Holt(y, initialization_method="estimated").fit(
            smoothing_level=0.4,
            smoothing_trend=0.2,
            optimized=True,
        )
        fc = fit.forecast(horizon)
        resid_sigma = float(np.std(y[1:] - fit.fittedvalues[1:]))

    except Exception:
        return naive_forecast(series, horizon)

    today = date.today()
    results = []
    for i, val in enumerate(fc, start=1):
        band = 1.28 * resid_sigma * np.sqrt(i)
        results.append(
            {
                "horizon_date": today + timedelta(days=i),
                "predicted_close_paise": int(val),
                "predicted_low_paise": int(val - band),
                "predicted_high_paise": int(val + band),
            }
        )
    return results
