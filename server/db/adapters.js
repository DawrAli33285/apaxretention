// Two interchangeable database drivers with one small interface:
//   all(sql, params)   -> rows
//   one(sql, params)   -> first row or null
//   run(sql, params)   -> { changes }
//   batch([[sql, params], ...])  -> runs every statement in one transaction
//   exec(sql)          -> runs a statement with no parameters (schema setup)
// SQL is written once with "?" placeholders; the Postgres driver numbers them.

const toParam = (v) => {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.getTime();
  return v;
};

// ------------------------------------------------------------------ SQLite
// Built into Node.js (22.13 and newer): no install, no server, one file on disk.
function loadNodeSqlite() {
  // Node prints a one-line "SQLite is an experimental feature" notice the first
  // time the module loads. It is stable in practice; keep the console clean.
  const original = process.emitWarning;
  process.emitWarning = function filtered(warning, ...rest) {
    const text = typeof warning === 'string' ? warning : warning?.message;
    if (String(text || '').includes('SQLite')) return undefined;
    return original.call(process, warning, ...rest);
  };
  try {
    return require('node:sqlite');
  } catch (e) {
    const err = new Error(`The built-in database needs Node.js 22.13 or newer (this server runs ${process.version}). Install the current Node.js LTS, or set DATABASE_URL to a Postgres database.`);
    err.cause = e;
    throw err;
  } finally {
    process.emitWarning = original;
  }
}

class SqliteDb {
  constructor(file, { readOnly = false } = {}) {
    const { DatabaseSync } = loadNodeSqlite();
    this.kind = 'sqlite';
    this.file = file;
    this.db = readOnly ? new DatabaseSync(file, { readOnly: true }) : new DatabaseSync(file);
    this.cache = new Map();
    if (!readOnly) {
      // WAL lets reads continue while a write is in progress; busy_timeout waits
      // instead of failing if another process (a script) holds the file briefly.
      if (file !== ':memory:') this.db.exec('PRAGMA journal_mode = WAL');
      this.db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL');
    }
  }

  stmt(sql) {
    let s = this.cache.get(sql);
    if (!s) { s = this.db.prepare(sql); this.cache.set(sql, s); }
    return s;
  }

  async all(sql, params = []) { return this.stmt(sql).all(...params.map(toParam)); }

  async one(sql, params = []) { return (await this.all(sql, params))[0] || null; }

  async run(sql, params = []) { return { changes: Number(this.stmt(sql).run(...params.map(toParam)).changes) }; }

  async exec(sql) { this.db.exec(sql); }

  // Runs synchronously start to finish, so nothing else can interleave.
  async batch(statements) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = statements.map(([sql, params = []]) => this.stmt(sql).run(...params.map(toParam)));
      this.db.exec('COMMIT');
      return out.map((r) => ({ changes: Number(r.changes) }));
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  async withInitLock(fn) { return fn(this); }

  // Copies the live database into one self-contained file (used by db:export).
  async checkpoint() { if (this.file !== ':memory:') this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); }

  async close() { this.cache.clear(); this.db.close(); }

  isUniqueViolation(e) { return /UNIQUE constraint failed|PRIMARY KEY/i.test(String(e?.message)); }
}

// ------------------------------------------------------------------ Postgres
// For a permanent hosted database (Neon or Supabase from the Vercel Marketplace,
// or any Postgres). Selected when DATABASE_URL or POSTGRES_URL is set.
const numbered = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };

class PgDb {
  constructor(url) {
    const pg = require('pg');
    // COUNT(*) and BIGINT columns come back as strings by default; every value
    // stored here fits safely in a JavaScript number.
    pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
    pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
    this.kind = 'postgres';
    this.pool = new pg.Pool({ connectionString: url, max: Number(process.env.PG_POOL_MAX || 5), idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });
    this.pool.on('error', (e) => console.warn(`Postgres pool: ${e.message}`));
  }

  async all(sql, params = []) { return (await this.pool.query(numbered(sql), params.map(toParam))).rows; }

  async one(sql, params = []) { return (await this.all(sql, params))[0] || null; }

  async run(sql, params = []) { return { changes: (await this.pool.query(numbered(sql), params.map(toParam))).rowCount }; }

  async exec(sql) { await this.pool.query(sql); }

  async batch(statements) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const out = [];
      for (const [sql, params = []] of statements) out.push({ changes: (await client.query(numbered(sql), params.map(toParam))).rowCount });
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  // Several server instances may start at once; only one creates tables at a time.
  async withInitLock(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock(80270001)');
      return await fn({ exec: (sql) => client.query(sql) });
    } finally {
      await client.query('SELECT pg_advisory_unlock(80270001)').catch(() => {});
      client.release();
    }
  }

  async checkpoint() {}

  async close() { await this.pool.end(); }

  isUniqueViolation(e) { return e?.code === '23505'; }
}

module.exports = { SqliteDb, PgDb, loadNodeSqlite };
