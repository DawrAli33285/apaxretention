const express = require('express');
const multer = require('multer');
const config = require('../config');
const { users, jobs, records, reservations, settings, toCents, dollars } = require('../db/repo');
const { requireUser } = require('../middleware/auth');
const { parseFile, buildIntake } = require('../lib/intake');
const { stepJob, contactsRunThisMonth, periodOf, expiry, MODEL_VERSION } = require('../pipeline');
const { toRow, buildWorkbook, buildCsv, pointTables } = require('../lib/results');
const { notify } = require('../lib/mailer');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes, files: 1 } });

const MONTHLY_LIMIT_MSG = 'You have exceeded your processing limit for this month.';
const priceFor = (type) => (type === 'prehire' ? config.pricePerRecordPrehire : config.pricePerRecordCurrent);

function receiveFile(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `File is larger than ${Math.round(config.maxUploadBytes / 1048576)} MB. Save it as CSV or split it into parts.` : err.message;
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'Attach a .csv or .xlsx file.' });
    const type = req.body?.type;
    if (!['prehire', 'current'].includes(type)) return res.status(400).json({ error: 'Upload type must be "prehire" or "current".' });
    return next();
  });
}

async function analyse(req) {
  const type = req.body.type;
  const { headers, rows } = await parseFile(req.file.buffer, req.file.originalname, { maxRows: config.maxRowsPerFile });
  const previouslyRunContacts = await contactsRunThisMonth(req.user._id, type);
  const intake = buildIntake(type, headers, rows, { maxRecords: config.maxRecordsPerJob, previouslyRunContacts });
  const priceCents = toCents(priceFor(type));
  const costCents = intake.stats.billable * priceCents;
  return { type, intake, priceCents, costCents };
}

function jobSiteFor(user) {
  if (user.jobSite?.lat != null && user.jobSite?.lon != null) return { label: user.jobSite.label || user.jobSite.address, lat: user.jobSite.lat, lon: user.jobSite.lon };
  return config.defaultJobSite.lat != null ? config.defaultJobSite : null;
}

// One current-staff run per calendar month, plus any extra runs an admin
// granted for that month. A run takes a numbered slot by inserting a
// reservation row; the primary key makes parallel uploads race safely, and
// deleting a run does not give the month back. release() undoes a failed start.
async function monthlySlots(userId, period) {
  const u = await users.byId(userId);
  return 1 + (u?.extraRuns?.period === period ? u.extraRuns.count || 0 : 0);
}

async function reserveMonthlyRun(userId, type) {
  const noop = { ok: true, release: async () => {} };
  if (type !== 'current' || !config.enforceMonthlyLimit) return noop;
  const period = periodOf();
  const slots = await monthlySlots(userId, period);
  for (let slot = 0; slot < slots; slot++) {
    if (await reservations.take(userId, period, slot)) return { ok: true, release: () => reservations.release(userId, period, slot) };
  }
  return { ok: false };
}

async function monthlyRunUsed(userId, type) {
  if (type !== 'current' || !config.enforceMonthlyLimit) return false;
  const period = periodOf();
  return (await reservations.count(userId, period)) >= (await monthlySlots(userId, period));
}

async function loadOwnedJob(req, res) {
  const job = await jobs.byId(req.params.id);
  if (!job || (String(job.userId) !== String(req.user._id) && req.user.role !== 'admin')) {
    res.status(404).json({ error: 'Job not found.' });
    return null;
  }
  return job;
}

router.use(requireUser);

router.get('/', async (req, res) => {
  const type = ['prehire', 'current'].includes(req.query.type) ? req.query.type : undefined;
  res.json({ jobs: await jobs.listForUser(req.user._id, type) });
});

// Validate a file and quote the cost without creating anything.
router.post('/preview', receiveFile, async (req, res) => {
  if (await monthlyRunUsed(req.user._id, req.body.type)) return res.status(429).json({ error: MONTHLY_LIMIT_MSG });
  const { type, intake, priceCents, costCents } = await analyse(req);
  const sample = intake.records.filter((r) => !r.skipReason).slice(0, 5).map((r) => ({ name: r.rec.name, email: r.rec.email, jobClass: r.rec.jobClass, department: r.rec.department }));
  const mapping = Object.fromEntries(Object.entries(intake.headerMap).map(([k, v]) => [k, v[0]]));
  res.json({
    type, fileName: req.file.originalname, stats: intake.stats, issues: intake.issues, mapping, sample,
    pricePerRecord: dollars(priceCents), cost: dollars(costCents), credits: req.user.credits, enoughCredits: req.user.creditsCents >= costCents,
    turnoverClasses: intake.turnover.length,
    providerMode: config.providersLive() ? 'live' : 'demo',
  });
});

// Create the job, charge credits, queue every record. Every step after the
// monthly reservation is undone (credits returned, month released) if a later step fails.
router.post('/', receiveFile, async (req, res) => {
  const type = req.body.type;
  const reservation = await reserveMonthlyRun(req.user._id, type);
  if (!reservation.ok) return res.status(429).json({ error: MONTHLY_LIMIT_MSG });

  let chargedCents = 0;
  try {
    const { intake, priceCents, costCents } = await analyse(req);
    if (costCents > 0) {
      const after = await users.adjustCredits(req.user._id, -costCents);
      if (!after) {
        const bal = (await users.byId(req.user._id))?.credits || 0;
        const err = new Error(`This file costs $${dollars(costCents).toFixed(2)} (${intake.stats.billable} records x $${dollars(priceCents).toFixed(2)}). Your balance is $${bal.toFixed(2)}. Contact ${config.brandName} to add credits.`);
        err.status = 402;
        throw err;
      }
      chargedCents = costCents;
    }
    // The job and every row are saved in one transaction: all or nothing.
    const job = await jobs.createWithRecords({
      userId: req.user._id, type, fileName: String(req.file.originalname).slice(0, 200), period: periodOf(),
      providerMode: config.providersLive() ? 'live' : 'demo', modelVersion: MODEL_VERSION,
      settings: { enableAge: config.enableAgeFactor, lookbackDays: config.socialLookbackDays, jobSite: jobSiteFor(req.user) },
      counts: { rows: intake.stats.rows, scored: intake.stats.billable, skipped: intake.records.length - intake.stats.billable },
      costCents, priceCents, turnover: intake.turnover, issues: intake.issues, expiresAt: expiry().getTime(),
    }, intake.records.map((r) => ({ rowIndex: r.rowIndex, contactKey: r.contactKey, skipReason: r.skipReason, input: r.rec })));
    // Save the turnover table for later pre-hire runs.
    if (intake.turnover.length) {
      await users.update(req.user._id, { turnoverTable: intake.turnover.map((t) => ({ ...t, updatedAt: new Date().toISOString() })) });
    }
    notify(`New ${type === 'prehire' ? 'pre-hire' : 'current staff'} upload: ${job.fileName}`, `${req.user.email} uploaded ${job.fileName} (${intake.stats.billable} records, $${dollars(costCents).toFixed(2)}). Job ${job._id}.`).catch(() => {});
    return res.status(201).json({ job });
  } catch (e) {
    if (chargedCents) await users.adjustCredits(req.user._id, chargedCents).catch((err) => console.error('Refund failed', req.user._id, chargedCents, err));
    await reservation.release().catch(() => {});
    throw e;
  }
});

router.get('/:id', async (req, res) => {
  const job = await loadOwnedJob(req, res); if (!job) return;
  res.json({ job });
});

// Advance processing. The browser calls this in a loop until status is completed.
router.post('/:id/step', async (req, res) => {
  const job = await loadOwnedJob(req, res); if (!job) return;
  if (!['queued', 'processing'].includes(job.status)) return res.json({ job });
  const out = await stepJob(job._id);
  res.json({ job: out.job, busy: out.busy, recent: out.recent || [] });
});

router.get('/:id/results', async (req, res) => {
  const job = await loadOwnedJob(req, res); if (!job) return;
  res.json({ job, rows: (await records.forJob(job._id)).map(toRow), model: pointTables() });
});

router.get('/:id/export', async (req, res) => {
  const job = await loadOwnedJob(req, res); if (!job) return;
  const rows = (await records.forJob(job._id)).map(toRow);
  const base = `${job.type === 'prehire' ? 'prehire' : 'staff'}-retention-${job.createdAt.slice(0, 10)}${job.providerMode === 'demo' ? '-DEMO' : ''}`;
  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
    return res.send(buildCsv(job, rows));
  }
  const buf = await buildWorkbook(job, rows);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`);
  return res.send(Buffer.from(buf));
});

// Stop a job. Records not yet scored are refunded. The status change is claimed
// atomically first, so repeated or parallel cancels refund exactly once.
router.post('/:id/cancel', async (req, res) => {
  const job = await loadOwnedJob(req, res); if (!job) return;
  // A unique row per job makes the refund happen once even if Stop is pressed repeatedly.
  if (!(await settings.insertIfAbsent(`cancel:${job._id}`, { at: new Date().toISOString() }))) {
    return res.status(400).json({ error: 'This run has already been stopped.' });
  }
  const claimed = await jobs.claimCancel(job._id);
  if (!claimed) { await settings.remove(`cancel:${job._id}`); return res.status(400).json({ error: 'Only unfinished runs can be stopped.' }); }
  const unscored = await records.skipUnfinished(job._id, 'Run stopped');
  const refundCents = unscored * job.priceCents;
  if (refundCents > 0) await users.adjustCredits(job.userId, refundCents);
  const updated = await jobs.applyRefund(job._id, refundCents, unscored);
  res.json({ job: updated, refund: dollars(refundCents) });
});

router.delete('/:id', async (req, res) => {
  const job = await loadOwnedJob(req, res); if (!job) return;
  if (['queued', 'processing', 'failed'].includes(job.status)) return res.status(400).json({ error: 'Stop the run first. Unscored records are refunded when a run is stopped.' });
  await jobs.remove(job._id);
  res.json({ ok: true });
});

module.exports = router;
