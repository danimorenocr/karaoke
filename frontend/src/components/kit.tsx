import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '../lib/api';
import { Headphones } from './art';

export const ACCENT = '#22d8ea';

/** Iconos de linea del panel. */
const ICONS = {
  home: 'M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h-3zM20 14v6h-3',
  chart: 'M5 21V11M12 21V4M19 21v-7',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  store: 'M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9a2.7 2.7 0 005.3 0 2.7 2.7 0 005.4 0A2.7 2.7 0 0020 9M10 20v-6h4v6',
  users: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8',
  history: 'M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8M3 3v5h5M12 7v5l3 2',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 16v-5M12 8h.01',
  down: 'M6 9l6 6 6-6',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5',
  close: 'M6 6l12 12M18 6L6 18',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  tv: 'M3 6h18v12H3zM8 21h8',
  dj: 'M3 14a9 9 0 0118 0M3 14v3a2 2 0 002 2h1v-6H5a2 2 0 00-2 1zM21 14v3a2 2 0 01-2 2h-1v-6h1a2 2 0 012 1z',
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

/** Logo "sonora. karaoke". */
export function Brand({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const big = size === 'lg';
  const bars = [10, 18, 12, 24, 14, 8];
  return (
    <div className="text-center leading-none">
      <svg viewBox="0 0 40 28" className={`mx-auto ${big ? 'h-10' : 'h-7'}`} aria-hidden fill={ACCENT}>
        {bars.map((h, i) => <rect key={i} x={3 + i * 6.4} y={(28 - h) / 2} width="3.4" height={h} rx="1.7" />)}
      </svg>
      <div className={`font-extrabold tracking-tight text-white ${big ? 'mt-2 text-5xl' : 'mt-1.5 text-3xl'}`}>sonora.</div>
      <div className={`mt-1 tracking-[.45em] text-slate-300 ${big ? 'text-xs' : 'text-[9px]'}`}>KARAOKE</div>
    </div>
  );
}

export interface NavItem { id: string; label: string; icon: IconName }

/** Pagina del panel: barra lateral + barra superior + cabecera con titulo. */
export function Shell({
  nav, active, onNav, eyebrow, title, subtitle, org, orgStatus = 'Activo', links = [], children,
}: {
  nav: NavItem[]; active: string; onNav: (id: string) => void;
  eyebrow: string; title: string; subtitle: string;
  org: string; orgStatus?: string; links?: [string, string, IconName][]; children: ReactNode;
}) {
  const user = auth.user();
  const [menu, setMenu] = useState(false);
  const initials = (user?.name ?? '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const logout = () => { auth.clear(); location.href = '/login'; };

  return (
    <div className="min-h-screen bg-[#060b14] text-slate-100" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      {/* Barra lateral (escritorio) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-white/[0.07] bg-[#070d17] lg:flex">
        <div className="px-5 pb-6 pt-7"><Brand /></div>
        <nav className="flex flex-col gap-1 px-3">
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => onNav(n.id)}
              className={`relative flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${active === n.id ? 'bg-white/[0.07] text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'}`}
            >
              {active === n.id && <span className="absolute -left-3 bottom-2 top-2 w-1 rounded-r-full" style={{ background: ACCENT }} />}
              <span style={active === n.id ? { color: ACCENT } : undefined}><Icon name={n.icon} /></span>
              {n.label}
            </button>
          ))}
        </nav>
        {links.length > 0 && (
          <div className="mt-6 flex flex-col gap-1 border-t border-white/[0.07] px-3 pt-4">
            {links.map(([to, label, icon]) => (
              <Link key={to} to={to} target="_blank" className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-slate-400 transition hover:bg-white/5 hover:text-slate-100">
                <Icon name={icon} className="h-4 w-4" />{label}<Icon name="external" className="ml-auto h-3.5 w-3.5 opacity-60" />
              </Link>
            ))}
          </div>
        )}
        <div className="relative mt-auto h-44 overflow-hidden">
          <div className="absolute -left-10 bottom-[-40px] h-40 w-40 rounded-full border border-cyan-300/20" style={{ background: 'radial-gradient(circle,#0c1424 0 30%,#0a1a2c 31% 60%,transparent 61%)', boxShadow: `0 0 50px ${ACCENT}22` }} />
          <p className="absolute bottom-6 left-5 text-[15px] leading-snug text-slate-100">La música<br />nos une <span style={{ color: ACCENT }}>♫</span></p>
        </div>
      </aside>

      <div className="lg:pl-56">
        {/* Barra superior */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/[0.07] bg-[#060b14]/90 px-4 py-3.5 backdrop-blur sm:px-8">
          <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5">
            <span className="text-slate-300"><Icon name="store" /></span>
            <span className="truncate text-sm font-semibold">{org}</span>
            <span className="flex shrink-0 items-center gap-1.5 text-sm text-slate-200"><i className="h-2 w-2 rounded-full bg-emerald-400" />{orgStatus}</span>
          </div>
          <div className="relative ml-auto flex items-center gap-4">
            <button onClick={() => setMenu((v) => !v)} className="flex items-center gap-3 rounded-2xl px-2 py-1 transition hover:bg-white/5" aria-haspopup="menu" aria-expanded={menu}>
              <span className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-sm font-bold">{initials}</span>
              <span className="hidden text-sm font-medium sm:block">{user?.name}</span>
              <Icon name="down" className="h-4 w-4 text-slate-400" />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-14 z-20 w-56 rounded-2xl border border-white/10 bg-[#0b1322] p-2 shadow-2xl" role="menu">
                  <div className="px-3 py-2 text-xs text-slate-400">{user?.role === 'SUPER_ADMIN' ? 'Super administrador' : user?.role === 'ADMIN' ? 'Administrador' : 'DJ'}</div>
                  <button onClick={logout} className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-red-300 hover:bg-red-500/10" role="menuitem">Cerrar sesión</button>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Navegacion en pantallas pequenas */}
        <nav className="flex gap-1 overflow-x-auto border-b border-white/[0.07] px-3 py-2 lg:hidden">
          {nav.map((n) => (
            <button key={n.id} onClick={() => onNav(n.id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${active === n.id ? 'bg-white/10 text-white' : 'text-slate-400'}`}>
              <span style={active === n.id ? { color: ACCENT } : undefined}><Icon name={n.icon} className="h-4 w-4" /></span>{n.label}
            </button>
          ))}
        </nav>

        {/* Cabecera */}
        <section className="relative overflow-hidden border-b border-white/[0.07]" style={{ background: `radial-gradient(60% 120% at 85% 0%, ${ACCENT}22, transparent 70%), linear-gradient(180deg,#08111e,#060b14)` }}>
          <div className="relative z-10 px-5 py-9 sm:px-8 sm:py-11">
            <div className="text-xs font-semibold uppercase tracking-[.3em]" style={{ color: ACCENT }}>{eyebrow}</div>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
            <p className="mt-2 max-w-xl text-[15px] text-slate-300">{subtitle}</p>
          </div>
          <Headphones className="pointer-events-none absolute -top-2 right-[18%] hidden h-[115%] w-auto opacity-90 md:block" />
          <p className="pointer-events-none absolute right-8 top-1/2 hidden -translate-y-1/2 -rotate-6 text-right text-3xl leading-tight text-slate-200 xl:block" style={{ fontFamily: "'Caveat', cursive" }}>
            Tu karaoke,<br />tu estilo <span style={{ color: ACCENT }}>♡</span>
          </p>
        </section>

        <main className="px-5 py-7 sm:px-8">{children}</main>
      </div>
    </div>
  );
}

/** Ventana emergente del panel. */
export function Dialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`w-full ${wide ? 'max-w-3xl' : 'max-w-md'} rounded-3xl border border-white/10 bg-[#0b1322] shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Cerrar"><Icon name="close" className="h-5 w-5" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function Card({ title, right, children, className = '' }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-white/[0.04] ${className}`}>
      {title && (
        <h2 className="flex items-center justify-between border-b border-white/10 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {title}
          {right}
        </h2>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Btn({ kind = 'ghost', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'ghost' | 'accent' | 'danger' | 'ok' }) {
  const styles = {
    ghost: 'bg-white/10 hover:bg-white/15 text-slate-100',
    accent: 'text-[#04202a] hover:brightness-110',
    ok: 'bg-emerald-500/90 hover:bg-emerald-400 text-[#032016]',
    danger: 'bg-red-500/15 hover:bg-red-500/25 text-red-300',
  }[kind];
  return (
    <button
      {...p}
      style={kind === 'accent' ? { background: ACCENT } : undefined}
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition active:scale-[.98] disabled:opacity-30 ${styles} ${className}`}
    />
  );
}

export function Field({ label, hint, ...p }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-slate-300">{label}</span>
      <input
        {...p}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-slate-100 outline-none placeholder:text-slate-500 focus:border-white/30"
      />
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-start gap-4 rounded-xl border border-white/10 bg-white/5 p-4 text-left" role="switch" aria-checked={checked}>
      <span className="mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition" style={{ background: checked ? ACCENT : '#334155' }}>
        <span className={`h-5 w-5 rounded-full bg-white transition ${checked ? 'translate-x-5' : ''}`} />
      </span>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
      </span>
    </button>
  );
}

export function Badge({ tone = 'slate', children }: { tone?: 'slate' | 'green' | 'red' | 'amber' | 'teal'; children: ReactNode }) {
  const t = {
    slate: 'bg-white/10 text-slate-300',
    green: 'bg-emerald-400/15 text-emerald-300',
    red: 'bg-red-400/15 text-red-300',
    amber: 'bg-amber-400/15 text-amber-300',
    teal: 'bg-teal-400/15 text-teal-300',
  }[tone];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${t}`}>{children}</span>;
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="p-8 text-center text-sm text-slate-500">{children}</p>;
