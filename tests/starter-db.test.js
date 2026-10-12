// The database that ships with the app: a fresh install opens it and the test
// login works with no settings. Also checks the Postgres copy of the starter
// accounts when TEST_DATABASE_URL is set.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-starter-'));
const pgUrl = process.env.TEST_DATABASE_URL || '';
Object.assign(process.env, {
  DATABASE_URL: pgUrl, POSTGRES_URL: '', SQLITE_PATH: pgUrl ? '' : path.join(tmp, 'app.db'), DB_NO_STARTER: '',
  JWT_SECRET: '', ADMIN_EMAIL: '', ADMIN_PASSWORD: '', PROVIDER_MODE: 'demo', GEOCODER: 'none',
});

const request = require('supertest');
const { createApp } = require('../server/app');
const { getDb, closeDb, STARTER_FILE } = require('../server/db');

const LOGIN = { email: 'shipmate2134@gmail.com', password: '12345678' };

test('starter database ships with the app', () => {
  assert.ok(fs.existsSync(STARTER_FILE), 'database/apax-starter.db is present');
});

test(`fresh install signs in with the included login (${pgUrl ? 'Postgres' : 'built-in database'})`, { timeout: 60000 }, async () => {
  if (pgUrl) {
    // Start from an empty Postgres, as a new Vercel database would be.
    const pg = new (require('pg').Client)({ connectionString: pgUrl });
    await pg.connect();
    await pg.query('DROP TABLE IF EXISTS records, jobs, invoices, run_reservations, auth_attempts, geo_cache, settings, users CASCADE');
    await pg.end();
  }
  const app = createApp();
  const cfg = (await request(app).get('/api/config').expect(200)).body;
  assert.equal(cfg.needsSetup, false, 'no setup screen: the login already exists');
  assert.equal(cfg.database.kind, pgUrl ? 'postgres' : 'sqlite');
  assert.equal(cfg.database.temporary, false);

  const agent = request.agent(app);
  const r = await agent.post('/api/auth/login').set('X-Requested-With', 'prognosticare').send(LOGIN).expect(200);
  assert.equal(r.body.user.role, 'admin');
  assert.equal(r.body.user.credits, 1000);
  assert.equal(r.body.user.passwordWeak, true, 'the app asks to change the short test password');

  await agent.post('/api/auth/change-password').set('X-Requested-With', 'prognosticare').send({ currentPassword: LOGIN.password, newPassword: 'a-much-longer-password' }).expect(200);
  assert.equal((await agent.get('/api/auth/me').expect(200)).body.user.passwordWeak, false);

  if (!pgUrl) {
    // The shipped file itself is never modified; the app works on its own copy.
    assert.ok(fs.existsSync(path.join(tmp, 'app.db')));
    const { SqliteDb } = require('../server/db/adapters');
    const starter = new SqliteDb(STARTER_FILE, { readOnly: true });
    assert.equal((await starter.one('SELECT password_weak FROM users WHERE email = ?', [LOGIN.email])).password_weak, 1);
    assert.equal(await starter.one("SELECT value FROM settings WHERE key = 'jwtSecret'"), null, 'no signing key is shipped');
    await starter.close();
  }
  await (await getDb()).run('DELETE FROM users');
  await closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});
