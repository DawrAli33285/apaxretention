const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { users, jobs, records, invoices, safeUser, toCents, dollars } = require('../db/repo');
const { dbInfo } = require('../db');
const { requireUser, requireAdmin } = require('../middleware/auth');
const { geocode } = require('../providers/geocode');
const { periodOf, MODEL_VERSION } = require('../pipeline');
const { sendMail, mailEnabled } = require('../lib/mailer');

const router = express.Router();
router.use(requireUser, requireAdmin);

router.get('/system', (req, res) => {
  res.json({
    providerMode: config.providersLive() ? 'live' : 'demo',
    providerSetting: config.providerMode,
    keys: { peopleDataLabs: !!config.pdlApiKey, rapidApi: !!config.rapidApiKey },
    mail: mailEnabled(),
    modelVersion: MODEL_VERSION,
    enableAgeFactor: config.enableAgeFactor,
    enforceMonthlyLimit: config.enforceMonthlyLimit,
    pricePerRecord: { current: config.pricePerRecordCurrent, prehire: config.pricePerRecordPrehire },
    dataRetentionDays: config.dataRetentionDays,
    defaultJobSite: config.defaultJobSite,
    database: dbInfo(),
  });
});

router.get('/stats', async (req, res) => {
  const since = Date.now() - 30 * 86400000;
  const [clients, jobStats, records30, recent] = await Promise.all([
    users.countClients(),
    jobs.stats(since),
    records.countDoneSince(since),
    jobs.listAll({ limit: 10 }),
  ]);
  res.json({ users: clients, jobs: jobStats.jobs, jobs30: jobStats.jobs30, records30, revenue30: dollars(jobStats.revenueCents), recent });
});

// ---------------------------------------------------------------- users
router.get('/users', async (req, res) => {
  res.json({ users: (await users.list()).map(safeUser) });
});

router.post('/users', async (req, res) => {
  const { email, password, name = '', organization = '', role = 'client', credits = 0 } = req.body || {};
  const e = String(email || '').toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e)) return res.status(400).json({ error: 'Enter a valid email.' });
  if (typeof password !== 'string' || password.length < 10 || password.length > 200) return res.status(400).json({ error: 'Temporary password must be at least 10 characters.' });
  const user = await users.create({ email: e, name: String(name).slice(0, 120), organization: String(organization).slice(0, 120), role, creditsCents: toCents(Math.min(1000000, Math.max(0, Number(credits) || 0))), passwordHash: await bcrypt.hash(password, 12) });
  if (!user) return res.status(409).json({ error: 'That email already has an account.' });
  res.status(201).json({ user: safeUser(user) });
});

router.patch('/users/:id', async (req, res) => {
  const user = await users.byId(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const b = req.body || {};
  const patch = {};
  if (b.name !== undefined) patch.name = String(b.name).slice(0, 120);
  if (b.organization !== undefined) patch.organization = String(b.organization).slice(0, 120);
  if (b.active !== undefined) {
    if (String(user._id) === String(req.user._id) && !b.active) return res.status(400).json({ error: 'You cannot disable your own account.' });
    if (user.active && !b.active) patch.bumpSession = true;
    patch.active = !!b.active;
  }
  if (b.role !== undefined) {
    if (String(user._id) === String(req.user._id) && b.role !== 'admin') return res.status(400).json({ error: 'You cannot remove your own admin role.' });
    patch.role = b.role === 'admin' ? 'admin' : 'client';
  }
  if (b.password) {
    if (String(b.password).length < 10) return res.status(400).json({ error: 'Password must be at least 10 characters.' });
    patch.passwordHash = await bcrypt.hash(String(b.password), 12);
    patch.passwordWeak = false;
    patch.bumpSession = true;
  }
  if (b.grantExtraRun) {
    const period = periodOf();
    patch.extraRunsPeriod = period;
    patch.extraRunsCount = (user.extraRuns?.period === period ? user.extraRuns.count || 0 : 0) + 1;
  }
  if (b.jobSite) {
    const js = { label: String(b.jobSite.label || ''), address: String(b.jobSite.address || ''), lat: b.jobSite.lat ?? null, lon: b.jobSite.lon ?? null };
    if ((js.lat === null || js.lon === null || js.lat === '' || js.lon === '') && js.address) {
      const loc = await geocode(js.address);
      if (!loc) return res.status(400).json({ error: 'Could not locate that address. Enter latitude and longitude instead.' });
      js.lat = loc.lat; js.lon = loc.lon;
    }
    js.lat = js.lat === '' || js.lat === null ? null : Number(js.lat);
    js.lon = js.lon === '' || js.lon === null ? null : Number(js.lon);
    if ((js.lat !== null && !Number.isFinite(js.lat)) || (js.lon !== null && !Number.isFinite(js.lon))) return res.status(400).json({ error: 'Latitude and longitude must be numbers.' });
    patch.jobSite = js;
  }
  const updated = await users.update(user._id, patch);
  res.json({ user: safeUser(updated) });
});

router.post('/users/:id/credits', async (req, res) => {
  const cents = toCents(req.body?.amount);
  if (!Number.isFinite(cents) || cents === 0) return res.status(400).json({ error: 'Enter a non-zero amount.' });
  if (Math.abs(cents) > 100000000) return res.status(400).json({ error: 'Amount is too large.' });
  const user = await users.adjustCredits(req.params.id, cents);
  if (!user) return res.status(400).json({ error: 'User not found, or the balance would go below zero.' });
  res.json({ user: safeUser(user) });
});

router.delete('/users/:id', async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) return res.status(400).json({ error: 'You cannot delete your own account.' });
  const user = await users.byId(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  await users.remove(user._id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- jobs
router.get('/jobs', async (req, res) => {
  const status = ['queued', 'processing', 'completed', 'failed', 'cancelled'].includes(req.query.status) ? req.query.status : undefined;
  res.json({ jobs: await jobs.listAll({ status }) });
});

router.post('/jobs/:id/resume', async (req, res) => {
  const job = await jobs.byId(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  if (!['failed', 'processing'].includes(job.status)) return res.status(400).json({ error: 'Only failed or stuck jobs can be resumed.' });
  res.json({ job: await jobs.resume(job._id) });
});

// ---------------------------------------------------------------- invoices
router.get('/invoices', async (req, res) => {
  res.json({ invoices: await invoices.listAll() });
});

router.post('/invoices', async (req, res) => {
  const { userId, amount, description = '', email = true } = req.body || {};
  const user = await users.byId(userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const cents = toCents(amount);
  if (!(cents > 0) || cents > 100000000) return res.status(400).json({ error: 'Enter an amount between $0.01 and $1,000,000.' });
  const amt = dollars(cents);
  const invoice = await invoices.create({ userId: user._id, amountCents: cents, description: String(description || ''), createdBy: req.user._id });
  let emailed = false;
  if (email) emailed = await sendMail(user.email, `Invoice #${String(invoice._id).slice(-8).toUpperCase()} from ${config.brandName}`, `Amount due: $${amt.toFixed(2)}\n${description ? `\n${description}\n` : ''}\nOnce payment is received, the amount is added to your account credits.`).catch(() => false);
  res.status(201).json({ invoice, emailed });
});

router.post('/invoices/:id/paid', async (req, res) => {
  const invoice = await invoices.settle(req.params.id, 'Paid');
  if (!invoice) return res.status(400).json({ error: 'Invoice not found or not unpaid.' });
  await users.adjustCredits(invoice.user, invoice.amountCents);
  res.json({ invoice });
});

router.post('/invoices/:id/void', async (req, res) => {
  const invoice = await invoices.settle(req.params.id, 'Void');
  if (!invoice) return res.status(400).json({ error: 'Only unpaid invoices can be voided.' });
  res.json({ invoice });
});

module.exports = router;
