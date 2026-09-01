"""
Thin wrapper around boto3 SNS publish.
Falls back gracefully when topic_arn is empty (dev/test without AWS).
"""

from __future__ import annotations

import logging

import boto3

logger = logging.getLogger(__name__)


def publish_alert(alert: dict, topic_arn: str, region: str = "ap-south-1") -> str | None:
    """
    Publish a threshold-breach alert to SNS.
    Returns the MessageId on success, None if topic_arn is empty.
    """
    if not topic_arn:
        logger.info("SNS topic_arn not configured — skipping publish")
        return None

    account_id = alert["account_id"]
    severity = alert["severity"].upper()
    shortfall_rs = alert["shortfall_paise"] / 100
    breach_date = alert["breach_date"]
    predicted_rs = alert["predicted_close_paise"] / 100
    threshold_rs = alert["threshold_paise"] / 100

    subject = f"[{severity}] Liquidity alert for {account_id} — breach on {breach_date}"
    message = (
        f"Account: {account_id}\n"
        f"Severity: {severity}\n"
        f"Predicted breach date: {breach_date}\n"
        f"Predicted closing balance: ₹{predicted_rs:,.2f}\n"
        f"Minimum threshold: ₹{threshold_rs:,.2f}\n"
        f"Shortfall: ₹{shortfall_rs:,.2f}\n"
        f"Dedupe key: {alert['dedupe_key']}\n"
    )

    client = boto3.client("sns", region_name=region)
    response = client.publish(
        TopicArn=topic_arn,
        Subject=subject,
        Message=message,
        MessageAttributes={
            "account_id": {"DataType": "String", "StringValue": account_id},
            "severity": {"DataType": "String", "StringValue": alert["severity"]},
        },
    )
    msg_id = response["MessageId"]
    logger.info("SNS published: %s (account=%s, severity=%s)", msg_id, account_id, severity)
    return msg_id
