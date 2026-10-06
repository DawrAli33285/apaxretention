import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LogOut, ShieldCheck, FlaskConical, Database, KeyRound } from 'lucide-react';
import { useSession } from '../lib/session';
import { BRAND } from '../lib/brand';
import { money } from '../lib/api';

const navCls = ({ isActive }) => `px-3 py-2 rounded-md text-sm font-medium ${isActive ? 'bg-white/15 text-white' : 'text-brand-100 hover:text-white hover:bg-white/10'}`;

// The Apax Group mark: bright peak (#233dff) and the navy rising band (#12229d).
// On dark backgrounds it sits on a white tile so both blues keep their contrast.
export function ApaxMark({ light, size = 30 }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-md ${light ? 'bg-white' : ''}`} style={{ width: size + 4, height: size + 4 }}>
      <svg width={size - 4} height={size - 4} viewBox="20 30 700 360" aria-hidden>
        <polygon points="33,380 258,155 483,380 333,380 258,305 183,380" fill="#233dff" />
        <polygon points="295,118 370,43 706,380 555,380" fill="#12229d" />
      </svg>
    </span>
  );
}

export function Logo({ light }) {
  return (
    <Link to="/" className="flex items-center gap-2">
      {BRAND.logoUrl ? <img src={BRAND.logoUrl} alt={BRAND.name} className="h-8 w-auto" /> : (
        <ApaxMark light={light} />
      )}
      <span className={`font-display text-xl tracking-wide ${light ? 'text-white' : 'text-brand-900'}`}>{BRAND.name}</span>
      <span className={`hidden sm:inline text-sm ${light ? 'text-brand-200' : 'text-slate-500'}`}>{BRAND.product}</span>
    </Link>
  );
}

export function DemoBanner() {
  const { config } = useSession();
  if (!config?.showNotices || config?.providerMode !== 'demo') return null;
  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-2">
        <FlaskConical size={16} className="shrink-0" />
        <span><strong>Demo mode.</strong> Social signals are simulated because no People Data Labs / RapidAPI keys are set. Scores show the full process but do not describe the real people in your file.</span>
      </div>
    </div>
  );
}

// Shown to administrators when the app runs on Vercel without a permanent database.
export function TemporaryDatabaseBanner() {
  const { config, user } = useSession();
  if (!config?.showNotices || !config?.database?.temporary || user?.role !== 'admin') return null;
  return (
    <div className="bg-rose-50 border-b border-rose-200 text-rose-900 text-sm">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-2">
        <Database size={16} className="shrink-0" />
        <span><strong>Temporary database.</strong> This deployment is using the built-in test database, which resets whenever the hosting server restarts. To keep data, add a Postgres database in Vercel (Storage, then Neon) and redeploy.</span>
      </div>
    </div>
  );
}

// Shown after signing in with a short password such as the included test login.
export function WeakPasswordBanner() {
  const { user, config } = useSession();
  if (!config?.showNotices || !user?.passwordWeak) return null;
  return (
    <div className="bg-sky-50 border-b border-sky-200 text-sky-900 text-sm">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-2">
        <KeyRound size={16} className="shrink-0" />
        <span>You signed in with a short test password. <Link to="/account" className="font-semibold underline">Choose a new password</Link> (10 characters or more) before sharing this app.</span>
      </div>
    </div>
  );
}

export default function Shell({ children }) {
  const { user, config, logout } = useSession();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand-900">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Logo light />
            <nav className="hidden md:flex items-center gap-1">
              <NavLink to="/" end className={navCls}>Home</NavLink>
              <NavLink to="/jobs" className={navCls}>Results</NavLink>
              {config?.showPricing && <NavLink to="/invoices" className={navCls}>Invoices</NavLink>}
              {user?.role === 'admin' && <NavLink to="/admin" className={navCls}><span className="inline-flex items-center gap-1"><ShieldCheck size={14} />Admin</span></NavLink>}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {user?.role !== 'admin' && config?.showPricing && <span className="hidden sm:inline rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">Credits {money(user?.credits)}</span>}
            <Link to="/account" className="text-sm text-brand-100 hover:text-white max-w-[160px] truncate">{user?.email}</Link>
            <button className="text-brand-100 hover:text-white" title="Sign out" onClick={async () => { await logout(); navigate('/login'); }}><LogOut size={18} /></button>
          </div>
        </div>
        <nav className="md:hidden flex gap-1 px-2 pb-2 overflow-x-auto">
          <NavLink to="/" end className={navCls}>Home</NavLink>
          <NavLink to="/jobs" className={navCls}>Results</NavLink>
          {config?.showPricing && <NavLink to="/invoices" className={navCls}>Invoices</NavLink>}
          {user?.role === 'admin' && <NavLink to="/admin" className={navCls}>Admin</NavLink>}
        </nav>
      </header>
      <TemporaryDatabaseBanner />
      <WeakPasswordBanner />
      <DemoBanner />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">{children}</main>
      <footer className="text-center text-xs text-slate-400 py-4">{BRAND.name} · {BRAND.tagline}</footer>
    </div>
  );
}
