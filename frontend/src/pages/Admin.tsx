import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../lib/api';
import { useAction, useToast } from '../components/ui';
import StatsPanel from '../components/StatsPanel';
import { EXPERIENCES } from '../experiences';
import { tableTheme, Sparkle } from '../components/art';
import { ACCENT, Badge, Btn, Card, Dialog, Empty, Field, Icon, NavItem, Shell, Toggle } from '../components/kit';

const tableUrl = (token: string) => `${location.origin}/m/${token}`;
const expName = (id: string) => EXPERIENCES.find((x) => x.id === id)?.name ?? id;

const STATUS: Record<string, ['slate' | 'green' | 'red' | 'amber' | 'teal', string]> = {
  PENDING: ['amber', 'Pendiente'],
  APPROVED: ['teal', 'En cola'],
  PLAYING: ['green', 'Sonando'],
  COMPLETED: ['slate', 'Completada'],
  REJECTED: ['red', 'Rechazada'],
  CANCELLED: ['slate', 'Cancelada'],
  FAILED: ['red', 'Falló'],
};

type Tab = 'stats' | 'tables' | 'settings' | 'staff' | 'history';

const NAV: NavItem[] = [
  { id: 'stats', label: 'Dashboard', icon: 'home' },
  { id: 'tables', label: 'Mesas y QR', icon: 'qr' },
  { id: 'settings', label: 'Configuración', icon: 'gear' },
  { id: 'staff', label: 'Equipo', icon: 'users' },
  { id: 'history', label: 'Historial', icon: 'history' },
];

const HERO: Record<Tab, [string, string]> = {
  stats: ['Dashboard', 'Mide cómo se vive el karaoke en tu negocio.'],
  tables: ['Mesas y QR', 'Gestiona las mesas, personaliza sus experiencias y descarga sus códigos QR.'],
  settings: ['Configuración', 'Identidad del bar y reglas para las solicitudes de canciones.'],
  staff: ['Equipo', 'Crea cuentas para tus DJs y gestiona su acceso.'],
  history: ['Historial', 'Las últimas 200 solicitudes de tu negocio.'],
};

/** Nombre de la mesa con edicion en el lugar (lapiz -> escribir -> Enter o Guardar). */
function TableName({ name, onSave }: { name: string; onSave: (name: string) => Promise<void> | void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);

  async function save() {
    const v = value.trim();
    if (!v || v === name) { setEditing(false); setValue(name); return; }
    setSaving(true);
    try { await onSave(v); setEditing(false); } finally { setSaving(false); }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="truncate text-2xl font-extrabold">{name}</span>
        <button title="Cambiar nombre" aria-label="Cambiar nombre de la mesa" onClick={() => { setValue(name); setEditing(true); }} className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-slate-100">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg>
        </button>
      </div>
    );
  }
  return (
    <form className="flex min-w-0 items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <input
        autoFocus
        value={value}
        maxLength={40}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && (setEditing(false), setValue(name))}
        className="min-w-0 flex-1 rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 text-base font-bold outline-none focus:border-white/40"
      />
      <Btn kind="accent" className="!px-2.5 !py-1 text-xs" disabled={saving || !value.trim()}>{saving ? '…' : 'Guardar'}</Btn>
      <Btn type="button" className="!px-2.5 !py-1 text-xs" onClick={() => { setEditing(false); setValue(name); }}>✕</Btn>
    </form>
  );
}

function Qr({ token, size }: { token: string; size: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(tableUrl(token), { width: size * 4, margin: 1 }).then(setSrc); }, [token, size]);
  return src ? <img src={src} style={{ width: size, height: size }} alt="Código QR de la mesa" /> : <div style={{ width: size, height: size }} className="rounded bg-black/10" />;
}

async function downloadQr(name: string, token: string, kind: 'png' | 'svg') {
  const href = kind === 'png'
    ? await QRCode.toDataURL(tableUrl(token), { width: 1024, margin: 2 })
    : 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(await QRCode.toString(tableUrl(token), { type: 'svg', margin: 2 }));
  const a = document.createElement('a');
  a.href = href;
  a.download = `qr-${name}.${kind}`;
  a.click();
}

/** Tarjeta de mesa: toma el aspecto de la experiencia que tiene asignada. */
function TableCard({ t, onDetails, onToggle, onRotate }: { t: any; onDetails: () => void; onToggle: () => void; onRotate: () => void }) {
  const [menu, setMenu] = useState(false);
  const th = tableTheme(t.experienceId);
  const ink = th.dark ? 'text-white' : 'text-[#1d1a14]';
  const sub = th.dark ? 'text-white/70' : 'text-[#1d1a14]/65';
  return (
    <article className={`relative overflow-hidden rounded-3xl p-5 shadow-xl transition ${t.active ? '' : 'opacity-60 grayscale'} ${ink}`} style={{ background: th.bg, minHeight: 300 }}>
      {th.art}
      <div className="relative z-10 flex items-start justify-between">
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${th.dark ? 'bg-white/10' : 'bg-black/[.06]'}`}>
          <i className={`h-2.5 w-2.5 rounded-full ${t.active ? 'bg-emerald-500' : 'bg-red-500'}`} />{t.active ? 'Activa' : 'Inactiva'}
        </span>
        <div className="relative">
          <button onClick={() => setMenu((v) => !v)} className={`grid h-8 w-10 place-items-center rounded-lg ${th.dark ? 'bg-white/10' : 'bg-black/[.06]'}`} aria-label="Más acciones" aria-haspopup="menu"><Icon name="dots" /></button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-10 z-20 w-60 rounded-2xl border border-white/10 bg-[#0b1322] p-1.5 text-sm text-slate-100 shadow-2xl" role="menu">
                <button className="w-full rounded-xl px-3 py-2.5 text-left hover:bg-white/10" onClick={() => { setMenu(false); onDetails(); }}>Ver detalles</button>
                <button className="w-full rounded-xl px-3 py-2.5 text-left hover:bg-white/10" onClick={() => { setMenu(false); onToggle(); }}>{t.active ? 'Desactivar mesa' : 'Activar mesa'}</button>
                <button className="w-full rounded-xl px-3 py-2.5 text-left text-red-300 hover:bg-red-500/10" onClick={() => { setMenu(false); onRotate(); }}>Revocar y regenerar QR</button>
              </div>
            </>
          )}
        </div>
      </div>

      <h3 className="relative z-10 mt-3 text-3xl font-extrabold tracking-tight">{t.name}</h3>
      <p className={`relative z-10 mt-1 text-sm ${sub}`}>Experiencia: {expName(t.experienceId)}</p>

      <div className="relative z-10 mt-4 inline-block rounded-2xl bg-white p-2 shadow-md">
        <Qr token={t.qrToken} size={104} />
      </div>

      <div className="relative z-10 mt-4 flex items-center justify-between gap-3">
        <span className={`flex items-center gap-2 text-sm ${sub}`}><Sparkle className="h-4 w-4" />Diseño personalizado</span>
        <button onClick={onDetails} className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition hover:brightness-110 ${th.dark ? 'bg-white/15 text-white' : 'bg-white/70 text-[#1d1a14]'}`}>
          Ver detalles <Icon name="arrow" className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}

function TableDetails({ t, onClose, onPatch, onRotate }: { t: any; onClose: () => void; onPatch: (d: any, ok?: string) => Promise<void>; onRotate: () => void }) {
  return (
    <Dialog title="Detalles de la mesa" onClose={onClose} wide>
      <div className="grid gap-6 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-2xl bg-white p-3"><Qr token={t.qrToken} size={188} /></div>
          <div className="flex gap-2">
            <Btn className="!px-3 !py-1.5 text-xs" onClick={() => downloadQr(t.name, t.qrToken, 'png')}><Icon name="download" className="mr-1 inline h-3.5 w-3.5" />PNG</Btn>
            <Btn className="!px-3 !py-1.5 text-xs" onClick={() => downloadQr(t.name, t.qrToken, 'svg')}><Icon name="download" className="mr-1 inline h-3.5 w-3.5" />SVG</Btn>
          </div>
          <a className="max-w-[12rem] truncate text-xs hover:underline" style={{ color: ACCENT }} href={tableUrl(t.qrToken)} target="_blank" rel="noreferrer">Abrir página de la mesa ↗</a>
        </div>

        <div className="min-w-0 space-y-5">
          <div>
            <div className="mb-1 text-xs uppercase tracking-wider text-slate-400">Nombre</div>
            <TableName name={t.name} onSave={(name) => onPatch({ name }, 'Nombre actualizado')} />
          </div>

          <div>
            <div className="mb-2 text-xs uppercase tracking-wider text-slate-400">Experiencia (diseño que ven los clientes)</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {EXPERIENCES.map((x) => {
                const on = x.id === t.experienceId;
                return (
                  <button
                    key={x.id}
                    onClick={() => !on && onPatch({ experienceId: x.id }, 'Diseño actualizado')}
                    className="flex items-center gap-3 rounded-xl border p-3 text-left transition hover:bg-white/5"
                    style={on ? { borderColor: ACCENT, background: ACCENT + '14' } : { borderColor: 'rgba(255,255,255,.1)' }}
                    aria-pressed={on}
                  >
                    <span className="h-10 w-10 shrink-0 rounded-lg border border-white/10" style={{ background: `linear-gradient(135deg, ${x.swatch[0]} 50%, ${x.swatch[1]} 50%)` }} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{x.name}</span>
                      <span className="block text-[11px] leading-tight text-slate-400">{x.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
            <Btn onClick={() => onPatch({ active: !t.active })}>{t.active ? 'Desactivar mesa' : 'Activar mesa'}</Btn>
            <Btn kind="danger" onClick={onRotate}>Revocar y regenerar QR</Btn>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function TablesView({ tables, onCreate, onPatch, onRotate }: {
  tables: any[];
  onCreate: (name: string) => Promise<void>;
  onPatch: (id: string, d: any, ok?: string) => Promise<void>;
  onRotate: (t: any) => void;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'on' | 'off'>('all');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const shown = useMemo(
    () => tables.filter((t) => t.name.toLowerCase().includes(q.trim().toLowerCase()) && (filter === 'all' || (filter === 'on') === t.active)),
    [tables, q, filter],
  );
  const open = tables.find((t) => t.id === openId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-60 flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3.5 text-slate-400 focus-within:border-white/30">
          <Icon name="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar mesa..." className="w-full bg-transparent text-slate-100 outline-none placeholder:text-slate-500" />
        </label>
        <div className="flex rounded-2xl border border-white/10 bg-white/[0.04] p-1.5">
          {([['all', 'Todas'], ['on', 'Activas'], ['off', 'Inactivas']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${filter === k ? 'text-[#04202a]' : 'text-slate-300 hover:bg-white/10'}`} style={filter === k ? { background: ACCENT } : undefined}>{label}</button>
          ))}
        </div>
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-2xl px-6 py-3.5 font-bold text-[#04202a] shadow-lg transition hover:brightness-110 active:scale-[.98]" style={{ background: ACCENT, boxShadow: `0 8px 30px ${ACCENT}44` }}>
          <Icon name="plus" />Nueva Mesa
        </button>
      </div>

      {tables.length === 0 ? (
        <Card><Empty>Aún no hay mesas. Crea la primera para generar su código QR.</Empty></Card>
      ) : shown.length === 0 ? (
        <Card><Empty>No hay mesas que coincidan con la búsqueda.</Empty></Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {shown.map((t) => (
            <TableCard
              key={t.id}
              t={t}
              onDetails={() => setOpenId(t.id)}
              onToggle={() => onPatch(t.id, { active: !t.active })}
              onRotate={() => onRotate(t)}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-white/[0.07] pt-4 text-sm text-slate-400">
        <Icon name="info" className="h-5 w-5" />Escanea el QR en la mesa para empezar a cantar
      </div>

      {creating && (
        <Dialog title="Nueva mesa" onClose={() => setCreating(false)}>
          <form className="grid gap-4" onSubmit={async (e) => { e.preventDefault(); await onCreate(name); setName(''); setCreating(false); }}>
            <Field label="Nombre" placeholder="Ej. Mesa 5" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required autoFocus />
            <Btn kind="accent" className="py-3">Crear mesa</Btn>
          </form>
        </Dialog>
      )}
      {open && (
        <TableDetails
          t={open}
          onClose={() => setOpenId(null)}
          onPatch={(d, ok) => onPatch(open.id, d, ok)}
          onRotate={() => onRotate(open)}
        />
      )}
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState<Tab>('tables');
  const [biz, setBiz] = useState<any>(null);
  const [tables, setTables] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [dj, setDj] = useState({ name: '', email: '', password: '' });
  const { toast, node } = useToast();
  const run = useAction(toast);

  const load = useCallback(async () => {
    const [b, t, s, h] = await Promise.all([api('GET', '/admin/business'), api('GET', '/admin/tables'), api('GET', '/admin/staff'), api('GET', '/admin/history')]);
    setBiz(b); setTables(t); setStaff(s); setHistory(h);
  }, []);
  useEffect(() => { load().catch((e) => toast(e.message, true)); }, [load]);

  if (!biz) return <div className="grid min-h-screen place-items-center bg-[#060b14] text-slate-500">Cargando...</div>;
  const reload = (fn: () => Promise<unknown>, ok?: string) => run(async () => { await fn(); if (ok) toast(ok); await load(); });
  const [title, subtitle] = HERO[tab];

  return (
    <Shell
      nav={NAV}
      active={tab}
      onNav={(id) => setTab(id as Tab)}
      eyebrow="Administración"
      title={title}
      subtitle={subtitle}
      org={biz.name}
      orgStatus={biz.status === 'ACTIVE' ? 'Activo' : 'Suspendido'}
      links={[['/dj', 'Panel DJ', 'dj'], ['/tv', 'Pantalla TV', 'tv']]}
    >
      {tab === 'stats' && <StatsPanel />}

      {tab === 'tables' && (
        <TablesView
          tables={tables}
          onCreate={(name) => reload(() => api('POST', '/admin/tables', { name }), 'Mesa creada')}
          onPatch={(id, d, ok) => reload(() => api('PATCH', `/admin/tables/${id}`, d), ok)}
          onRotate={(t) => confirm(`El QR impreso de ${t.name} dejará de funcionar. ¿Generar uno nuevo?`) && reload(() => api('POST', `/admin/tables/${t.id}/rotate-qr`), 'QR regenerado')}
        />
      )}

      {tab === 'settings' && <Settings biz={biz} onSave={(d) => reload(() => api('PATCH', '/admin/business', d), 'Configuración guardada')} />}

      {tab === 'staff' && (
        <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
          <Card title="Crear cuenta de DJ">
            <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); reload(async () => { await api('POST', '/admin/staff', dj); setDj({ name: '', email: '', password: '' }); }, 'DJ creado'); }}>
              <Field label="Nombre" value={dj.name} onChange={(e) => setDj({ ...dj, name: e.target.value })} required />
              <Field label="Correo" type="email" value={dj.email} onChange={(e) => setDj({ ...dj, email: e.target.value })} required />
              <Field label="Contraseña" type="password" minLength={8} hint="Mínimo 8 caracteres" value={dj.password} onChange={(e) => setDj({ ...dj, password: e.target.value })} required />
              <Btn kind="accent">Crear DJ</Btn>
            </form>
          </Card>
          <Card title="Equipo" right={<Badge>{staff.length}</Badge>}>
            <div className="divide-y divide-white/5">
              {staff.map((u) => (
                <div key={u.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{u.name}</span>
                      <Badge tone={u.role === 'ADMIN' ? 'teal' : 'slate'}>{u.role === 'ADMIN' ? 'Admin' : 'DJ'}</Badge>
                      {!u.active && <Badge tone="red">Inactivo</Badge>}
                    </div>
                    <div className="truncate text-xs text-slate-500">{u.email}</div>
                  </div>
                  {u.role === 'DJ' && <Btn onClick={() => reload(() => api('PATCH', `/admin/staff/${u.id}/active`, { active: !u.active }))}>{u.active ? 'Desactivar' : 'Activar'}</Btn>}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'history' && (
        <Card title="Últimas 200 solicitudes">
          {history.length === 0 ? (
            <Empty>Todavía no hay solicitudes.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="text-left text-xs uppercase text-slate-500">
                  <tr><th className="pb-2 font-medium">Fecha</th><th className="pb-2 font-medium">Canción</th><th className="pb-2 font-medium">Mesa</th><th className="pb-2 text-right font-medium">Estado</th></tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {history.map((r) => {
                    const [tone, label] = STATUS[r.status] ?? ['slate', r.status];
                    return (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap py-2.5 pr-4 text-slate-500">{new Date(r.requestedAt).toLocaleString()}</td>
                        <td className="max-w-0 truncate py-2.5 pr-4">{r.title}</td>
                        <td className="whitespace-nowrap py-2.5 pr-4 text-slate-400">{r.table.name}</td>
                        <td className="py-2.5 text-right"><Badge tone={tone}>{label}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {node}
    </Shell>
  );
}

function Settings({ biz, onSave }: { biz: any; onSave: (d: any) => void }) {
  const [f, setF] = useState({ name: biz.name, logoUrl: biz.logoUrl ?? '', primaryColor: biz.primaryColor, maxPendingPerTable: biz.maxPendingPerTable, autoApprove: biz.autoApprove, searchMode: biz.searchMode as 'KARAOKE' | 'ANY' });
  return (
    <form
      className="grid gap-6 lg:grid-cols-2"
      onSubmit={(e) => { e.preventDefault(); onSave({ ...f, logoUrl: f.logoUrl || undefined, maxPendingPerTable: Number(f.maxPendingPerTable) }); }}
    >
      <Card title="Identidad del bar">
        <div className="grid gap-4">
          <Field label="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          <Field label="URL del logo (opcional)" placeholder="https://..." value={f.logoUrl} onChange={(e) => setF({ ...f, logoUrl: e.target.value })} />
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-300">Color principal</span>
            <div className="flex items-center gap-3">
              <input type="color" className="h-11 w-16 cursor-pointer rounded-lg border border-white/10 bg-transparent" value={f.primaryColor} onChange={(e) => setF({ ...f, primaryColor: e.target.value })} />
              <span className="text-xs text-slate-500">{f.primaryColor} · se usa en la pantalla de los clientes</span>
            </div>
          </label>
        </div>
      </Card>
      <Card title="Reglas de solicitudes">
        <div className="grid gap-4">
          <Field label="Canciones en espera por mesa" type="number" min={1} max={20} hint="Cuántas puede tener una mesa a la vez" value={f.maxPendingPerTable} onChange={(e) => setF({ ...f, maxPendingPerTable: Number(e.target.value) })} />
          <div className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-300">¿Qué pueden buscar los clientes?</span>
            <div className="grid grid-cols-2 gap-2">
              {([['KARAOKE', '🎤 Solo karaoke', 'Busca versiones karaoke'], ['ANY', '🎵 Cualquier música', 'Cualquier video de música']] as const).map(([k, title, hint]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setF({ ...f, searchMode: k })}
                  className="rounded-xl border p-3 text-left transition"
                  style={f.searchMode === k ? { borderColor: ACCENT, background: ACCENT + '1a' } : { borderColor: 'rgba(255,255,255,.1)' }}
                >
                  <span className="block font-semibold">{title}</span>
                  <span className="block text-xs text-slate-500">{hint}</span>
                </button>
              ))}
            </div>
          </div>
          <Toggle
            checked={!f.autoApprove}
            onChange={(v) => setF({ ...f, autoApprove: !v })}
            label="El DJ debe aprobar cada solicitud"
            hint="Si lo desactivas, las canciones pasan directo a la cola y suenan sin revisión."
          />
        </div>
      </Card>
      <div className="lg:col-span-2"><Btn kind="accent" className="px-8 py-3">Guardar cambios</Btn></div>
    </form>
  );
}
