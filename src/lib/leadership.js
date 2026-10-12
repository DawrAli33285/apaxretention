// Leadership summary: the figures an HR leader and a CFO ask for first.
// Everything is derived from the scored rows, the turnover measured in the
// uploaded file and the cost-per-exit model in financial.js. Nothing is a forecast.
import { potentialLoss } from './financial';

const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

/** Average cost of one exit for each job class, plus the overall average. */
export function costByJobClass(rows, cfg) {
  const done = rows.filter((r) => r.status === 'done');
  const g = {};
  done.forEach((r) => {
    const k = r.jobClass || 'Unspecified';
    g[k] = g[k] || { jobClass: k, people: 0, atRisk: 0, costs: [], exposure: 0 };
    const c = potentialLoss(r, cfg).total;
    g[k].people++; g[k].costs.push(c);
    if (r.band === 'At risk') { g[k].atRisk++; g[k].exposure += c; }
  });
  const list = Object.values(g).map((x) => ({ ...x, costPerExit: avg(x.costs) })).sort((a, b) => b.costPerExit - a.costPerExit);
  return { list, overall: avg(done.map((r) => potentialLoss(r, cfg).total)) };
}

export function leadershipFigures(job, rows, cfg) {
  const done = rows.filter((r) => r.status === 'done');
  const band = (b) => done.filter((r) => r.band === b);
  const atRisk = band('At risk');
  const watch = band('Watch');
  const { list: roles, overall } = costByJobClass(rows, cfg);
  const roleCost = Object.fromEntries(roles.map((x) => [x.jobClass, x.costPerExit]));
  const exposure = (set) => set.reduce((s, r) => s + potentialLoss(r, cfg).total, 0);

  // Turnover actually measured in this file (current staff runs with leavers).
  const t = job.turnover || [];
  const left = t.reduce((s, x) => s + (x.separations || 0), 0);
  const active = t.reduce((s, x) => s + (x.headcount || 0), 0);
  const turnoverRate = left && active ? (left / (active + left / 2)) * 100 : null;
  const lastYearCost = left ? t.reduce((s, x) => s + (x.separations || 0) * (roleCost[x.jobClass] ?? overall), 0) : null;

  // Department where the largest share of people are at risk (minimum 3 people).
  const depts = {};
  done.forEach((r) => { const k = r.department || 'Unspecified'; depts[k] = depts[k] || { key: k, n: 0, risk: 0 }; depts[k].n++; if (r.band === 'At risk') depts[k].risk++; });
  const focus = Object.values(depts).filter((d) => d.n >= 3 && d.risk > 0).sort((a, b) => b.risk / b.n - a.risk / a.n || b.risk - a.risk)[0] || null;

  const tenures = done.map((r) => r.factors?.tenureMonths).filter((v) => v != null);
  return {
    scored: done.length,
    atRisk: atRisk.length, watch: watch.length, stay: band('Likely to stay').length,
    atRiskExposure: exposure(atRisk), watchExposure: exposure(watch),
    costPerExit: overall, roles,
    left, active, turnoverRate, lastYearCost,
    focus,
    avgTenureMonths: tenures.length ? avg(tenures) : null,
  };
}
