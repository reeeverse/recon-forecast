"""
Threshold evaluation, severity classification, and de-duplicated alert creation.
"""

from sqlalchemy import text
from sqlalchemy.orm import Session


def severity(predicted_paise: int, threshold_paise: int, days_ahead: int) -> str:
    """
    Classify alert severity based on balance and proximity of breach.

    critical : projected overdraft (balance < 0)
    high     : breach within 3 days OR shortfall ≥ 25% of threshold
    medium   : breach within 4–7 days
    low      : breach within 8–14 days
    """
    if predicted_paise < 0:
        return "critical"
    shortfall = threshold_paise - predicted_paise
    if days_ahead <= 3 or shortfall >= threshold_paise * 0.25:
        return "high"
    if days_ahead <= 7:
        return "medium"
    return "low"


def evaluate_threshold(
    account_id: str,
    forecast_points: list[dict],
    threshold_paise: int,
    forecast_run_id: int,
    db: Session,
) -> dict | None:
    """
    Scan forecast points for the first predicted breach below threshold_paise.
    If found and no active alert with the same dedupe_key exists, insert an
    alerts row and return it. Returns None if no breach or already alerted.

    Only the first breach day is acted on (one alert per run per account).
    """
    for i, point in enumerate(forecast_points, start=1):
        predicted = point["predicted_close_paise"]
        if predicted >= threshold_paise:
            continue

        breach_date = point["horizon_date"]
        shortfall = threshold_paise - predicted
        sev = severity(predicted, threshold_paise, i)
        dedupe_key = f"{account_id}|{breach_date}|{sev}"

        existing = db.execute(
            text("SELECT id FROM alerts WHERE dedupe_key = :k AND status = 'active'"),
            {"k": dedupe_key},
        ).fetchone()

        if existing:
            return None

        db.execute(
            text("""
                INSERT INTO alerts (
                    account_id, forecast_id, severity, breach_date,
                    predicted_close_paise, threshold_paise, shortfall_paise,
                    status, dedupe_key, updated_at
                ) VALUES (
                    :account_id, :forecast_id, :severity, :breach_date,
                    :predicted, :threshold, :shortfall,
                    'active', :dedupe_key, now()
                )
            """),
            {
                "account_id": account_id,
                "forecast_id": forecast_run_id,
                "severity": sev,
                "breach_date": breach_date,
                "predicted": predicted,
                "threshold": threshold_paise,
                "shortfall": shortfall,
                "dedupe_key": dedupe_key,
            },
        )
        db.commit()

        return {
            "account_id": account_id,
            "severity": sev,
            "breach_date": str(breach_date),
            "predicted_close_paise": predicted,
            "threshold_paise": threshold_paise,
            "shortfall_paise": shortfall,
            "dedupe_key": dedupe_key,
        }

    return None


def expire_stale_alerts(account_id: str, forecast_points: list[dict], db: Session) -> int:
    """
    Resolve alerts whose breach_date is now in the past, or where the latest
    forecast no longer shows a breach. Returns count of alerts expired.
    """
    breach_dates = {str(p["horizon_date"]) for p in forecast_points if p["predicted_close_paise"] < 0}

    result = db.execute(
        text("""
            UPDATE alerts
            SET status = 'expired', updated_at = now()
            WHERE account_id = :id
              AND status = 'active'
              AND breach_date::text NOT IN :breach_dates
        """),
        {"id": account_id, "breach_dates": tuple(breach_dates) or ("__none__",)},
    )
    db.commit()
    return result.rowcount
