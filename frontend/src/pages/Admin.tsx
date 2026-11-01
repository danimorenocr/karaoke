import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../lib/api';
import { useAction, useToast } from '../components/ui';
import StatsPanel from '../components/StatsPanel';
import { ACCENT, Badge, Btn, Card, Empty, Field, Shell, Tabs, Toggle } from '../components/kit';

const tableUrl = (token: string) => `${location.origin}/m/${token}`;

const STATUS: Record<string, ['slate' | 'green' | 'red' | 'amber' | 'teal', string]> = {
  PENDING: ['amber', 'Pendiente'],
  APPROVED: ['teal', 'En cola'],
  PLAYING: ['green', 'Sonando'],
  COMPLETED: ['slate', 'Completada'],
  REJECTED: ['red', 'Rechazada'],
  CANCELLED: ['slate', 'Cancelada'],
  FAILED: ['red', 'Falló'],
};

function Qr({ token }: { token: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(tableUrl(token), { width: 512, margin: 2 }).then(setSrc); }, [token]);
  return src ? <img src={src} className="h-36 w-36 rounded-xl bg-white p-1" /> : <div className="h-36 w-36 rounded-xl bg-white/10" />;
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

type Tab = 'stats' | 'tables' | 'settings' | 'staff' | 'history';

export default function Admin() {
  const [tab, setTab] = useState<Tab>('stats');
  const [biz, setBiz] = useState<any>(null);
  const [tables, setTables] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [tableName, setTableName] = useState('');
  const [dj, setDj] = useState({ name: '', email: '', password: '' });
  const { toast, node } = useToast();
  const run = useAction(toast);

  const load = useCallback(async () => {
    const [b, t, s, h] = await Promise.all([api('GET', '/admin/business'), api('GET', '/admin/tables'), api('GET', '/admin/staff'), api('GET', '/admin/history')]);
    setBiz(b); setTables(t); setStaff(s); setHistory(h);
  }, []);
  useEffect(() => { load().catch((e) => toast(e.message, true)); }, [load]);

  if (!biz) return <div className="grid min-h-screen place-items-center bg-[#050d18] text-slate-500">Cargando...</div>;
  const reload = (fn: () => Promise<unknown>, ok?: string) => run(async () => { await fn(); if (ok) toast(ok); await load(); });

  return (
    <Shell title={`Administración · ${biz.name}`} subtitle="Panel del dueño" links={[['/dj', 'Panel DJ'], ['/tv', 'Pantalla TV']]}>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[['stats', '📊 Estadísticas'], ['tables', `Mesas y QR (${tables.length})`], ['settings', 'Configuración'], ['staff', 'DJs'], ['history', 'Historial']]}
      />

      {tab === 'stats' && <StatsPanel />}

      {tab === 'tables' && (
        <div className="space-y-6">
          <Card title="Nueva mesa">
            <form className="flex flex-wrap gap-3" onSubmit={(e) => { e.preventDefault(); reload(async () => { await api('POST', '/admin/tables', { name: tableName }); setTableName(''); }, 'Mesa creada'); }}>
              <div className="min-w-60 flex-1">
                <Field label="Nombre" placeholder="Ej. Mesa 5" value={tableName} onChange={(e) => setTableName(e.target.value)} required />
              </div>
              <Btn kind="accent" className="self-end">Crear mesa</Btn>
            </form>
          </Card>

          {tables.length === 0 ? (
            <Card><Empty>Aún no hay mesas. Crea la primera para generar su código QR.</Empty></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {tables.map((t) => (
                <Card key={t.id} className={t.active ? '' : 'opacity-60'}>
                  <div className="flex gap-5">
                    <Qr token={t.qrToken} />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-lg font-bold">{t.name}</span>
                        {!t.active && <Badge tone="red">Desactivada</Badge>}
                      </div>
                      <a className="truncate text-xs text-teal-300 hover:underline" href={tableUrl(t.qrToken)} target="_blank">{tableUrl(t.qrToken)}</a>
                      <div className="mt-auto flex flex-wrap gap-2">
                        <Btn className="!px-3 !py-1.5 text-xs" onClick={() => downloadQr(t.name, t.qrToken, 'png')}>PNG</Btn>
                        <Btn className="!px-3 !py-1.5 text-xs" onClick={() => downloadQr(t.name, t.qrToken, 'svg')}>SVG</Btn>
                        <Btn className="!px-3 !py-1.5 text-xs" onClick={() => reload(() => api('PATCH', `/admin/tables/${t.id}`, { active: !t.active }))}>{t.active ? 'Desactivar' : 'Activar'}</Btn>
                      </div>
                    </div>
                  </div>
                  <Btn
                    kind="danger"
                    className="mt-4 w-full !py-1.5 text-xs"
                    onClick={() => confirm('El QR impreso dejará de funcionar. ¿Generar uno nuevo?') && reload(() => api('POST', `/admin/tables/${t.id}/rotate-qr`), 'QR regenerado')}
                  >
                    Revocar y regenerar QR
                  </Btn>
                </Card>
              ))}
            </div>
          )}
        </div>
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
