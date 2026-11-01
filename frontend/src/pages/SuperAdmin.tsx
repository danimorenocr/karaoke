import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { TopBar, useAction, useToast } from '../components/ui';

export default function SuperAdmin() {
  const [list, setList] = useState<any[]>([]);
  const [f, setF] = useState({ name: '', adminName: '', adminEmail: '', adminPassword: '' });
  const { toast, node } = useToast();
  const run = useAction(toast);

  const load = useCallback(async () => setList(await api('GET', '/super/businesses')), []);
  useEffect(() => { load().catch((e) => toast(e.message, true)); }, [load]);

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <TopBar title="Super administrador" />
      <div className="space-y-4 p-4">
        <form className="card grid gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await api('POST', '/super/businesses', f); setF({ name: '', adminName: '', adminEmail: '', adminPassword: '' }); toast('Establecimiento creado'); await load(); }); }}>
          <div className="font-semibold">Nuevo establecimiento</div>
          <input className="input" placeholder="Nombre del bar" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          <input className="input" placeholder="Nombre del administrador" value={f.adminName} onChange={(e) => setF({ ...f, adminName: e.target.value })} required />
          <input className="input" type="email" placeholder="Correo del administrador" value={f.adminEmail} onChange={(e) => setF({ ...f, adminEmail: e.target.value })} required />
          <input className="input" type="password" placeholder="Contrasena (min. 8)" minLength={8} value={f.adminPassword} onChange={(e) => setF({ ...f, adminPassword: e.target.value })} required />
          <button className="btn btn-primary">Crear</button>
        </form>

        {list.map((b) => (
          <div key={b.id} className="card flex items-center gap-3">
            <div className="flex-1">
              <div className="font-semibold">{b.name} {b.status !== 'ACTIVE' && <span className="text-xs text-red-400">SUSPENDIDO</span>}</div>
              <div className="text-xs text-zinc-400">{b._count.tables} mesas · {b._count.users} usuarios · {b._count.requests} solicitudes</div>
            </div>
            <button className="btn" onClick={() => run(async () => { await api('PATCH', `/super/businesses/${b.id}/status`, { active: b.status !== 'ACTIVE' }); await load(); })}>
              {b.status === 'ACTIVE' ? 'Suspender' : 'Activar'}
            </button>
          </div>
        ))}
      </div>
      {node}
    </div>
  );
}
