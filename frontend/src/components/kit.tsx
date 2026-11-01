import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '../lib/api';

export const ACCENT = '#22d3c5';

/** Pagina con barra superior (estilo oscuro del panel). */
export function Shell({ title, subtitle, links = [], children }: { title: string; subtitle?: string; links?: [string, string][]; children: ReactNode }) {
  const user = auth.user();
  return (
    <div className="min-h-screen bg-[#050d18] text-slate-100" style={{ backgroundImage: `radial-gradient(70% 40% at 20% 0%, ${ACCENT}1a, transparent 70%)` }}>
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#050d18]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
          <div>
            <div className="text-lg font-bold leading-tight">{title}</div>
            <div className="text-xs text-slate-400">{subtitle ?? user?.businessName} · {user?.name}</div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {links.map(([to, label]) => (
              <Link key={to} to={to} target="_blank" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15">{label} ↗</Link>
            ))}
            <Btn onClick={() => { auth.clear(); location.href = '/login'; }}>Salir</Btn>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
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

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <nav className="mb-6 inline-flex flex-wrap gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
      {items.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${value === k ? 'text-[#04202a]' : 'text-slate-300 hover:bg-white/10'}`}
          style={value === k ? { background: ACCENT } : undefined}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="p-8 text-center text-sm text-slate-500">{children}</p>;
