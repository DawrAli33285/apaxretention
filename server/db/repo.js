// Every read and write the app makes, in one place. Routes and the pipeline
// call these functions and never write SQL themselves.
//
// Objects returned here keep the shapes the web app already uses: "_id",
// dates as ISO strings, money in dollars (with the exact cents alongside).
const { getDb, newId } = require('./index');

const parse = (s, fallback = null) => {
  if (s === null || s === undefined || s === '') return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
};
const json = (v) => (v === undefined || v === null ? null : JSON.stringify(v));
const iso = (ms) => (ms === null || ms === undefined ? null : new Date(Number(ms)).toISOString());
const dollars = (c) => Math.round(Number(c || 0)) / 100;
const toCents = (d) => Math.round(Number(d) * 100 + (Number(d) >= 0 ? 1e-9 : -1e-9));
const inList = (arr) => arr.map(() => '?').join(', ');

// ------------------------------------------------------------------ users
const EMPTY_SITE = { label: '', address: '', lat: null, lon: null };

function toUser(r) {
  if (!r) return null;
  return {
    _id: r.id,
    email: r.email,
    name: r.name || '',
    organization: r.organization || '',
    role: r.role,
    active: !!r.active,
    credits: dollars(r.credits_cents),
    creditsCents: Number(r.credits_cents || 0),
    jobSite: parse(r.job_site, { ...EMPTY_SITE }),
    turnoverTable: parse(r.turnover_table, []),
    extraRuns: { period: r.extra_runs_period || '', count: Number(r.extra_runs_count || 0) },
    sessionVersion: Number(r.session_version || 0),
    passwordWeak: !!r.password_weak,
    passwordHash: r.password_hash,
    resetTokenHash: r.reset_token_hash || null,
    resetExpires: r.reset_expires === null || r.reset_expires === undefined ? null : Number(r.reset_expires),
    lastLoginAt: iso(r.last_login_at),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

/** What the browser may see about a user. */
function safeUser(u) {
  if (!u) return null;
  const { passwordHash, resetTokenHash, resetExpires, sessionVersion, creditsCents, ...rest } = u; // eslint-disable-line no-unused-vars
  return rest;
}

const USER_FIELDS = {
  email: ['email'],
  name: ['name'],
  organization: ['organization'],
  role: ['role'],
  active: ['active', (v) => (v ? 1 : 0)],
  jobSite: ['job_site', json],
  turnoverTable: ['turnover_table', json],
  extraRunsPeriod: ['extra_runs_period'],
  extraRunsCount: ['extra_runs_count'],
  passwordHash: ['password_hash'],
  passwordWeak: ['password_weak', (v) => (v ? 1 : 0)],
  resetTokenHash: ['reset_token_hash'],
  resetExpires: ['reset_expires'],
  lastLoginAt: ['last_login_at'],
};

const users = {
  async adminExists() {
    const db = await getDb();
    return !!(await db.one("SELECT id FROM users WHERE role = 'admin' AND active = 1 LIMIT 1"));
  },
  async countClients() {
    const db = await getDb();
    return Number((await db.one("SELECT COUNT(*) AS n FROM users WHERE role = 'client'")).n);
  },
  async byId(id) {
    const db = await getDb();
    return toUser(await db.one('SELECT * FROM users WHERE id = ?', [String(id || '')]));
  },
  async byEmail(email) {
    const db = await getDb();
    return toUser(await db.one('SELECT * FROM users WHERE email = ?', [String(email || '').toLowerCase().trim()]));
  },
  async byResetHash(hash, now = Date.now()) {
    const db = await getDb();
    return toUser(await db.one('SELECT * FROM users WHERE reset_token_hash = ? AND reset_expires > ? AND active = 1', [hash, now]));
  },
  async list() {
    const db = await getDb();
    return (await db.all('SELECT * FROM users ORDER BY created_at DESC')).map(toUser);
  },
  /** Returns the new user, or null when the email is taken. */
  async create({ email, passwordHash, name = '', organization = '', role = 'client', creditsCents = 0, passwordWeak = false }) {
    const db = await getDb();
    const now = Date.now();
    const rows = await db.all(
      `INSERT INTO users (id, email, password_hash, name, organization, role, active, credits_cents, password_weak, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING *`,
      [newId(), String(email).toLowerCase().trim(), passwordHash, name, organization, role === 'admin' ? 'admin' : 'client', Math.max(0, Math.round(creditsCents)), passwordWeak ? 1 : 0, now, now],
    );
    return toUser(rows[0]);
  },
  /** Creates or promotes an administrator (first-run setup and the seed script). */
  async upsertAdmin({ email, passwordHash, name = '', organization = '', passwordWeak = false, creditsCents = 0 }) {
    const db = await getDb();
    const now = Date.now();
    const rows = await db.all(
      `INSERT INTO users (id, email, password_hash, name, organization, role, active, credits_cents, password_weak, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'admin', 1, ?, ?, ?, ?)
       ON CONFLICT (email) DO UPDATE SET role = 'admin', active = 1, password_hash = excluded.password_hash,
         password_weak = excluded.password_weak, name = COALESCE(NULLIF(excluded.name, ''), users.name),
         organization = COALESCE(NULLIF(excluded.organization, ''), users.organization),
         session_version = users.session_version + 1, updated_at = excluded.updated_at
       RETURNING *`,
      [newId(), String(email).toLowerCase().trim(), passwordHash, name, organization, Math.max(0, Math.round(creditsCents)), passwordWeak ? 1 : 0, now, now],
    );
    return toUser(rows[0]);
  },
  /**
   * Update chosen fields. `bumpSession: true` signs the user out everywhere.
   * Returns the updated user or null.
   */
  async update(id, patch = {}) {
    const db = await getDb();
    const sets = []; const params = [];
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'bumpSession') continue;
      const spec = USER_FIELDS[key];
      if (!spec) throw new Error(`Unknown user field ${key}`);
      sets.push(`${spec[0]} = ?`);
      params.push(spec[1] ? spec[1](value) : value);
    }
    if (patch.bumpSession) sets.push('session_version = session_version + 1');
    sets.push('updated_at = ?'); params.push(Date.now());
    const rows = await db.all(`UPDATE users SET ${sets.join(', ')} WHERE id = ? RETURNING *`, [...params, String(id)]);
    return toUser(rows[0]);
  },
  /**
   * Add (positive) or charge (negative) whole cents in one atomic statement.
   * Returns the updated user, or null if the user is missing or the balance
   * would go below zero. Two requests can never both spend the same money.
   */
  async adjustCredits(id, deltaCents, { allowNegative = false } = {}) {
    const db = await getDb();
    const d = Math.round(Number(deltaCents));
    if (!Number.isFinite(d)) throw new Error('Invalid credit amount.');
    const rows = await db.all(
      'UPDATE users SET credits_cents = credits_cents + ?, updated_at = ? WHERE id = ? AND (? = 1 OR credits_cents + ? >= 0) RETURNING *',
      [d, Date.now(), String(id), allowNegative ? 1 : 0, d],
    );
    return toUser(rows[0]);
  },
  /** Removes a user and everything they own. */
  async remove(id) {
    const db = await getDb();
    const uid = String(id);
    await db.batch([
      ['DELETE FROM records WHERE user_id = ?', [uid]],
      ['DELETE FROM jobs WHERE user_id = ?', [uid]],
      ['DELETE FROM invoices WHERE user_id = ?', [uid]],
      ['DELETE FROM run_reservations WHERE user_id = ?', [uid]],
      ['DELETE FROM users WHERE id = ?', [uid]],
    ]);
  },
};

// ------------------------------------------------------------------ jobs
function toJob(r) {
  if (!r) return null;
  const job = {
    _id: r.id,
    user: r.user_id,
    userId: r.user_id,
    type: r.type,
    fileName: r.file_name,
    period: r.period,
    status: r.status,
    providerMode: r.provider_mode,
    modelVersion: r.model_version || '',
    settings: parse(r.settings, {}),
    counts: {
      rows: Number(r.rows_count || 0),
      scored: Number(r.scored_count || 0),
      done: Number(r.done_count || 0),
      errors: Number(r.error_count || 0),
      skipped: Number(r.skipped_count || 0),
    },
    cost: dollars(r.cost_cents),
    costCents: Number(r.cost_cents || 0),
    pricePerRecord: dollars(r.price_cents),
    priceCents: Number(r.price_cents || 0),
    turnover: parse(r.turnover, []),
    issues: parse(r.issues, []),
    lockedUntil: iso(r.locked_until),
    startedAt: iso(r.started_at),
    completedAt: iso(r.completed_at),
    error: r.error || null,
    expiresAt: iso(r.expires_at),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
  // Admin lists include who uploaded the file.
  if (r.user_email !== undefined) job.user = { _id: r.user_id, email: r.user_email, organization: r.user_organization || '' };
  return job;
}

const JOB_WITH_USER = 'SELECT jobs.*, users.email AS user_email, users.organization AS user_organization FROM jobs LEFT JOIN users ON users.id = jobs.user_id';

const RECORD_COLS = ['id', 'job_id', 'user_id', 'row_index', 'contact_key', 'period', 'job_type', 'status', 'skip_reason', 'input', 'expires_at', 'created_at', 'updated_at'];

const jobs = {
  /**
   * Saves the job and all of its rows in one transaction: either the whole
   * upload is stored or nothing is.
   */
  async createWithRecords(job, records) {
    const db = await getDb();
    const now = Date.now();
    const id = newId();
    const statements = [[
      `INSERT INTO jobs (id, user_id, type, file_name, period, status, provider_mode, model_version, settings, rows_count, scored_count, skipped_count,
         cost_cents, price_cents, turnover, issues, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, job.userId, job.type, job.fileName, job.period, job.providerMode, job.modelVersion, json(job.settings || {}),
        job.counts.rows, job.counts.scored, job.counts.skipped, job.costCents, job.priceCents, json(job.turnover || []), json(job.issues || []),
        job.expiresAt, now, now],
    ]];
    const CHUNK = 200;
    for (let i = 0; i < records.length; i += CHUNK) {
      const part = records.slice(i, i + CHUNK);
      const values = []; const params = [];
      for (const r of part) {
        values.push(`(${inList(RECORD_COLS)})`);
        params.push(newId(), id, job.userId, r.rowIndex, r.contactKey || null, job.period, job.type, r.skipReason ? 'skipped' : 'pending',
          r.skipReason || null, json(r.input), job.expiresAt, now, now);
      }
      statements.push([`INSERT INTO records (${RECORD_COLS.join(', ')}) VALUES ${values.join(', ')}`, params]);
    }
    await db.batch(statements);
    return this.byId(id);
  },
  async byId(id) {
    const db = await getDb();
    return toJob(await db.one('SELECT * FROM jobs WHERE id = ?', [String(id || '')]));
  },
  async listForUser(userId, type) {
    const db = await getDb();
    const rows = type
      ? await db.all('SELECT * FROM jobs WHERE user_id = ? AND type = ? ORDER BY created_at DESC LIMIT 100', [String(userId), type])
      : await db.all('SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', [String(userId)]);
    return rows.map(toJob);
  },
  async listAll({ status, limit = 300 } = {}) {
    const db = await getDb();
    const rows = status
      ? await db.all(`${JOB_WITH_USER} WHERE jobs.status = ? ORDER BY jobs.created_at DESC LIMIT ?`, [status, limit])
      : await db.all(`${JOB_WITH_USER} ORDER BY jobs.created_at DESC LIMIT ?`, [limit]);
    return rows.map(toJob);
  },
  async stats(sinceMs) {
    const db = await getDb();
    const all = await db.one('SELECT COUNT(*) AS n FROM jobs');
    const recent = await db.one('SELECT COUNT(*) AS n, COALESCE(SUM(cost_cents), 0) AS cents FROM jobs WHERE created_at >= ?', [sinceMs]);
    return { jobs: Number(all.n), jobs30: Number(recent.n), revenueCents: Number(recent.cents) };
  },
  /** Takes the processing lease if no other step holds it. Returns the job or null. */
  async lease(id, leaseMs) {
    const db = await getDb();
    const now = Date.now();
    const rows = await db.all(
      `UPDATE jobs SET locked_until = ?, status = 'processing', updated_at = ?
       WHERE id = ? AND status IN ('queued', 'processing') AND (locked_until IS NULL OR locked_until < ?) RETURNING *`,
      [now + leaseMs, now, String(id), now],
    );
    return toJob(rows[0]);
  },
  /** Saves a step's progress, but only if the run was not stopped meanwhile. */
  async finishStep(id, { counts, status, error, startedAt, completedAt }) {
    const db = await getDb();
    const now = Date.now();
    const rows = await db.all(
      `UPDATE jobs SET locked_until = NULL, done_count = ?, error_count = ?, skipped_count = ?,
         status = COALESCE(?, status), error = COALESCE(?, error), started_at = COALESCE(started_at, ?), completed_at = COALESCE(?, completed_at), updated_at = ?
       WHERE id = ? AND status = 'processing' RETURNING *`,
      [counts.done, counts.errors, counts.skipped, status || null, error || null, startedAt || null, completedAt || null, now, String(id)],
    );
    return toJob(rows[0]);
  },
  /** Claims the stop. Returns the job, or null if it was already finished or stopped. */
  async claimCancel(id) {
    const db = await getDb();
    const rows = await db.all(
      "UPDATE jobs SET status = 'cancelled', locked_until = NULL, updated_at = ? WHERE id = ? AND status IN ('queued', 'processing', 'failed') RETURNING *",
      [Date.now(), String(id)],
    );
    return toJob(rows[0]);
  },
  async applyRefund(id, refundCents, unscored) {
    const db = await getDb();
    const rows = await db.all(
      'UPDATE jobs SET cost_cents = cost_cents - ?, skipped_count = skipped_count + ?, updated_at = ? WHERE id = ? RETURNING *',
      [refundCents, unscored, Date.now(), String(id)],
    );
    return toJob(rows[0]);
  },
  /** Puts a failed or stuck run back in the queue and retries its errored rows. */
  async resume(id) {
    const db = await getDb();
    const now = Date.now();
    await db.batch([
      ["UPDATE records SET status = 'pending', error = NULL, updated_at = ? WHERE job_id = ? AND status IN ('processing', 'error')", [now, String(id)]],
      ["UPDATE jobs SET status = 'queued', error = NULL, locked_until = NULL, updated_at = ? WHERE id = ?", [now, String(id)]],
    ]);
    return this.byId(id);
  },
  async remove(id) {
    const db = await getDb();
    await db.batch([
      ['DELETE FROM records WHERE job_id = ?', [String(id)]],
      ['DELETE FROM jobs WHERE id = ?', [String(id)]],
    ]);
  },
};

// ------------------------------------------------------------------ records
function toRecord(r) {
  if (!r) return null;
  return {
    _id: r.id,
    job: r.job_id,
    user: r.user_id,
    rowIndex: Number(r.row_index),
    contactKey: r.contact_key || '',
    period: r.period,
    jobType: r.job_type,
    status: r.status,
    skipReason: r.skip_reason || '',
    input: parse(r.input, {}),
    enrichment: parse(r.enrichment, null),
    social: parse(r.social, null),
    factors: parse(r.factors, null),
    score: parse(r.score, null),
    flags: parse(r.flags, []),
    error: r.error || '',
    processedAt: iso(r.processed_at),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

const records = {
  /**
   * Claims up to `n` waiting rows for processing in one statement, so two
   * steps running at the same moment never take the same row.
   */
  async claim(jobId, n) {
    const db = await getDb();
    const now = Date.now();
    const rows = await db.all(
      `UPDATE records SET status = 'processing', updated_at = ?
       WHERE status = 'pending' AND id IN (SELECT id FROM records WHERE job_id = ? AND status = 'pending' ORDER BY row_index LIMIT ?)
       RETURNING *`,
      [now, String(jobId), n],
    );
    return rows.map(toRecord).sort((a, b) => a.rowIndex - b.rowIndex);
  },
  /** Writes a result only if the row is still being processed (a stopped run wins). */
  async saveResult(r) {
    const db = await getDb();
    const now = Date.now();
    const { changes } = await db.run(
      `UPDATE records SET status = ?, enrichment = ?, social = ?, factors = ?, score = ?, flags = ?, error = ?, processed_at = ?, updated_at = ?
       WHERE id = ? AND status = 'processing'`,
      [r.status, json(r.enrichment), json(r.social), json(r.factors), json(r.score), json(r.flags || []), r.error || null, r.processedAt ? new Date(r.processedAt).getTime() : now, now, r._id],
    );
    return changes > 0;
  },
  async release(id) {
    const db = await getDb();
    await db.run("UPDATE records SET status = 'pending', updated_at = ? WHERE id = ? AND status = 'processing'", [Date.now(), id]);
  },
  async releaseAll(jobId) {
    const db = await getDb();
    await db.run("UPDATE records SET status = 'pending', updated_at = ? WHERE job_id = ? AND status = 'processing'", [Date.now(), String(jobId)]);
  },
  /** Rows left "processing" by a step that crashed go back to the queue. */
  async requeueStale(jobId, olderThanMs) {
    const db = await getDb();
    await db.run("UPDATE records SET status = 'pending', updated_at = ? WHERE job_id = ? AND status = 'processing' AND updated_at < ?", [Date.now(), String(jobId), Date.now() - olderThanMs]);
  },
  async statusCounts(jobId) {
    const db = await getDb();
    const rows = await db.all('SELECT status, COUNT(*) AS n FROM records WHERE job_id = ? GROUP BY status', [String(jobId)]);
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  },
  async forJob(jobId) {
    const db = await getDb();
    return (await db.all('SELECT * FROM records WHERE job_id = ? ORDER BY row_index', [String(jobId)])).map(toRecord);
  },
  /** Marks every unfinished row skipped. Returns how many changed. */
  async skipUnfinished(jobId, reason) {
    const db = await getDb();
    const { changes } = await db.run(
      "UPDATE records SET status = 'skipped', skip_reason = ?, updated_at = ? WHERE job_id = ? AND status IN ('pending', 'processing')",
      [reason, Date.now(), String(jobId)],
    );
    return changes;
  },
  /** Contacts already processed for this client this month (one run per contact per month). */
  async contactsThisMonth(userId, period) {
    const db = await getDb();
    const rows = await db.all(
      "SELECT DISTINCT contact_key FROM records WHERE user_id = ? AND job_type = 'current' AND period = ? AND status IN ('pending', 'processing', 'done') AND contact_key IS NOT NULL",
      [String(userId), period],
    );
    return new Set(rows.map((r) => r.contact_key));
  },
  async countDoneSince(sinceMs) {
    const db = await getDb();
    return Number((await db.one("SELECT COUNT(*) AS n FROM records WHERE status = 'done' AND processed_at >= ?", [sinceMs])).n);
  },
};

// ------------------------------------------------------------------ invoices
function toInvoice(r) {
  if (!r) return null;
  const inv = {
    _id: r.id,
    user: r.user_id,
    amount: dollars(r.amount_cents),
    amountCents: Number(r.amount_cents),
    description: r.description || '',
    status: r.status,
    paidAt: iso(r.paid_at),
    createdBy: r.created_by || null,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
  if (r.user_email !== undefined) inv.user = { _id: r.user_id, email: r.user_email, organization: r.user_organization || '' };
  return inv;
}

const invoices = {
  async create({ userId, amountCents, description = '', createdBy = null }) {
    const db = await getDb();
    const now = Date.now();
    const rows = await db.all(
      'INSERT INTO invoices (id, user_id, amount_cents, description, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, \'Unpaid\', ?, ?, ?) RETURNING *',
      [newId(), String(userId), amountCents, String(description).slice(0, 500), createdBy, now, now],
    );
    return toInvoice(rows[0]);
  },
  async forUser(userId) {
    const db = await getDb();
    return (await db.all('SELECT * FROM invoices WHERE user_id = ? ORDER BY created_at DESC', [String(userId)])).map(toInvoice);
  },
  async listAll() {
    const db = await getDb();
    return (await db.all('SELECT invoices.*, users.email AS user_email, users.organization AS user_organization FROM invoices LEFT JOIN users ON users.id = invoices.user_id ORDER BY invoices.created_at DESC')).map(toInvoice);
  },
  /** Moves an unpaid invoice to Paid or Void exactly once. Returns it, or null. */
  async settle(id, status) {
    const db = await getDb();
    const now = Date.now();
    const rows = await db.all(
      "UPDATE invoices SET status = ?, paid_at = ?, updated_at = ? WHERE id = ? AND status = 'Unpaid' RETURNING *",
      [status, status === 'Paid' ? now : null, now, String(id)],
    );
    return toInvoice(rows[0]);
  },
};

// ------------------------------------------------------------------ small tables
const settings = {
  async get(key) {
    const db = await getDb();
    const row = await db.one('SELECT value FROM settings WHERE key = ?', [key]);
    return row ? parse(row.value, null) : null;
  },
  /** Inserts only if the key is new. Returns true when this call created it (a one-time lock). */
  async insertIfAbsent(key, value) {
    const db = await getDb();
    const now = Date.now();
    const { changes } = await db.run('INSERT INTO settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING', [key, json(value), now, now]);
    return changes > 0;
  },
  async remove(key) {
    const db = await getDb();
    await db.run('DELETE FROM settings WHERE key = ?', [key]);
  },
};

const authAttempts = {
  async count(key, windowMs) {
    const db = await getDb();
    return Number((await db.one('SELECT COUNT(*) AS n FROM auth_attempts WHERE key = ? AND created_at > ?', [key, Date.now() - windowMs])).n);
  },
  async add(key) {
    const db = await getDb();
    await db.run('INSERT INTO auth_attempts (id, key, created_at) VALUES (?, ?, ?)', [newId(), key, Date.now()]);
  },
  async clear(key) {
    const db = await getDb();
    await db.run('DELETE FROM auth_attempts WHERE key = ?', [key]);
  },
};

const geoCache = {
  async get(key) {
    const db = await getDb();
    const r = await db.one('SELECT * FROM geo_cache WHERE key = ?', [key]);
    return r ? { ok: !!r.ok, lat: r.lat, lon: r.lon } : null;
  },
  async put(key, { ok, lat = null, lon = null }) {
    const db = await getDb();
    await db.run(
      'INSERT INTO geo_cache (key, ok, lat, lon, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET ok = excluded.ok, lat = excluded.lat, lon = excluded.lon, created_at = excluded.created_at',
      [key, ok ? 1 : 0, lat, lon, Date.now()],
    );
  },
};

const reservations = {
  /** True when this call took the slot; false when it was already taken. */
  async take(userId, period, slot) {
    const db = await getDb();
    const { changes } = await db.run('INSERT INTO run_reservations (user_id, period, slot, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING', [String(userId), period, slot, Date.now()]);
    return changes > 0;
  },
  async release(userId, period, slot) {
    const db = await getDb();
    await db.run('DELETE FROM run_reservations WHERE user_id = ? AND period = ? AND slot = ?', [String(userId), period, slot]);
  },
  async count(userId, period) {
    const db = await getDb();
    return Number((await db.one('SELECT COUNT(*) AS n FROM run_reservations WHERE user_id = ? AND period = ?', [String(userId), period])).n);
  },
};

module.exports = { users, jobs, records, invoices, settings, authAttempts, geoCache, reservations, safeUser, toCents, dollars };
