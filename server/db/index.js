// Picks the database, creates the tables and loads the starter data.
//
//   Default                 built-in SQLite file at data/apax.db. It is
//                           created from database/apax-starter.db (which
//                           ships with the app and already holds the login) the
//                           first time the app starts. Nothing to install.
//   DATABASE_URL / POSTGRES_URL set
//                           Postgres. Tables are created automatically and the
//                           starter login is copied in the first time.
//   On Vercel with neither  the starter file is copied to the server's temporary
//                           folder. Everything works, but data can reset whenever
//                           Vercel restarts the server, so the app shows a banner.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { SqliteDb, PgDb } = require('./adapters');
const { STATEMENTS, SCHEMA_VERSION } = require('./schema');

const ROOT = path.join(__dirname, '..', '..');
const STARTER_FILE = path.join(ROOT, 'database', 'apax-starter.db');
const DEFAULT_FILE = path.join(ROOT, 'data', 'apax.db');

const state = global.__apaxDb || (global.__apaxDb = { db: null, promise: null, info: null, lastPurge: 0 });

const newId = () => crypto.randomBytes(12).toString('hex');

function target() {
  if (config.databaseUrl) return { kind: 'postgres', url: config.databaseUrl, temporary: false };
  if (config.sqlitePath) return { kind: 'sqlite', file: config.sqlitePath, temporary: false };
  if (process.env.VERCEL) return { kind: 'sqlite', file: path.join(require('os').tmpdir(), 'apax.db'), temporary: true };
  return { kind: 'sqlite', file: DEFAULT_FILE, temporary: false };
}

async function createTables(db) {
  await db.withInitLock(async (conn) => {
    for (const sql of STATEMENTS) await conn.exec(sql);
  });
  const now = Date.now();
  await db.run('INSERT INTO settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', ['schemaVersion', JSON.stringify(SCHEMA_VERSION), now, now]);
}

// Postgres starts empty: copy the accounts from the starter file once, so the
// same login works whichever database the app uses.
async function importStarterAccounts(db) {
  if (!fs.existsSync(STARTER_FILE)) return 0;
  const { n } = await db.one('SELECT COUNT(*) AS n FROM users');
  if (Number(n) > 0) return 0;
  const starter = new SqliteDb(STARTER_FILE, { readOnly: true });
  try {
    const users = await starter.all('SELECT * FROM users');
    for (const u of users) {
      const cols = Object.keys(u);
      await db.run(`INSERT INTO users (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT DO NOTHING`, cols.map((c) => u[c]));
    }
    if (users.length) console.log(`Loaded ${users.length} starter account(s) into the new database.`);
    return users.length;
  } finally {
    await starter.close();
  }
}

// Optional: ADMIN_EMAIL + ADMIN_PASSWORD create or restore an administrator
// when the database has none (useful on a fresh Postgres without the starter file).
async function bootstrapAdmin(db) {
  if (!config.bootstrapAdminEmail || !config.bootstrapAdminPassword) return;
  if (await db.one("SELECT id FROM users WHERE role = 'admin' LIMIT 1")) return;
  const bcrypt = require('bcryptjs');
  const email = config.bootstrapAdminEmail.toLowerCase().trim();
  const hash = await bcrypt.hash(config.bootstrapAdminPassword, 12);
  const now = Date.now();
  await db.run(
    `INSERT INTO users (id, email, password_hash, name, role, active, password_weak, created_at, updated_at)
     VALUES (?, ?, ?, 'Administrator', 'admin', 1, ?, ?, ?)
     ON CONFLICT (email) DO UPDATE SET role = 'admin', active = 1, password_hash = excluded.password_hash, password_weak = excluded.password_weak, session_version = users.session_version + 1, updated_at = excluded.updated_at`,
    [newId(), email, hash, config.bootstrapAdminPassword.length < 10 ? 1 : 0, now, now],
  );
  console.log(`Administrator ready: ${email}`);
}

async function open() {
  const t = target();
  let db;
  if (t.kind === 'postgres') {
    db = new PgDb(t.url);
  } else {
    if (t.file !== ':memory:') {
      fs.mkdirSync(path.dirname(t.file), { recursive: true });
      if (!fs.existsSync(t.file) && fs.existsSync(STARTER_FILE) && !config.sqliteNoStarter) fs.copyFileSync(STARTER_FILE, t.file);
    }
    db = new SqliteDb(t.file);
  }
  try {
    await createTables(db);
    if (t.kind === 'postgres' && !config.sqliteNoStarter) await importStarterAccounts(db);
    await bootstrapAdmin(db);
  } catch (e) {
    await db.close().catch(() => {});
    throw e;
  }
  state.info = { kind: t.kind, temporary: t.temporary, file: t.file || null };
  return db;
}

/** The ready database. Safe to call on every request; it opens once per server instance. */
async function getDb() {
  if (state.db) return state.db;
  if (!state.promise) {
    state.promise = open().then((db) => { state.db = db; return db; }).catch((e) => { state.promise = null; throw e; });
  }
  return state.promise;
}

const dbInfo = () => state.info || { kind: target().kind, temporary: target().temporary, file: target().file || null };

async function closeDb() {
  const db = state.db;
  state.db = null; state.promise = null; state.info = null;
  if (db) await db.close();
}

// Removes expired results and old sign-in attempts. Runs at most once an hour
// per server instance, in the background of a normal request.
async function purgeExpired({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - state.lastPurge < 60 * 60 * 1000) return;
  state.lastPurge = now;
  const db = await getDb();
  await db.run('DELETE FROM records WHERE expires_at IS NOT NULL AND expires_at < ?', [now]);
  await db.run('DELETE FROM jobs WHERE expires_at IS NOT NULL AND expires_at < ?', [now]);
  await db.run('DELETE FROM auth_attempts WHERE created_at < ?', [now - 15 * 60 * 1000]);
  await db.run('DELETE FROM geo_cache WHERE created_at < ?', [now - 180 * 86400000]);
}

module.exports = { getDb, closeDb, dbInfo, purgeExpired, newId, STARTER_FILE, DEFAULT_FILE };
