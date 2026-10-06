const express = require('express');
const helmet = require('helmet');
const config = require('./config');
const { getDb, dbInfo, purgeExpired } = require('./db');
const { users, invoices } = require('./db/repo');
const { requireUser, requireAppHeader } = require('./middleware/auth');
const { mailEnabled } = require('./lib/mailer');
const { MODEL_VERSION } = require('./scoring/model');

const databaseSummary = () => {
  const info = dbInfo();
  return { kind: info.kind, temporary: !!info.temporary };
};

function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));

  const api = express.Router();
  // Parsed inside /api so a malformed body gets a JSON error, not an HTML page.
  api.use(express.json({ limit: '1mb' }));
  api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  // Quick check for whoever deploys the app: is the database working?
  api.get('/health', async (req, res) => {
    let db = 'connected';
    try { await getDb(); } catch (e) { db = `error: ${e.message}`; }
    res.json({ ok: db === 'connected', db, database: databaseSummary(), providerMode: config.providersLive() ? 'live' : 'demo', modelVersion: MODEL_VERSION });
  });

  api.use(async (req, res, next) => {
    try {
      await getDb();
    } catch (e) {
      const err = new Error(`The database could not be opened: ${e.message}`);
      err.status = 503; err.code = 'DATABASE_UNAVAILABLE';
      return next(err);
    }
    // Housekeeping (expired results, old sign-in attempts) at most once an hour.
    purgeExpired().catch((e) => console.warn(`Cleanup skipped: ${e.message}`));
    return next();
  });
  api.use(requireAppHeader);

  // Public app settings the sign-in page needs.
  api.get('/config', async (req, res) => res.json({
    needsSetup: !(await users.adminExists()),
    setupKeyRequired: !!config.setupToken,
    providerMode: config.providersLive() ? 'live' : 'demo',
    allowSelfRegister: config.allowSelfRegister,
    mailEnabled: mailEnabled(),
    pricePerRecord: { current: config.pricePerRecordCurrent, prehire: config.pricePerRecordPrehire },
    enableAgeFactor: config.enableAgeFactor,
    enforceMonthlyLimit: config.enforceMonthlyLimit,
    showPricing: config.showPricing,
    showNotices: config.showNotices,
    modelVersion: MODEL_VERSION,
    database: databaseSummary(),
  }));

  api.use('/auth', require('./routes/auth'));
  api.use('/jobs', require('./routes/jobs'));
  api.use('/admin', require('./routes/admin'));
  api.get('/invoices', requireUser, async (req, res) => {
    res.json({ invoices: await invoices.forUser(req.user._id) });
  });

  api.use((req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  api.use((err, req, res, next) => {
    let status = err.status || err.statusCode || 500;
    if (err.type === 'entity.parse.failed') status = 400;
    if (status >= 500 && status !== 503) console.error(err);
    const message = status >= 500 && status !== 503 && config.isProd ? 'Something went wrong. Please try again.' : err.message;
    res.status(status).json({ error: message, code: err.code, details: err.details });
  });

  app.use('/api', api);
  return app;
}

module.exports = { createApp };
