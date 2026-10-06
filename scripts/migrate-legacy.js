// One-time import of client accounts and credit balances from the old app's
// MongoDB into this app's database (the built-in file, or DATABASE_URL).
// Passwords are NOT copied (the old app stored them in plain text and its
// database credentials were published in source code). Every imported user
// gets a random temporary password, printed once below.
//
//   npm install --no-save mongodb
//   LEGACY_MONGODB_URI="mongodb+srv://..." node scripts/migrate-legacy.js
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { users, toCents } = require('../server/db/repo');
const { closeDb } = require('../server/db');

(async () => {
  const legacyUri = process.env.LEGACY_MONGODB_URI;
  if (!legacyUri) throw new Error('Set LEGACY_MONGODB_URI to the old database connection string.');
  let MongoClient;
  try { ({ MongoClient } = require('mongodb')); } catch { throw new Error('Run "npm install --no-save mongodb" first (only this script needs it).'); }
  const client = await new MongoClient(legacyUri).connect();
  const oldUsers = await client.db().collection('users').find({}, { projection: { email: 1, credits: 1 } }).toArray();
  const rows = [];
  for (const u of oldUsers) {
    const email = String(u.email || '').toLowerCase().trim();
    if (!email) continue;
    const temp = crypto.randomBytes(9).toString('base64url');
    const created = await users.create({ email, passwordHash: await bcrypt.hash(temp, 12), creditsCents: toCents(Math.max(0, Number(u.credits) || 0)) });
    if (created) rows.push({ email, credits: created.credits, temporaryPassword: temp });
  }
  console.table(rows);
  console.log(`Imported ${rows.length} of ${oldUsers.length} legacy users. Send each person their temporary password securely and ask them to change it under Account.`);
  await client.close();
  await closeDb();
})().catch((e) => { console.error(e.message); process.exit(1); });
