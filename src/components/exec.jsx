// Leadership-facing sections of the results page: the HR leader and finance
// summary, the savings scenario, cost of one exit by role, the workplace
// pressure map, and the data and security panel.
import { useMemo, useState } from 'react';
import {
  Ban, Building2, CircleDollarSign, Clock, EyeOff, HeartHandshake, KeyRound, Lock, ShieldCheck, Trash2, TrendingDown, Users,
} from 'lucide-react';
import { leadershipFigures } from '../lib/leadership';
import { shortMoney } from '../lib/financial';
import { pct } from '../lib/explain';
import { Tip } from './charts';

const DOMAINS = [['financial', 'Financial'], ['schedule', 'Schedule'], ['workLife', 'Work-life'], ['communication', 'Communication']];

function Title({ title, sub, right, dark }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h2 className={`text-lg font-semibold ${dark ? 'text-white' : 'text-brand-900'}`}>{title}</h2>
        {sub && <p className={`text-sm mt-0.5 ${dark ? 'text-brand-200' : 'text-slate-500'}`}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

function Tile({ label, value, hint, tone = 'text-brand-900' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-3xl font-bold mt-1 tracking-tight ${tone}`}>{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

function Lens({ icon: Icon, title, who, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white"><Icon size={16} /></span>
        <div><div className="text-sm font-semibold text-brand-900 leading-tight">{title}</div><div className="text-xs text-slate-500">{who}</div></div>
      </div>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

/* ---------- Leadership summary ---------- */

export function LeadershipSummary({ job, rows, cfg }) {
  const f = useMemo(() => leadershipFigures(job, rows, cfg), [job, rows, cfg]);
  const prehire = job.type === 'prehire';
  const bottomLine = prehire
    ? <><strong>{f.atRisk} of {f.scored}</strong> candidates are a weak fit for staying. Hiring them and then losing them would cost about <strong>{shortMoney(f.atRiskExposure)}</strong>.</>
    : <>
      {f.lastYearCost != null && <>Turnover cost about <strong>{shortMoney(f.lastYearCost)}</strong> over the last 12 months. </>}
      Today <strong>{f.atRisk} of {f.scored}</strong> people are at risk of leaving, with <strong>{shortMoney(f.atRiskExposure)}</strong> in replacement cost on the line.
    </>;
  return (
    <section className="card p-5 mb-6">
      <Title title="Leadership summary" sub="The numbers HR and finance ask for first. Built from your file and the cost of each role." />
      <p className="rounded-xl bg-brand-900 px-4 py-3 text-base sm:text-lg text-white leading-snug mb-4">{bottomLine}</p>
      <div className="grid lg:grid-cols-2 gap-4">
        <Lens icon={Users} title="People" who="For the HR leader">
          {prehire ? <>
            <Tile label="Candidates scored" value={f.scored} hint="each scored once" />
            <Tile label="Strong fit" value={f.stay} hint={`${pct(f.stay, f.scored)}% likely to stay`} tone="text-emerald-700" />
            <Tile label="Mixed fit" value={f.watch} hint="confirm concerns before an offer" tone="text-amber-700" />
            <Tile label="Weak fit" value={f.atRisk} hint="probe in the interview" tone="text-red-700" />
          </> : <>
            <Tile label="Annual turnover" value={f.turnoverRate != null ? `${Math.round(f.turnoverRate)}%` : '–'} hint={f.turnoverRate != null ? `${f.left} people left in the last 12 months` : 'add leavers to the file to measure it'} />
            <Tile label="At risk now" value={f.atRisk} hint={`${pct(f.atRisk, f.scored)}% of ${f.scored} people · reach out this month`} tone="text-red-700" />
            <Tile label="Watch list" value={f.watch} hint="check in this quarter" tone="text-amber-700" />
            <Tile label="Act first in" value={<span className="text-lg sm:text-xl leading-tight block break-words" title={f.focus?.key}>{f.focus ? f.focus.key : 'No hot spot'}</span>} hint={f.focus ? `${f.focus.risk} of ${f.focus.n} people at risk` : 'risk is spread evenly'} />
          </>}
        </Lens>
        <Lens icon={CircleDollarSign} title="Money" who="For the CFO">
          {prehire ? <>
            <Tile label="Cost of one bad hire" value={shortMoney(f.costPerExit)} hint="replace and ramp up one person" />
            <Tile label="Cost avoided" value={shortMoney(f.atRiskExposure)} hint="if weak-fit candidates were hired and left" tone="text-emerald-700" />
          </> : <>
            <Tile label="Turnover cost, last 12 months" value={f.lastYearCost != null ? shortMoney(f.lastYearCost) : '–'} hint={f.lastYearCost != null ? `${f.left} exits × cost of each role` : 'add leavers to the file to measure it'} tone="text-red-700" />
            <Tile label="Cost on the line now" value={shortMoney(f.atRiskExposure)} hint={`if the ${f.atRisk} at-risk people leave`} tone="text-red-700" />
            <Tile label="Cost to lose one employee" value={shortMoney(f.costPerExit)} hint="average across roles" />
            <Tile label="Watch group exposure" value={shortMoney(f.watchExposure)} hint={`${f.watch} people who could go either way`} tone="text-amber-700" />
          </>}
        </Lens>
      </div>
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        {!prehire && <Savings f={f} />}
        <RoleCost f={f} wide={prehire} />
      </div>
    </section>
  );
}

function Savings({ f }) {
  const [share, setShare] = useState(25);
  const kept = Math.round((f.atRisk * share) / 100);
  const saved = (f.atRiskExposure * share) / 100;
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-brand-900"><TrendingDown size={16} className="text-brand-600" />What retention is worth</div>
      <p className="text-xs text-slate-500 mt-0.5">Drag to see the cost avoided by keeping part of the at-risk group.</p>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Cost avoided</div>
          <div className="text-4xl font-bold tracking-tight text-emerald-700">{shortMoney(saved)}</div>
        </div>
        <div className="text-right text-sm text-slate-600">Keep <strong className="text-slate-900">{kept} of {f.atRisk}</strong><br />at-risk people</div>
      </div>
      <input aria-label="Share of at-risk people kept" type="range" min="0" max="100" step="5" value={share} onChange={(e) => setShare(Number(e.target.value))} className="mt-4 w-full accent-brand-500" />
      <div className="flex justify-between text-xs text-slate-500"><span>0%</span><span className="font-semibold text-brand-600">{share}% kept</span><span>100%</span></div>
      <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-red-100">
        <div className="h-full bg-emerald-600 transition-all" style={{ width: `${share}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-500"><span>Avoided {shortMoney(saved)}</span><span>Still exposed {shortMoney(f.atRiskExposure - saved)}</span></div>
      <p className="mt-3 text-[11px] text-slate-400">A scenario, not a forecast. Uses the same cost per exit as the Financial impact tab.</p>
    </div>
  );
}

function RoleCost({ f, wide }) {
  const roles = f.roles.slice(0, 8);
  const max = Math.max(1, ...roles.map((r) => r.costPerExit));
  return (
    <div className={`rounded-2xl border border-slate-200 p-4 ${wide ? 'lg:col-span-2' : ''}`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-brand-900"><CircleDollarSign size={16} className="text-brand-600" />What it costs to lose one person, by role</div>
      <p className="text-xs text-slate-500 mt-0.5">Recruiting, onboarding, ramp-up and lost output for one exit.</p>
      <ul className="mt-4 space-y-2.5">
        {roles.map((r) => (
          <li key={r.jobClass} className="flex items-center gap-3">
            <span className="w-24 sm:w-40 shrink-0 truncate text-sm text-slate-700" title={r.jobClass}>{r.jobClass}</span>
            <Tip block className="flex-1" text={`${r.people} people · ${r.atRisk} at risk`}>
              <div className="h-4 w-full rounded bg-slate-100"><div className="h-4 rounded bg-brand-500" style={{ width: `${(r.costPerExit / max) * 100}%` }} /></div>
            </Tip>
            <span className="w-14 shrink-0 text-right text-sm font-bold text-slate-900">{shortMoney(r.costPerExit)}</span>
            <span className={`hidden sm:block w-16 shrink-0 text-right text-xs ${r.atRisk ? 'font-semibold text-red-700' : 'text-slate-400'}`}>{r.atRisk} at risk</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Workplace pressure map ---------- */

const cellTone = (share, n) => (!n ? 'bg-slate-50 text-slate-300' : n < 3 ? 'bg-slate-100 text-slate-500' : share >= 40 ? 'bg-red-100 text-red-800' : share >= 20 ? 'bg-amber-100 text-amber-800' : share > 0 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800');

export function PressureMap({ rows }) {
  const data = useMemo(() => {
    const done = rows.filter((r) => r.status === 'done');
    const g = {};
    done.forEach((r) => {
      const k = r.department || 'Unspecified';
      g[k] = g[k] || { key: k, n: 0, cells: Object.fromEntries(DOMAINS.map(([d]) => [d, { n: 0, hit: 0 }])) };
      g[k].n++;
      DOMAINS.forEach(([d]) => { const v = r.domains?.[d]; if (v != null) { g[k].cells[d].n++; if (v >= 4) g[k].cells[d].hit++; } });
    });
    return Object.values(g).map((x) => {
      const cells = Object.fromEntries(DOMAINS.map(([d]) => { const c = x.cells[d]; return [d, { ...c, share: c.n ? Math.round((c.hit / c.n) * 100) : 0 }]; }));
      const peak = Math.max(...Object.values(cells).map((c) => (c.n >= 3 ? c.share : -1)));
      return { key: x.key, n: x.n, cells, peak, signals: Math.max(...Object.values(cells).map((c) => c.n)) };
    }).filter((x) => x.signals > 0).sort((a, b) => b.peak - a.peak || b.n - a.n);
  }, [rows]);
  if (!data.length) return null;
  return (
    <section className="card p-5 mb-6">
      <Title title="Where workplace pressure sits" sub="Share of people showing moderate or high pressure (4 or more out of 10), by department and area. Highest first." />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] table-fixed border-separate border-spacing-1">
          <colgroup><col className="w-[30%]" />{DOMAINS.map(([d]) => <col key={d} />)}</colgroup>
          <thead>
            <tr>
              <th className="text-left text-[11px] font-medium uppercase tracking-wide text-slate-500 px-2">Department</th>
              {DOMAINS.map(([d, l]) => <th key={d} className="text-center text-[11px] font-medium uppercase tracking-wide text-slate-500">{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.key}>
                <td className="px-2 text-sm text-slate-700"><div className="truncate" title={row.key}>{row.key}</div><div className="text-[11px] text-slate-400">{row.signals} of {row.n} with a signal</div></td>
                {DOMAINS.map(([d, l]) => {
                  const c = row.cells[d];
                  return (
                    <td key={d} className={`rounded-lg text-center ${cellTone(c.share, c.n)}`}>
                      <Tip block text={c.n ? `${l}: ${c.hit} of ${c.n} people at 4+ out of 10` : `${l}: no signal`}>
                        <div className="py-2 leading-tight"><div className="text-sm font-semibold">{c.n ? `${c.share}%` : '–'}</div>{c.n > 0 && <div className="text-[10px] opacity-70">{c.hit} of {c.n}</div>}</div>
                      </Tip>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-emerald-50 border border-emerald-100" />None</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-amber-50 border border-amber-100" />Under 20%</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-amber-100" />20% to 39%</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-red-100" />40% or more</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-slate-100" />Fewer than 3 people</span>
        <span>Department totals only. No individual is named in this view.</span>
      </div>
    </section>
  );
}

/* ---------- Trust strip and security ---------- */

export function TrustStrip({ days, onOpen }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-brand-600"><ShieldCheck size={18} /></span>
      <p className="flex-1 min-w-[220px] text-sm text-brand-900"><strong>Privacy-first by design.</strong> Public information and your own file only. Full post text is never stored, and results delete automatically after {days} days.</p>
      <button type="button" onClick={onOpen} className="btn-secondary">Data and security</button>
    </div>
  );
}

export function SecurityPanel({ days, enableAge }) {
  const controls = [
    [Lock, 'Encrypted connection', 'Every connection to the hosted app runs over HTTPS, so files and results are encrypted on the way in and out.'],
    [KeyRound, 'Protected sign-in', 'Passwords are stored only as one-way hashes, never as readable text. Ten failed attempts lock the account for 15 minutes.'],
    [Clock, 'Sessions that expire', 'A sign-in lasts 12 hours in a secure cookie that page scripts cannot read. Changing a password signs out every other device.'],
    [Building2, 'Your data stays yours', 'Each client sees only its own uploads and results. Turning off a user removes their access immediately.'],
    [Trash2, 'Automatic deletion', `Uploaded rows and results are deleted automatically after ${days} days.`],
    [EyeOff, 'Minimal by design', 'We keep stress levels per area, not posts. Full post text is never stored, and individual phrases are not shown on screen or in exports.'],
  ];
  const never = [
    'Access private accounts or ask anyone for a login. Only publicly available information is used.',
    'Contact employees or candidates.',
    'Store the full text of a social media post.',
    `Use race, gender, religion or other protected traits in the score.${enableAge ? '' : ' Age is switched off.'}`,
    'Guess. Missing data scores neutral, and low-confidence profile matches are thrown out.',
  ];
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="card p-5 lg:col-span-2">
        <Title title="How we protect your data" sub="The safeguards built into the platform." />
        <ul className="grid sm:grid-cols-2 gap-3">
          {controls.map(([Icon, t, d]) => (
            <li key={t} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2"><span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Icon size={16} /></span><span className="font-semibold text-brand-900">{t}</span></div>
              <p className="mt-2 text-sm text-slate-700">{d}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-4">
        <div className="rounded-2xl bg-brand-900 p-5 text-white">
          <div className="flex items-center gap-2"><Ban size={18} className="text-brand-200" /><h2 className="text-lg font-semibold">What we never do</h2></div>
          <ul className="mt-3 space-y-2.5">
            {never.map((n) => <li key={n} className="flex gap-2 text-sm text-brand-100"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-300" />{n}</li>)}
          </ul>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2"><HeartHandshake size={18} className="text-brand-600" /><h2 className="font-semibold text-brand-900">Responsible use</h2></div>
          <p className="mt-2 text-sm text-slate-700">Scores are a guide for a supportive conversation, not the only basis for a hiring or employment decision. They show where to listen first.</p>
        </div>
      </div>
    </div>
  );
}
