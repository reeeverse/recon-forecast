-- v2 schema additions: users + bank_connections
-- Apply after schema.sql: psql $DATABASE_URL -f backend/schema_v2.sql

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'analyst' CHECK (role IN ('admin', 'analyst')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE TABLE IF NOT EXISTS bank_connections (
  id                     BIGSERIAL PRIMARY KEY,
  user_id                BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name                   TEXT NOT NULL,
  db_type                TEXT NOT NULL CHECK (db_type IN ('postgresql', 'mysql')),
  connection_string_enc  TEXT NOT NULL,
  last_sync_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_connections_user ON bank_connections (user_id);
