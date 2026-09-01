#!/bin/bash
# Deploy lambda/handler.py to AWS Lambda ingest-trigger
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_DEFAULT_REGION:-ap-south-1}"
FUNCTION="ingest-trigger"

echo "==> Packaging lambda/handler.py..."
TMPDIR=$(mktemp -d)
cp "$REPO/lambda/handler.py" "$TMPDIR/lambda_function.py"
cd "$TMPDIR" && zip -q lambda.zip lambda_function.py

echo "==> Deploying to $FUNCTION ($REGION)..."
aws lambda update-function-code \
  --function-name "$FUNCTION" \
  --zip-file fileb://lambda.zip \
  --region "$REGION" \
  --query "{State:State,LastModified:LastModified}" --output table

rm -rf "$TMPDIR"
echo "Done."
