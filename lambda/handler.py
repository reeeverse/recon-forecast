"""S3 trigger → POST /api/v1/internal/ingest on EC2. Stdlib only."""
import json
import os
import urllib.error
import urllib.request

EC2_URL = os.environ["EC2_INGEST_URL"]
INGEST_SECRET = os.environ["INGEST_SECRET"]


def handler(event, context):
    for record in event.get("Records", []):
        bucket = record["s3"]["bucket"]["name"]
        key = record["s3"]["object"]["key"]

        # Only trigger on ledger.csv — both files land together, avoid double-fire
        if not key.endswith("ledger.csv"):
            print(f"skip: {key}")
            continue

        # Key format: raw/{account_id}/{batch_ts}/ledger.csv
        parts = key.split("/")
        if len(parts) < 4:
            print(f"unexpected key format: {key}")
            continue

        account_id = parts[1]
        s3_prefix = "/".join(parts[:3]) + "/"

        payload = json.dumps(
            {"account_id": account_id, "s3_prefix": s3_prefix, "bucket": bucket}
        ).encode()

        req = urllib.request.Request(
            EC2_URL,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "X-Ingest-Secret": INGEST_SECRET,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                body = resp.read().decode()
                print(f"ingest ok [{resp.status}] {account_id}: {body[:300]}")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode()
            print(f"ingest http error {exc.code} for {key}: {body[:300]}")
            raise
        except Exception as exc:
            print(f"ingest failed for {key}: {exc}")
            raise

    return {"statusCode": 200}
