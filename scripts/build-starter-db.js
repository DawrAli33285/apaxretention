// Builds database/apax-starter.db: the database that ships with the
// app. It holds the tables and the test administrator login, nothing else (no
// client data, no session keys). Every new install starts from a copy of it.
//
//   npm run db:build-starter -- [email] [password] [starting credits in dollars]
//
// With no arguments it uses the test login below. Change that password after
// the first sign-in (the app reminds you because it is under 10 characters).
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'database', 'apax-starter.db');
process.env.SQLITE_PATH = file;
process.env.DB_NO_STARTER = 'true';
// Empty (not deleted) so a local .env file cannot fill them back in.
for (const k of ['DATABASE_URL', 'POSTGRES_URL', 'ADMIN_EMAIL', 'ADMIN_PASSWORD']) process.env[k] = '';

const bcrypt = require('bcryptjs');

(async () => {
  const [email = 'shipmate2134@gmail.com', password = '12345678', credits = '1000'] = process.argv.slice(2);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });

  const { getDb, closeDb } = require('../server/db');
  const { users } = require('../server/db/repo');
  const db = await getDb();
  const admin = await users.upsertAdmin({ email, passwordHash: await bcrypt.hash(password, 12), organization: 'The Apax Group', passwordWeak: password.length < 10, creditsCents: Math.round(Number(credits) * 100) });
  // Additional demo administrators that ship with the app (same test password).
  const extra = process.argv.length > 2 ? [] : ['todd@apax-us.com'];
  for (const e of extra) {
    const u = await users.upsertAdmin({ email: e, passwordHash: await bcrypt.hash(password, 12), organization: 'The Apax Group', passwordWeak: password.length < 10, creditsCents: Math.round(Number(credits) * 100) });
    console.log(`Also: ${u.email} / ${password} (administrator, $${u.credits.toFixed(2)} credits)`);
  }
  // Never ship a session signing key or a setup lock.
  await db.run("DELETE FROM settings WHERE key IN ('jwtSecret', 'setupLock')");
  // One self-contained file (no -wal/-shm companions) so it copies cleanly.
  await db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  await db.exec('PRAGMA journal_mode = DELETE');
  await db.exec('VACUUM');
  await closeDb();
  console.log(`Starter database written: ${path.relative(process.cwd(), file)}`);
  console.log(`Login: ${admin.email} / ${password} (administrator, $${admin.credits.toFixed(2)} credits)`);
})().catch((e) => { console.error(e); process.exit(1); });
