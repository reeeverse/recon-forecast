#!/bin/bash
# Runs inside LocalStack on startup — creates S3 bucket, SNS topic, DynamoDB table
set -e
REGION=ap-south-1
BUCKET=recon-forecast-local-uploads

awslocal s3 mb s3://${BUCKET} --region ${REGION}
awslocal s3api put-bucket-versioning --bucket ${BUCKET} \
  --versioning-configuration Status=Enabled

awslocal sns create-topic --name liquidity-alerts --region ${REGION}

awslocal dynamodb create-table \
  --table-name cash_snapshot \
  --attribute-definitions AttributeName=account_id,AttributeType=S \
  --key-schema AttributeName=account_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ${REGION}

echo "LocalStack init complete"
