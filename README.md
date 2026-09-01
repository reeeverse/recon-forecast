# recon-forecast

**Reconciliation → Liquidity Forecasting Pipeline**

> "Forecasting is only as good as the data behind it, so we built a reconciliation layer first to guarantee clean transaction data, then fed that into a real-time liquidity forecasting engine that alerts before a threshold is breached."

## Architecture

```
S3 upload → Lambda (thin) → FastAPI on EC2
  → RDS PostgreSQL (system of record)
  → DynamoDB (fast dashboard reads)
  → SNS (email alerts)
  → React dashboard
```

See `docs/02-architecture.md` for the full diagram and component breakdown.

## Quick start (local)

```bash
# 1. Start Postgres + LocalStack
docker compose -f infrastructure/localstack/docker-compose.yml up -d

# 2. Apply schema + seed accounts
scripts/seed_db.sh

# 3. Generate synthetic data
python data/generate.py --seed 42

# 4. Run tests
pytest -q

# 5. Run the canonical demo scenario
scripts/run_local.sh --demo

# 6. Start the frontend dev server
cd frontend && npm install && npm run dev
```

## AWS deploy

See `infrastructure/setup-aws.md`.

## Docs

| File | Contents |
|---|---|
| `docs/01-scope.md` | MVP definition, out-of-scope, scope-cut ladder |
| `docs/02-architecture.md` | Component diagram, data flow |
| `docs/03-database.md` | Schema, ERD, DynamoDB access pattern |
| `docs/04-reconciliation.md` | Matching algorithm, weights, thresholds |
| `docs/05-forecasting.md` | Holt model, accuracy targets |
| `docs/06-pipeline.md` | Event-driven flow (S3 → Lambda → EC2) |
| `docs/07-aws.md` | Infrastructure, IAM, security |
| `docs/08-api.md` | All 15 endpoints |
| `docs/09-frontend.md` | Component breakdown, build order |
| `docs/10-testing.md` | Unit, integration, e2e strategy |
| `docs/11-demo.md` | 5-minute demo script |
| `docs/12-viva.md` | Interview Q&A |
| `docs/13-failure-modes.md` | Known risks + fallbacks |
