// Session signing key. Uses JWT_SECRET when it is set. Otherwise:
//   * permanent database (built-in file or Postgres): a strong random key is
//     generated once, stored in the database, and every instance reads it.
//   * temporary database (Vercel with no DATABASE_URL): every server instance
//     has its own copy of the database, so a stored random key would differ per
//     instance and sign-ins would randomly bounce back to the login screen.
//     The key is instead derived from the starter database that ships with this
//     deployment, so all instances agree. Connect Postgres (or set JWT_SECRET)
//     for production.
const crypto = require('crypto');
const fs = require('fs');
const config = require('../config');
const { settings } = require('../db/repo');
const { dbInfo, getDb, STARTER_FILE } = require('../db');

let cached = null;

async function getJwtSecret() {
  if (config.jwtSecret) return config.jwtSecret;
  if (cached) return cached;
  await getDb();
  if (dbInfo().temporary && fs.existsSync(STARTER_FILE)) {
    cached = crypto.createHash('sha256')
      .update('apax-session-key:')
      .update(fs.readFileSync(STARTER_FILE))
      .update(process.env.VERCEL_PROJECT_ID || process.env.VERCEL_GIT_REPO_ID || '')
      .digest('hex');
    return cached;
  }
  // Only the first instance's key is kept; the others read that same value.
  await settings.insertIfAbsent('jwtSecret', crypto.randomBytes(48).toString('hex'));
  cached = await settings.get('jwtSecret');
  return cached;
}

// Tests and db:reset replace the database underneath a running process.
const forgetJwtSecret = () => { cached = null; };

module.exports = { getJwtSecret, forgetJwtSecret };
