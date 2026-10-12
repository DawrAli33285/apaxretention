// Database schema. Written once in plain SQL that both SQLite and PostgreSQL
// accept, so the same tables exist whichever database the app runs on.
//
// Conventions
//   ids        24-character random hex strings
//   times      BIGINT milliseconds since 1970 (compared as numbers, never as text)
//   money      BIGINT whole cents (no rounding drift)
//   flags      INTEGER 0/1
//   nested     TEXT holding JSON (uploaded row, social evidence, score breakdown)
//
// Tables are created automatically on first start. Nobody has to run a migration.

const SCHEMA_VERSION = 1;

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    organization TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'client',
    active INTEGER NOT NULL DEFAULT 1,
    credits_cents BIGINT NOT NULL DEFAULT 0,
    job_site TEXT,
    turnover_table TEXT,
    extra_runs_period TEXT NOT NULL DEFAULT '',
    extra_runs_count INTEGER NOT NULL DEFAULT 0,
    session_version INTEGER NOT NULL DEFAULT 0,
    password_weak INTEGER NOT NULL DEFAULT 0,
    reset_token_hash TEXT,
    reset_expires BIGINT,
    last_login_at BIGINT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    period TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    provider_mode TEXT NOT NULL,
    model_version TEXT,
    settings TEXT,
    rows_count INTEGER NOT NULL DEFAULT 0,
    scored_count INTEGER NOT NULL DEFAULT 0,
    done_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    cost_cents BIGINT NOT NULL DEFAULT 0,
    price_cents BIGINT NOT NULL DEFAULT 0,
    turnover TEXT,
    issues TEXT,
    locked_until BIGINT,
    started_at BIGINT,
    completed_at BIGINT,
    error TEXT,
    expires_at BIGINT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    row_index INTEGER NOT NULL,
    contact_key TEXT,
    period TEXT,
    job_type TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    skip_reason TEXT,
    input TEXT,
    enrichment TEXT,
    social TEXT,
    factors TEXT,
    score TEXT,
    flags TEXT,
    error TEXT,
    processed_at BIGINT,
    expires_at BIGINT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_cents BIGINT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Unpaid',
    paid_at BIGINT,
    created_by TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )`,
  // One row per current-staff run a client starts in a month. The primary key
  // is the lock: two uploads racing for the same slot cannot both insert it.
  `CREATE TABLE IF NOT EXISTS run_reservations (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period TEXT NOT NULL,
    slot INTEGER NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (user_id, period, slot)
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS auth_attempts (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS geo_cache (
    key TEXT PRIMARY KEY,
    ok INTEGER NOT NULL,
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    created_at BIGINT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS jobs_user_created ON jobs (user_id, created_at)',
  'CREATE INDEX IF NOT EXISTS jobs_created ON jobs (created_at)',
  'CREATE INDEX IF NOT EXISTS jobs_expires ON jobs (expires_at)',
  'CREATE INDEX IF NOT EXISTS records_job_status_row ON records (job_id, status, row_index)',
  'CREATE INDEX IF NOT EXISTS records_monthly_contacts ON records (user_id, job_type, period, contact_key)',
  'CREATE INDEX IF NOT EXISTS records_expires ON records (expires_at)',
  'CREATE INDEX IF NOT EXISTS records_processed ON records (status, processed_at)',
  'CREATE INDEX IF NOT EXISTS invoices_user ON invoices (user_id, created_at)',
  'CREATE INDEX IF NOT EXISTS auth_attempts_key ON auth_attempts (key, created_at)',
];

module.exports = { SCHEMA_VERSION, STATEMENTS };
