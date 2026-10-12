// Start the built-in database over from the starter file (the one that ships
// with the app, with the test login and credits). Deletes every upload and
// result in data/apax.db. Does nothing to a Postgres DATABASE_URL.
//
//   npm run db:reset
require('dotenv').config({ quiet: true });
const fs = require('fs');
const config = require('../server/config');
const { DEFAULT_FILE, STARTER_FILE } = require('../server/db');

if (config.databaseUrl) {
  console.error('DATABASE_URL is set, so the app uses Postgres. This command only resets the built-in database file.');
  process.exit(1);
}
const file = config.sqlitePath || DEFAULT_FILE;
if (file === ':memory:') process.exit(0);
for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
if (!fs.existsSync(STARTER_FILE)) {
  console.log(`Removed ${file}. No starter file found; the app will start empty and show the first-run setup form.`);
} else {
  fs.mkdirSync(require('path').dirname(file), { recursive: true });
  fs.copyFileSync(STARTER_FILE, file);
  console.log(`Database reset from the starter file: ${file}`);
}
