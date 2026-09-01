#!/bin/bash
# Demo runner — AWS or LocalStack
# Usage: scripts/run_demo.sh [--local]
set -euo pipefail
MODE=${1:-aws}
if [[ "$MODE" == "--local" ]]; then
  echo "Running demo on LocalStack..."
  # TODO Day 6: upload data/demo/ to LocalStack S3 and tail the chain
else
  echo "Running demo on AWS..."
  # TODO Day 6: upload data/demo/ to real S3 and tail CloudWatch
fi
echo "run_demo.sh not yet fully implemented"
