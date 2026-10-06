// Create or reset an administrator: npm run seed:admin -- email@example.com "a-long-password"
// Works on whichever database the app uses (the built-in file, or DATABASE_URL).
require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const { users } = require('../server/db/repo');
const { closeDb, dbInfo } = require('../server/db');

(async () => {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: npm run seed:admin -- <email> <password>');
    process.exit(1);
  }
  if (password.length < 10) console.warn('Warning: this password is short. Use it for testing only; the app will ask to change it after sign-in.');
  const user = await users.upsertAdmin({ email, passwordHash: await bcrypt.hash(password, 12), passwordWeak: password.length < 10 });
  const info = dbInfo();
  console.log(`Admin ready: ${user.email} (database: ${info.kind === 'postgres' ? 'Postgres' : info.file})`);
  await closeDb();
})().catch((e) => { console.error(e.message); process.exit(1); });
