# AWS Infrastructure — recon-forecast

Region: `ap-south-1` (Mumbai)

## Resources Provisioned

### Networking
| Resource | ID / Value |
|---|---|
| VPC | `vpc-04b6b47e884647277` (10.0.0.0/16) |
| Public subnet | `subnet-0ac9f61a121eccdb0` (10.0.1.0/24, `ap-south-1a`) |
| Private subnet | `subnet-08b7f922ae531fa44` (10.0.2.0/24, `ap-south-1b`) |
| Internet Gateway | attached to VPC, public subnet route `0.0.0.0/0 → igw` |
| EC2 SG | `sg-0f1a960562855f5e8` — inbound: 22 (SSH), 80 (HTTP) |
| RDS SG | `sg-0804fd171bb87e578` — inbound: 5432 from EC2 SG only |

### Compute
| Resource | Value |
|---|---|
| EC2 | `i-0ba6a62c820ec8a8b`, `t3.micro`, public IP `65.2.124.22` |
| Key pair | `~/recon-key.pem` (local only) |
| AMI | Amazon Linux 2023 |
| App path | `/home/ec2-user/app` (branch: `feat/recon-scoring`) |
| Systemd | `recon-api.service` → uvicorn on port 8000 |
| Nginx | reverse proxy port 80 → 8000 |

### Database
| Resource | Value |
|---|---|
| RDS | `recon-db.cjy62w428abv.ap-south-1.rds.amazonaws.com` |
| Engine | PostgreSQL 15, `db.t3.micro`, private subnet |
| DB name | `recon`, user `recon` |
| Password | SSM Parameter Store `/recon/db_password` |
| Schema | 8 tables: `accounts`, `import_batches`, `bank_statement_lines`, `ledger_entries`, `reconciliation_results`, `verified_transactions`, `forecasts`, `alerts` |

### Storage
| Resource | Value |
|---|---|
| S3 bucket | `recon-forecast-083363539900-uploads` |
| Versioning | Enabled |
| Public access | Blocked |
| Trigger | `ledger.csv` suffix → Lambda `ingest-trigger` |

### Serverless
| Resource | Value |
|---|---|
| Lambda | `ingest-trigger`, Python 3.12, 120s timeout |
| Env vars | `EC2_INGEST_URL=http://65.2.124.22/api/v1/internal/ingest` |
| DynamoDB | `cash_snapshot`, PK `account_id`, PAY_PER_REQUEST |

### Messaging & Observability
| Resource | Value |
|---|---|
| SNS topic | `arn:aws:sns:ap-south-1:083363539900:liquidity-alerts` |
| Subscription | `7stardevelopers7777@gmail.com` (confirm in inbox) |
| CW alarm | `lambda-ingest-errors` — Errors ≥ 1 / 5 min → SNS |
| Log groups | `/aws/lambda/ingest-trigger`, `/recon/api` (30-day retention) |

### IAM
| Role | Purpose |
|---|---|
| `ec2-app-role` | EC2 instance profile: S3 rw, DynamoDB rw+describe, SNS publish+attr, SSM read |
| `lambda-ingest-role` | Lambda: S3 GetObject, basic execution |

## EC2 .env
```
DATABASE_URL=postgresql://recon:<password>@recon-db.cjy62w428abv.ap-south-1.rds.amazonaws.com:5432/recon
SNS_TOPIC_ARN=arn:aws:sns:ap-south-1:083363539900:liquidity-alerts
DYNAMODB_TABLE=cash_snapshot
INGEST_SECRET=changeme
DASHBOARD_TOKEN=changeme
AWS_REGION=ap-south-1
S3_BUCKET=recon-forecast-083363539900-uploads
```

## Health Check
```bash
curl http://65.2.124.22/api/v1/health
# {"status":"ok","db":"ok","dynamo":"ok","sns":"ok","version":"0.1.0"}
```

## Day 5 TODO
- React dashboard (Recharts): reconciliation summary, exceptions table, forecast chart, alerts banner
- Vite dev → `npm run build` → serve static from EC2 nginx
- SNS email confirmation (check inbox)
