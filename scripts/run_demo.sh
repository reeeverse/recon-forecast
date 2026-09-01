#!/bin/bash
# Demo runner — uploads frozen CSVs to S3, triggers Lambda pipeline, shows results.
# Usage:
#   scripts/run_demo.sh              # upload to real S3 (triggers Lambda → EC2)
#   scripts/run_demo.sh --local      # run local pipeline directly (no Lambda)
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_DEFAULT_REGION:-ap-south-1}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")
BUCKET="${S3_BUCKET:-recon-forecast-${ACCOUNT_ID}-uploads}"
EC2="http://65.2.124.22"
TOKEN="${DASHBOARD_TOKEN:-changeme}"
ACCT="ACC-001"
TS=$(date -u +%Y%m%dT%H%M%S)
PREFIX="raw/${ACCT}/${TS}"

MODE="${1:---aws}"

if [[ "$MODE" == "--local" ]]; then
  echo "==> Local pipeline (generate → reconcile → forecast)..."
  cd "$REPO"
  export PYTHONPATH="$REPO"
  python3 data/generate.py --seed 42 --output-dir data/
  bash scripts/run_local.sh
  exit 0
fi

# AWS demo
echo "==> Uploading demo CSVs to s3://${BUCKET}/${PREFIX}/"
aws s3 cp "$REPO/data/demo/bank.csv"   "s3://${BUCKET}/${PREFIX}/statement.csv" --region "$REGION"
aws s3 cp "$REPO/data/demo/ledger.csv" "s3://${BUCKET}/${PREFIX}/ledger.csv"    --region "$REGION"
echo "    Uploaded. Lambda trigger fires on ledger.csv..."

echo "==> Waiting 30s for pipeline to complete..."
sleep 30

echo "==> Checking results via API..."
curl -s -H "Authorization: Bearer ${TOKEN}" "${EC2}/api/v1/reconciliation/summary?account_id=${ACCT}" \
  | python3 -m json.tool

echo "==> Checking alerts..."
curl -s -H "Authorization: Bearer ${TOKEN}" "${EC2}/api/v1/alerts" | python3 -m json.tool

echo ""
echo "Dashboard: ${EC2}/"
