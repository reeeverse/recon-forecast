"""
Thin wrapper around boto3 SNS/SES publish.
Falls back gracefully when topic_arn / credentials are not configured.
"""

from __future__ import annotations

import logging

import boto3

logger = logging.getLogger(__name__)


def _format_alert_message(alert: dict) -> str:
    severity = alert["severity"].upper()
    shortfall_rs = alert["shortfall_paise"] / 100
    predicted_rs = alert["predicted_close_paise"] / 100
    threshold_rs = alert["threshold_paise"] / 100
    return (
        f"Account: {alert['account_id']}\n"
        f"Severity: {severity}\n"
        f"Predicted breach date: {alert['breach_date']}\n"
        f"Predicted closing balance: ₹{predicted_rs:,.2f}\n"
        f"Minimum threshold: ₹{threshold_rs:,.2f}\n"
        f"Shortfall: ₹{shortfall_rs:,.2f}\n"
        f"Dedupe key: {alert['dedupe_key']}\n"
    )


def publish_alert(alert: dict, topic_arn: str, region: str = "ap-south-1") -> str | None:
    """Publish a threshold-breach alert to an SNS topic. Returns MessageId or None."""
    if not topic_arn:
        logger.info("SNS topic_arn not configured — skipping publish")
        return None

    account_id = alert["account_id"]
    severity = alert["severity"].upper()
    subject = f"[{severity}] Liquidity alert for {account_id} — breach on {alert['breach_date']}"
    message = _format_alert_message(alert)

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


def send_sms_alert(phone: str, message: str, region: str = "ap-south-1") -> None:
    """Send a direct SMS via SNS (no topic needed). No-op if phone is empty."""
    if not phone:
        return
    try:
        boto3.client("sns", region_name=region).publish(
            PhoneNumber=phone,
            Message=message[:1600],  # SNS SMS limit
        )
        logger.info("SMS sent to %s", phone)
    except Exception as exc:
        logger.warning("SMS dispatch failed: %s", exc)


def send_email_alert(
    to_email: str,
    subject: str,
    body: str,
    from_email: str,
    region: str = "ap-south-1",
) -> None:
    """Send a transactional email via SES. No-op if from_email is not configured."""
    if not from_email:
        logger.info("SES from_email not configured — skipping email to %s", to_email)
        return
    try:
        boto3.client("ses", region_name=region).send_email(
            Source=from_email,
            Destination={"ToAddresses": [to_email]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {"Text": {"Data": body, "Charset": "UTF-8"}},
            },
        )
        logger.info("Email sent to %s", to_email)
    except Exception as exc:
        logger.warning("Email dispatch failed: %s", exc)
