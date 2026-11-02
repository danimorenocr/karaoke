import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAction, useToast } from '../components/ui';
import { ACCENT, Badge, Btn, Card, Dialog, Empty, Field, Icon, NavItem, Shell } from '../components/kit';

const EMPTY = { name: '', adminName: '', adminEmail: '', adminPassword: '' };

const Stat = ({ label, value }: { label: string; value: number | string }) => (
  <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5">
    <div className="text-3xl font-extrabold">{value}</div>
    <div className="mt-1 text-xs uppercase tracking-wider text-slate-400">{label}</div>
  </div>
);

const dur = (sec: number) => (sec < 3600 ? `${Math.floor(sec / 60)} min` : sec < 86400 ? `${(sec / 3600).toFixed(1)} h` : `${(sec / 86400).toFixed(1)} días`);

function Health() {
  const [m, setM] = useState<any>(null);
  useEffect(() => {
    const load = () => api('GET', '/super/metrics').then(setM).catch(() => {});
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);
  if (!m) return null;
  const quotaPct = Math.min(100, Math.round((m.youtube.estimatedUnits / m.youtube.dailyQuota) * 100));
  const rows: [string, string, boolean?][] = [
    ['Tiempo encendido', dur(m.uptimeSec)],
    ['Base de datos', m.database.ok ? `${m.database.ms} ms` : 'SIN RESPUESTA', !m.database.ok],
    ['Conexiones en vivo', `${m.sockets.connected} (${m.sockets.tvScreens} TV)`],
    [`Latencia (últ. ${m.windowMin} min)`, `p50 ${m.latencyMs.p50} · p95 ${m.latencyMs.p95} · p99 ${m.latencyMs.p99} ms`, m.latencyMs.p95 > 1500],
    ['Peticiones / errores 4xx / 5xx', `${m.requests} / ${m.errors4xx} / ${m.errors5xx}`, m.errors5xx > 0],
    ['Desconexiones de sockets', `${m.socket.disconnectsSinceStart} de ${m.socket.connectsSinceStart} conexiones`],
    ['Memoria del servidor', `${m.memoryMb} MB`],
    ['Cuota YouTube hoy (estimada)', `${m.youtube.estimatedUnits} / ${m.youtube.dailyQuota} (${quotaPct}%)${m.youtube.blocked ? ' · BLOQUEADA' : ''}`, quotaPct >= 80 || m.youtube.blocked],
  ];
  return (
    <Card title="Salud de la plataforma" right={<Badge tone={m.database.ok && m.errors5xx === 0 ? 'green' : 'red'}>{m.database.ok && m.errors5xx === 0 ? 'Todo en orden' : 'Revisar'}</Badge>} className="mb-6">
      <dl className="grid gap-x-8 gap-y-3 text-sm md:grid-cols-2">
        {rows.map(([k, v, bad]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-white/5 pb-2">
            <dt className="text-slate-400">{k}</dt>
            <dd className={`text-right font-medium ${bad ? 'text-red-300' : ''}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-slate-500">Se calcula en memoria: se reinicia con cada despliegue y se actualiza cada 15 s.</p>
    </Card>
  );
}

type Tab = 'overview' | 'businesses';
const NAV: NavItem[] = [
  { id: 'overview', label: 'Resumen', icon: 'home' },
  { id: 'businesses', label: 'Establecimientos', icon: 'store' },
];
const HERO: Record<Tab, [string, string]> = {
  overview: ['Resumen', 'Estado general de la plataforma y de todos los establecimientos.'],
  businesses: ['Establecimientos', 'Crea, suspende y reactiva los bares que usan Sonora.'],
};

export default function SuperAdmin() {
  const [tab, setTab] = useState<Tab>('overview');
  const [list, setList] = useState<any[] | null>(null);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState(EMPTY);
  const { toast, node } = useToast();
  const run = useAction(toast);

  const load = useCallback(async () => setList(await api('GET', '/super/businesses')), []);
  useEffect(() => { load().catch((e) => toast(e.message, true)); }, [load]);

  const active = list?.filter((b) => b.status === 'ACTIVE').length ?? 0;
  const sum = (k: 'tables' | 'users' | 'requests') => list?.reduce((n, b) => n + b._count[k], 0) ?? 0;
  const shown = useMemo(() => (list ?? []).filter((b) => b.name.toLowerCase().includes(q.trim().toLowerCase())), [list, q]);
  const [title, subtitle] = HERO[tab];

  return (
    <Shell nav={NAV} active={tab} onNav={(id) => setTab(id as Tab)} eyebrow="Super administración" title={title} subtitle={subtitle} org="Plataforma Sonora" orgStatus="En línea">
      {tab === 'overview' && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Bares activos" value={`${active}/${list?.length ?? 0}`} />
            <Stat label="Mesas" value={sum('tables')} />
            <Stat label="Usuarios" value={sum('users')} />
            <Stat label="Solicitudes" value={sum('requests')} />
          </div>
          <Health />
        </>
      )}

      {tab === 'businesses' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-w-60 flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3.5 text-slate-400 focus-within:border-white/30">
              <Icon name="search" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar establecimiento..." className="w-full bg-transparent text-slate-100 outline-none placeholder:text-slate-500" />
            </label>
            <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-2xl px-6 py-3.5 font-bold text-[#04202a] shadow-lg transition hover:brightness-110 active:scale-[.98]" style={{ background: ACCENT, boxShadow: `0 8px 30px ${ACCENT}44` }}>
              <Icon name="plus" />Nuevo establecimiento
            </button>
          </div>

          {!list ? (
            <Card><Empty>Cargando...</Empty></Card>
          ) : shown.length === 0 ? (
            <Card><Empty>{list.length === 0 ? 'Aún no hay establecimientos. Crea el primero.' : 'No hay establecimientos que coincidan.'}</Empty></Card>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
              {shown.map((b) => {
                const on = b.status === 'ACTIVE';
                return (
                  <article key={b.id} className={`rounded-3xl border border-white/10 p-5 shadow-xl ${on ? '' : 'opacity-60'}`} style={{ background: `radial-gradient(90% 90% at 100% 0%, ${on ? ACCENT + '1f' : '#ef444422'}, transparent 60%), #0b1322` }}>
                    <div className="flex items-start justify-between gap-3">
                      <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm"><i className={`h-2.5 w-2.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-red-500'}`} />{on ? 'Activo' : 'Suspendido'}</span>
                      <span className="text-xs text-slate-500">desde {new Date(b.createdAt).toLocaleDateString()}</span>
                    </div>
                    <h3 className="mt-3 truncate text-2xl font-extrabold tracking-tight">{b.name}</h3>
                    <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                      {([['Mesas', b._count.tables], ['Usuarios', b._count.users], ['Solicitudes', b._count.requests]] as const).map(([k, v]) => (
                        <div key={k} className="rounded-xl bg-white/[0.05] py-2.5"><dd className="text-xl font-bold">{v}</dd><dt className="text-[11px] uppercase tracking-wider text-slate-400">{k}</dt></div>
                      ))}
                    </dl>
                    <Btn
                      kind={on ? 'danger' : 'ok'}
                      className="mt-4 w-full"
                      onClick={() =>
                        (!on || confirm(`¿Suspender ${b.name}? Su equipo perderá el acceso y los QR dejarán de funcionar.`)) &&
                        run(async () => { await api('PATCH', `/super/businesses/${b.id}/status`, { active: !on }); await load(); })
                      }
                    >
                      {on ? 'Suspender' : 'Activar'}
                    </Btn>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {creating && (
        <Dialog title="Nuevo establecimiento" onClose={() => setCreating(false)}>
          <form
            className="grid gap-4"
            onSubmit={(e) => { e.preventDefault(); run(async () => { await api('POST', '/super/businesses', f); setF(EMPTY); setCreating(false); toast('Establecimiento creado'); await load(); }); }}
          >
            <Field label="Nombre del bar" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required autoFocus />
            <div className="border-t border-white/10 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Cuenta del administrador</div>
            <Field label="Nombre" value={f.adminName} onChange={(e) => setF({ ...f, adminName: e.target.value })} required />
            <Field label="Correo" type="email" value={f.adminEmail} onChange={(e) => setF({ ...f, adminEmail: e.target.value })} required />
            <Field label="Contraseña" type="password" minLength={8} hint="Mínimo 8 caracteres" value={f.adminPassword} onChange={(e) => setF({ ...f, adminPassword: e.target.value })} required />
            <Btn kind="accent" className="py-3">Crear establecimiento</Btn>
          </form>
        </Dialog>
      )}
      {node}
    </Shell>
  );
}
