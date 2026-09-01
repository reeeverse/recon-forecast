#!/bin/bash
# Run the full pipeline locally against Postgres + LocalStack
# Usage: scripts/run_local.sh [--demo]
set -euo pipefail
DEMO=${1:-}
if [[ "$DEMO" == "--demo" ]]; then
  echo "Running canonical demo scenario..."
  # TODO Day 3: load data/demo/ files and run full chain
else
  echo "Running on generated data..."
  # TODO Day 3: load generated CSVs and run full chain
fi
echo "run_local.sh not yet fully implemented"
