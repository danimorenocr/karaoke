import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../lib/api';
import { TopBar, useAction, useToast } from '../components/ui';

const tableUrl = (token: string) => `${location.origin}/m/${token}`;

function Qr({ token }: { token: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(tableUrl(token), { width: 512, margin: 2 }).then(setSrc); }, [token]);
  return src ? <img src={src} className="h-28 w-28 rounded bg-white" /> : <div className="h-28 w-28" />;
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

export default function Admin() {
  const [tab, setTab] = useState<'tables' | 'settings' | 'staff' | 'history'>('tables');
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

  if (!biz) return <div className="p-8 text-zinc-500">Cargando...</div>;
  const reload = (fn: () => Promise<unknown>, ok?: string) => run(async () => { await fn(); if (ok) toast(ok); await load(); });

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <TopBar title="Administrador" />
      <nav className="flex gap-1 p-4">
        {([['tables', 'Mesas y QR'], ['settings', 'Configuracion'], ['staff', 'DJs'], ['history', 'Historial']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`btn ${tab === k ? 'btn-primary' : ''}`}>{l}</button>
        ))}
      </nav>

      <div className="space-y-3 px-4">
        {tab === 'tables' && (
          <>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); reload(async () => { await api('POST', '/admin/tables', { name: tableName }); setTableName(''); }); }}>
              <input className="input" placeholder="Nombre de la mesa (ej. Mesa 5)" value={tableName} onChange={(e) => setTableName(e.target.value)} required />
              <button className="btn btn-primary shrink-0">Crear mesa</button>
            </form>
            {tables.map((t) => (
              <div key={t.id} className={`card flex gap-4 ${t.active ? '' : 'opacity-50'}`}>
                <Qr token={t.qrToken} />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="font-semibold">{t.name} {!t.active && <span className="text-xs text-red-400">(desactivada)</span>}</div>
                  <a className="block truncate text-xs text-sky-400" href={tableUrl(t.qrToken)} target="_blank">{tableUrl(t.qrToken)}</a>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn !px-2 !py-1 text-xs" onClick={() => downloadQr(t.name, t.qrToken, 'png')}>PNG</button>
                    <button className="btn !px-2 !py-1 text-xs" onClick={() => downloadQr(t.name, t.qrToken, 'svg')}>SVG</button>
                    <button className="btn !px-2 !py-1 text-xs" onClick={() => reload(() => api('PATCH', `/admin/tables/${t.id}`, { active: !t.active }))}>{t.active ? 'Desactivar' : 'Activar'}</button>
                    <button className="btn btn-danger !px-2 !py-1 text-xs" onClick={() => confirm('El QR impreso dejara de funcionar. Generar uno nuevo?') && reload(() => api('POST', `/admin/tables/${t.id}/rotate-qr`), 'QR regenerado')}>Revocar y regenerar QR</button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'settings' && <Settings biz={biz} onSave={(d) => reload(() => api('PATCH', '/admin/business', d), 'Guardado')} />}

        {tab === 'staff' && (
          <>
            <form className="card grid gap-2" onSubmit={(e) => { e.preventDefault(); reload(async () => { await api('POST', '/admin/staff', dj); setDj({ name: '', email: '', password: '' }); }, 'DJ creado'); }}>
              <div className="text-sm font-semibold">Crear cuenta de DJ</div>
              <input className="input" placeholder="Nombre" value={dj.name} onChange={(e) => setDj({ ...dj, name: e.target.value })} required />
              <input className="input" type="email" placeholder="Correo" value={dj.email} onChange={(e) => setDj({ ...dj, email: e.target.value })} required />
              <input className="input" type="password" placeholder="Contrasena (min. 8)" minLength={8} value={dj.password} onChange={(e) => setDj({ ...dj, password: e.target.value })} required />
              <button className="btn btn-primary">Crear</button>
            </form>
            {staff.map((u) => (
              <div key={u.id} className="card flex items-center gap-3">
                <div className="flex-1">
                  <div className="font-medium">{u.name} <span className="text-xs text-zinc-500">{u.role}</span></div>
                  <div className="text-xs text-zinc-400">{u.email}</div>
                </div>
                {u.role === 'DJ' && <button className="btn" onClick={() => reload(() => api('PATCH', `/admin/staff/${u.id}/active`, { active: !u.active }))}>{u.active ? 'Desactivar' : 'Activar'}</button>}
              </div>
            ))}
          </>
        )}

        {tab === 'history' && (
          <div className="space-y-1 text-sm">
            {history.map((r) => (
              <div key={r.id} className="flex gap-3 border-b border-zinc-900 py-1">
                <span className="w-32 shrink-0 text-zinc-500">{new Date(r.requestedAt).toLocaleString()}</span>
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                <span className="text-zinc-400">{r.table.name}</span>
                <span className="w-24 text-right text-zinc-500">{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {node}
    </div>
  );
}

function Settings({ biz, onSave }: { biz: any; onSave: (d: any) => void }) {
  const [f, setF] = useState({ name: biz.name, logoUrl: biz.logoUrl ?? '', primaryColor: biz.primaryColor, maxPendingPerTable: biz.maxPendingPerTable, autoApprove: biz.autoApprove });
  return (
    <form className="card grid gap-3" onSubmit={(e) => { e.preventDefault(); onSave({ ...f, logoUrl: f.logoUrl || undefined, maxPendingPerTable: Number(f.maxPendingPerTable) }); }}>
      <label className="grid gap-1 text-sm">Nombre<input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label className="grid gap-1 text-sm">URL del logo (opcional)<input className="input" value={f.logoUrl} onChange={(e) => setF({ ...f, logoUrl: e.target.value })} /></label>
      <label className="grid gap-1 text-sm">Color principal<input type="color" className="h-10 w-20" value={f.primaryColor} onChange={(e) => setF({ ...f, primaryColor: e.target.value })} /></label>
      <label className="grid gap-1 text-sm">Maximo de canciones en espera por mesa<input className="input" type="number" min={1} max={20} value={f.maxPendingPerTable} onChange={(e) => setF({ ...f, maxPendingPerTable: Number(e.target.value) })} /></label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={!f.autoApprove} onChange={(e) => setF({ ...f, autoApprove: !e.target.checked })} />
        <span>El DJ debe aprobar cada solicitud<br /><span className="text-xs text-zinc-500">Si lo desmarcas, las canciones pasan directo a la cola y se reproducen sin revision.</span></span>
      </label>
      <button className="btn btn-primary">Guardar</button>
    </form>
  );
}
