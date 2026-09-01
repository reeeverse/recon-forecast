-- recon-forecast schema — all money as BIGINT paise, all timestamps TIMESTAMPTZ UTC
-- Apply: psql $DATABASE_URL -f backend/schema.sql

-- ============ accounts ============
CREATE TABLE IF NOT EXISTS accounts (
    id                      TEXT PRIMARY KEY,
    name                    TEXT NOT NULL,
    currency                CHAR(3) NOT NULL DEFAULT 'INR',
    opening_balance_paise   BIGINT NOT NULL DEFAULT 0,
    opening_balance_date    DATE NOT NULL,
    min_threshold_paise     BIGINT NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ import_batches ============
CREATE TABLE IF NOT EXISTS import_batches (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id          TEXT NOT NULL REFERENCES accounts(id),
    s3_key_statement    TEXT,
    s3_key_ledger       TEXT,
    status              TEXT NOT NULL DEFAULT 'ingested'
                        CHECK (status IN ('ingested','reconciled','forecast_done','failed')),
    bank_row_count      INT DEFAULT 0,
    ledger_row_count    INT DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ bank_statement_lines ============
CREATE TABLE IF NOT EXISTS bank_statement_lines (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id        BIGINT NOT NULL REFERENCES import_batches(id),
    account_id      TEXT NOT NULL REFERENCES accounts(id),
    txn_date        DATE NOT NULL,
    value_date      DATE,
    amount_paise    BIGINT NOT NULL,
    direction       TEXT NOT NULL CHECK (direction IN ('credit','debit')),
    description     TEXT,
    reference       TEXT,
    raw_row_hash    TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_bsl_batch     ON bank_statement_lines(batch_id);
CREATE INDEX IF NOT EXISTS ix_bsl_match_key ON bank_statement_lines(account_id, txn_date, amount_paise);
CREATE INDEX IF NOT EXISTS ix_bsl_ref       ON bank_statement_lines(account_id, reference);
CREATE INDEX IF NOT EXISTS ix_bsl_hash      ON bank_statement_lines(batch_id, raw_row_hash);

-- ============ ledger_entries ============
CREATE TABLE IF NOT EXISTS ledger_entries (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id        BIGINT NOT NULL REFERENCES import_batches(id),
    account_id      TEXT NOT NULL REFERENCES accounts(id),
    txn_date        DATE NOT NULL,
    amount_paise    BIGINT NOT NULL,
    direction       TEXT NOT NULL CHECK (direction IN ('credit','debit')),
    description     TEXT,
    reference       TEXT,
    counterparty    TEXT,
    raw_row_hash    TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_le_batch     ON ledger_entries(batch_id);
CREATE INDEX IF NOT EXISTS ix_le_match_key ON ledger_entries(account_id, txn_date, amount_paise);
CREATE INDEX IF NOT EXISTS ix_le_ref       ON ledger_entries(account_id, reference);
CREATE INDEX IF NOT EXISTS ix_le_hash      ON ledger_entries(batch_id, raw_row_hash);

-- ============ reconciliation_results ============
CREATE TABLE IF NOT EXISTS reconciliation_results (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id            BIGINT NOT NULL REFERENCES import_batches(id),
    bank_line_id        BIGINT REFERENCES bank_statement_lines(id),
    ledger_entry_id     BIGINT REFERENCES ledger_entries(id),
    match_type          TEXT NOT NULL CHECK (match_type IN
                        ('auto_matched','review','unmatched_bank','unmatched_ledger',
                         'duplicate_bank','duplicate_ledger')),
    exception_kind      TEXT CHECK (exception_kind IN
                        ('none','timing_diff','amount_diff','missing_ledger',
                         'missing_bank','duplicate','ambiguous')),
    confidence          NUMERIC(5,2) NOT NULL DEFAULT 0,
    score_amount        NUMERIC(5,2),
    score_date          NUMERIC(5,2),
    score_reference     NUMERIC(5,2),
    score_description   NUMERIC(5,2),
    amount_delta_paise  BIGINT DEFAULT 0,
    date_delta_days     INT DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','confirmed','rejected')),
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_rr_batch ON reconciliation_results(batch_id);
CREATE INDEX IF NOT EXISTS ix_rr_type  ON reconciliation_results(batch_id, match_type);
CREATE UNIQUE INDEX IF NOT EXISTS ux_rr_bank
    ON reconciliation_results(bank_line_id)
    WHERE bank_line_id IS NOT NULL AND match_type IN ('auto_matched','review');
CREATE UNIQUE INDEX IF NOT EXISTS ux_rr_ledger
    ON reconciliation_results(ledger_entry_id)
    WHERE ledger_entry_id IS NOT NULL AND match_type IN ('auto_matched','review');

-- ============ verified_transactions (forecasting contract) ============
CREATE TABLE IF NOT EXISTS verified_transactions (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id      TEXT NOT NULL REFERENCES accounts(id),
    recon_result_id BIGINT NOT NULL REFERENCES reconciliation_results(id),
    txn_date        DATE NOT NULL,
    amount_paise    BIGINT NOT NULL,
    direction       TEXT NOT NULL CHECK (direction IN ('credit','debit')),
    source_ref      TEXT,
    verified_via    TEXT NOT NULL DEFAULT 'auto'
                    CHECK (verified_via IN ('auto','manual')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_vt_account_date ON verified_transactions(account_id, txn_date);
CREATE UNIQUE INDEX IF NOT EXISTS ux_vt_recon ON verified_transactions(recon_result_id);

-- ============ forecasts ============
CREATE TABLE IF NOT EXISTS forecasts (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id              TEXT NOT NULL REFERENCES accounts(id),
    batch_id                BIGINT REFERENCES import_batches(id),
    model                   TEXT NOT NULL DEFAULT 'holt',
    run_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    horizon_date            DATE NOT NULL,
    predicted_close_paise   BIGINT NOT NULL,
    predicted_low_paise     BIGINT,
    predicted_high_paise    BIGINT,
    UNIQUE (account_id, run_at, horizon_date)
);
CREATE INDEX IF NOT EXISTS ix_fc_account_run ON forecasts(account_id, run_at DESC);

-- ============ alerts ============
CREATE TABLE IF NOT EXISTS alerts (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id              TEXT NOT NULL REFERENCES accounts(id),
    forecast_id             BIGINT REFERENCES forecasts(id),
    severity                TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
    breach_date             DATE NOT NULL,
    predicted_close_paise   BIGINT NOT NULL,
    threshold_paise         BIGINT NOT NULL,
    shortfall_paise         BIGINT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','acknowledged','resolved','expired')),
    dedupe_key              TEXT NOT NULL,
    sns_message_id          TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_alert_dedupe ON alerts(dedupe_key) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS ix_alert_account ON alerts(account_id, status);
