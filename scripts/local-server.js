// Local server for development (npm run dev) and for a self-hosted run
// (npm start also serves the built web app). Vercel does not use this file.
//
// No setup needed: the built-in database lives in data/apax.db and is
// created from database/apax-starter.db on first start.
require('dotenv').config({ quiet: true });
const path = require('path');
const express = require('express');
const { createApp } = require('../server/app');
const { getDb, dbInfo } = require('../server/db');

(async () => {
  try {
    await getDb();
    const info = dbInfo();
    console.log(info.kind === 'postgres' ? 'Database: Postgres (DATABASE_URL)' : `Database: built-in file ${path.relative(process.cwd(), info.file) || info.file}`);
  } catch (e) {
    console.error(`\nThe database could not be opened: ${e.message}\n`);
  }
  const port = Number(process.env.API_PORT || process.env.PORT || 3001);
  const app = createApp();
  if (process.argv.includes('--serve-dist')) {
    const dist = path.join(__dirname, '..', 'dist');
    // Same security headers vercel.json sets in production.
    const vercel = require('../vercel.json');
    const headers = vercel.headers[0].headers;
    app.use((req, res, next) => { headers.forEach((h) => res.setHeader(h.key, h.value)); next(); });
    app.use(express.static(dist, { index: false }));
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.listen(port, () => console.log(`API listening on http://localhost:${port}${process.argv.includes('--serve-dist') ? ' (app + API)' : ' (open the app at http://localhost:5173)'}`));
})();
