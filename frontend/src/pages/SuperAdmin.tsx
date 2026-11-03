import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAction, useToast } from '../components/ui';
import { EXPERIENCES } from '../experiences';
import StatsPanel from '../components/StatsPanel';
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

type Tab = 'overview' | 'events' | 'businesses' | 'payments';
const NAV: NavItem[] = [
  { id: 'overview', label: 'Resumen', icon: 'home' },
  { id: 'events', label: 'Eventos', icon: 'chart' },
  { id: 'businesses', label: 'Establecimientos', icon: 'store' },
  { id: 'payments', label: 'Pagos', icon: 'card' },
];
const HERO: Record<Tab, [string, string]> = {
  overview: ['Resumen', 'Estado general de la plataforma y de todos los establecimientos.'],
  events: ['Eventos', 'Gráficas de actividad de todos los establecimientos o de uno en particular.'],
  businesses: ['Establecimientos', 'Crea, suspende, reactiva o elimina los bares que usan TONO.'],
  payments: ['Pagos', 'Historial de pagos confirmados de todos los establecimientos.'],
};

const money = (n: number) => '$' + n.toLocaleString('es-CO');

function Payments() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('GET', '/super/payments').then(setRows).catch((e) => setErr(e.message)); }, []);
  if (err) return <Card><Empty>{err}</Empty></Card>;
  if (!rows) return <Card><Empty>Cargando...</Empty></Card>;
  const total = rows.reduce((n, r) => n + r.amount, 0);
  const now = new Date();
  const month = rows.filter((r) => new Date(r.createdAt) >= new Date(now.getFullYear(), now.getMonth(), 1)).reduce((n, r) => n + r.amount, 0);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Pagos" value={rows.length} />
        <Stat label="Este mes" value={money(month)} />
        <Stat label="Total" value={money(total)} />
      </div>
      <Card>
        {rows.length === 0 ? <Empty>Aún no hay pagos registrados. Aparecen aquí cuando confirmas un pago.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-slate-400"><tr>{['Fecha', 'Establecimiento', 'Plan', 'Valor', 'Días', 'Pagado hasta'].map((h) => <th key={h} className="px-5 py-3 font-semibold">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-white/[0.07]">
                    <td className="px-5 py-3 text-slate-300">{new Date(r.createdAt).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td className="px-5 py-3 font-semibold">{r.business?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-slate-300">{r.plan === 'CUSTOM' ? 'Personalizado' : r.plan === 'STANDARD' ? 'Estándar' : '—'}</td>
                    <td className="px-5 py-3 font-bold">{money(r.amount)}</td>
                    <td className="px-5 py-3 text-slate-300">{r.days || 'Sin límite'}</td>
                    <td className="px-5 py-3 text-slate-300">{r.paidUntil ? new Date(r.paidUntil).toLocaleDateString('es-CO') : 'Sin vencimiento'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function SuperAdmin() {
  const [tab, setTab] = useState<Tab>('overview');
  const [list, setList] = useState<any[] | null>(null);
  const [q, setQ] = useState('');
  const [days, setDays] = useState<Record<string, number>>({});
  const [statsBiz, setStatsBiz] = useState('all');
  const [creating, setCreating] = useState(false);
  const [del, setDel] = useState<{ b: any; text: string } | null>(null);
  const [designs, setDesigns] = useState<{ b: any; sel: string[] } | null>(null);
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
    <Shell nav={NAV} active={tab} onNav={(id) => setTab(id as Tab)} eyebrow="Super administración" title={title} subtitle={subtitle} org="Plataforma TONO">
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

      {tab === 'events' && (
        <div className="space-y-6">
          <label className="inline-flex items-center gap-3 text-sm text-slate-300">
            Establecimiento
            <select value={statsBiz} onChange={(e) => setStatsBiz(e.target.value)} className="rounded-xl border border-white/10 bg-[#0d1017] px-4 py-2.5 text-slate-100 outline-none focus:border-white/30">
              <option value="all">Todos</option>
              {(list ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <StatsPanel path={`/super/stats/${statsBiz}`} />
        </div>
      )}

      {tab === 'payments' && <Payments />}

      {tab === 'businesses' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-w-60 flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3.5 text-slate-400 focus-within:border-white/30">
              <Icon name="search" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar establecimiento..." className="w-full bg-transparent text-slate-100 outline-none placeholder:text-slate-500" />
            </label>
            <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-2xl px-6 py-3.5 font-bold text-[#0b1030] shadow-lg transition hover:brightness-110 active:scale-[.98]" style={{ background: ACCENT, boxShadow: `0 8px 30px ${ACCENT}44` }}>
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
                const review = b.status === 'PAYMENT_REVIEW';
                const pending = b.status === 'PENDING_PAYMENT' || review;
                const left = b.paidUntil ? Math.ceil((new Date(b.paidUntil).getTime() - Date.now()) / 86400000) : null;
                return (
                  <article key={b.id} className={`rounded-3xl border border-white/10 p-5 shadow-xl ${on ? '' : 'opacity-60'}`} style={{ background: `radial-gradient(90% 90% at 100% 0%, ${on ? ACCENT + '1f' : '#ef444422'}, transparent 60%), #0d1017` }}>
                    <div className="flex items-start justify-between gap-3">
                      <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm"><i className={`h-2.5 w-2.5 rounded-full ${on ? 'bg-emerald-400' : pending ? (review ? 'bg-indigo-300' : 'bg-amber-400') : 'bg-red-500'}`} />{on ? 'Activo' : review ? 'Pago por revisar' : pending ? 'Pago pendiente' : 'Suspendido'}</span>
                      <span className="text-xs text-slate-500">desde {new Date(b.createdAt).toLocaleDateString()}</span>
                    </div>
                    <h3 className="mt-3 truncate text-2xl font-extrabold tracking-tight">{b.name}</h3>
                    {(b.phone || b.plan) && (
                      <p className="mt-1 text-sm text-slate-400">
                        {b.plan && <span className="mr-2 rounded-full bg-white/10 px-2 py-0.5 text-xs">{b.plan === 'CUSTOM' ? 'Diseño personalizado' : 'Estándar'}</span>}
                        {b.phone && <a className="hover:underline" href={`https://wa.me/${b.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp {b.phone}</a>}
                      </p>
                    )}
                    <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                      {([['Mesas', b._count.tables], ['Usuarios', b._count.users], ['Solicitudes', b._count.requests]] as const).map(([k, v]) => (
                        <div key={k} className="rounded-xl bg-white/[0.05] py-2.5"><dd className="text-xl font-bold">{v}</dd><dt className="text-[11px] uppercase tracking-wider text-slate-400">{k}</dt></div>
                      ))}
                    </dl>
                    <div className="mt-4">
                      <div className="mb-1.5 text-[11px] uppercase tracking-wider text-slate-400">Buscar canciones con</div>
                      <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-white/[0.05] p-1">
                        {([['YOUTUBE', 'YouTube'], ['GOOGLE', 'Google']] as const).map(([k, label]) => {
                          const sel = (b.searchProvider ?? 'YOUTUBE') === k;
                          return (
                            <button
                              key={k}
                              onClick={() => !sel && run(async () => { await api('PATCH', `/super/businesses/${b.id}/search-provider`, { provider: k }); toast(`${b.name}: busca con ${label}`); await load(); })}
                              className="rounded-lg py-2 text-sm font-semibold transition"
                              style={sel ? { background: ACCENT, color: '#0b1030' } : { color: '#cbd5e1' }}
                              aria-pressed={sel}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <Btn
                      className="mt-3 w-full"
                      onClick={() => setDesigns({ b, sel: b.allowedExperiences?.length ? b.allowedExperiences : EXPERIENCES.map((x) => x.id) })}
                    >
                      Diseños: {b.allowedExperiences?.length ? `${new Set(['classic', ...b.allowedExperiences]).size} de ${EXPERIENCES.length}` : 'todos'}
                    </Btn>
                    <div className="mt-3 rounded-xl bg-white/[0.05] p-3">
                      <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-400">
                        <span>Acceso pagado</span>
                        <span className={left !== null && left <= 3 ? 'text-amber-300' : ''}>{b.paidUntil ? (left! > 0 ? `vence en ${left} día${left === 1 ? '' : 's'}` : 'vencido') : 'sin vencimiento'}</span>
                      </div>
                      <div className="flex gap-2">
                        <input type="number" min={0} max={3650} inputMode="numeric" aria-label="Días de acceso" className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-center" value={days[b.id] ?? 30} onChange={(e) => setDays({ ...days, [b.id]: Math.max(0, Math.min(3650, Number(e.target.value) || 0)) })} />
                        <Btn kind="ok" className="flex-1" onClick={() => run(async () => { const n = days[b.id] ?? 30; await api('PATCH', `/super/businesses/${b.id}/payment`, { days: n }); toast(n ? `${b.name}: pagado, +${n} días` : `${b.name}: activo sin vencimiento`); await load(); })}>
                          {pending ? 'Confirmar pago' : 'Registrar pago'}
                        </Btn>
                      </div>
                      <p className="mt-1.5 text-[11px] text-slate-500">Suma los días a lo que le quede. 0 = sin vencimiento. Al vencer se suspende solo.</p>
                    </div>
                    {!pending && <Btn
                      kind={on ? 'danger' : 'ok'}
                      className="mt-2 w-full"
                      onClick={() =>
                        (!on || confirm(`¿Suspender ${b.name}? Su equipo perderá el acceso y los QR dejarán de funcionar.`)) &&
                        run(async () => { await api('PATCH', `/super/businesses/${b.id}/status`, { active: !on }); await load(); })
                      }
                    >
                      {on ? 'Suspender' : 'Activar'}
                    </Btn>}
                    <button onClick={() => setDel({ b, text: '' })} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold text-red-300/80 transition hover:bg-red-500/10 hover:text-red-300"><Icon name="trash" className="h-4 w-4" />Eliminar establecimiento</button>
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
      {del && (
        <Dialog title="Eliminar establecimiento" onClose={() => setDel(null)}>
          <p className="text-sm text-slate-300">Se borrará <b>{del.b.name}</b> y <b>toda su información</b>: usuarios, mesas, QR, sesiones, canciones pedidas, estadísticas y pagos. No se puede deshacer.</p>
          <label className="mt-4 grid gap-1.5 text-sm">
            <span className="text-slate-400">Escribe el nombre del establecimiento para confirmar</span>
            <input value={del.text} onChange={(e) => setDel({ ...del, text: e.target.value })} placeholder={del.b.name} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-red-400/50" autoFocus />
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <Btn onClick={() => setDel(null)}>Cancelar</Btn>
            <Btn kind="danger" disabled={del.text.trim() !== del.b.name} onClick={() => run(async () => { await api('DELETE', `/super/businesses/${del.b.id}`); setDel(null); toast(`${del.b.name} eliminado`); await load(); })}>Eliminar para siempre</Btn>
          </div>
        </Dialog>
      )}
      {designs && (
        <Dialog title={`Diseños de ${designs.b.name}`} onClose={() => setDesigns(null)}>
          <p className="mb-4 text-sm text-slate-400">Elige qué diseños puede asignar este establecimiento a sus mesas. El clásico siempre está disponible.</p>
          <div className="grid gap-2">
            {EXPERIENCES.map((x) => {
              const on = x.id === 'classic' || designs.sel.includes(x.id);
              return (
                <button
                  key={x.id}
                  type="button"
                  disabled={x.id === 'classic'}
                  onClick={() => setDesigns({ ...designs, sel: on ? designs.sel.filter((i) => i !== x.id) : [...designs.sel, x.id] })}
                  className="flex items-center gap-3 rounded-xl border p-3 text-left transition hover:bg-white/5 disabled:cursor-default"
                  style={on ? { borderColor: ACCENT, background: ACCENT + '14' } : { borderColor: 'rgba(255,255,255,.1)' }}
                  aria-pressed={on}
                >
                  <span className="h-10 w-10 shrink-0 rounded-lg border border-white/10" style={{ background: `linear-gradient(135deg, ${x.swatch[0]} 50%, ${x.swatch[1]} 50%)` }} />
                  <span className="min-w-0 flex-1"><span className="block font-semibold">{x.name}</span><span className="block truncate text-xs text-slate-400">{x.description}</span></span>
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border text-sm font-bold" style={on ? { background: ACCENT, borderColor: ACCENT, color: '#0b1030' } : { borderColor: 'rgba(255,255,255,.2)' }}>{on ? <Icon name="check" className="h-4 w-4" /> : null}</span>
                </button>
              );
            })}
          </div>
          <Btn
            kind="accent"
            className="mt-5 w-full py-3"
            onClick={() => run(async () => { await api('PATCH', `/super/businesses/${designs.b.id}/experiences`, { ids: designs.sel }); setDesigns(null); toast('Diseños actualizados'); await load(); })}
          >
            Guardar
          </Btn>
        </Dialog>
      )}
      {node}
    </Shell>
  );
}
