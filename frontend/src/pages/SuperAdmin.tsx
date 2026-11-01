import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAction, useToast } from '../components/ui';
import { Badge, Btn, Card, Empty, Field, Shell } from '../components/kit';

const EMPTY = { name: '', adminName: '', adminEmail: '', adminPassword: '' };

const Stat = ({ label, value }: { label: string; value: number | string }) => (
  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
    <div className="text-3xl font-extrabold">{value}</div>
    <div className="mt-1 text-xs uppercase tracking-wider text-slate-400">{label}</div>
  </div>
);

export default function SuperAdmin() {
  const [list, setList] = useState<any[] | null>(null);
  const [f, setF] = useState(EMPTY);
  const { toast, node } = useToast();
  const run = useAction(toast);

  const load = useCallback(async () => setList(await api('GET', '/super/businesses')), []);
  useEffect(() => { load().catch((e) => toast(e.message, true)); }, [load]);

  const active = list?.filter((b) => b.status === 'ACTIVE').length ?? 0;
  const sum = (k: 'tables' | 'users' | 'requests') => list?.reduce((n, b) => n + b._count[k], 0) ?? 0;

  return (
    <Shell title="Super administrador" subtitle="Gestión de establecimientos">
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Bares activos" value={`${active}/${list?.length ?? 0}`} />
        <Stat label="Mesas" value={sum('tables')} />
        <Stat label="Usuarios" value={sum('users')} />
        <Stat label="Solicitudes" value={sum('requests')} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <Card title="Nuevo establecimiento">
          <form
            className="grid gap-4"
            onSubmit={(e) => { e.preventDefault(); run(async () => { await api('POST', '/super/businesses', f); setF(EMPTY); toast('Establecimiento creado'); await load(); }); }}
          >
            <Field label="Nombre del bar" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
            <div className="border-t border-white/10 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Cuenta del administrador</div>
            <Field label="Nombre" value={f.adminName} onChange={(e) => setF({ ...f, adminName: e.target.value })} required />
            <Field label="Correo" type="email" value={f.adminEmail} onChange={(e) => setF({ ...f, adminEmail: e.target.value })} required />
            <Field label="Contraseña" type="password" minLength={8} hint="Mínimo 8 caracteres" value={f.adminPassword} onChange={(e) => setF({ ...f, adminPassword: e.target.value })} required />
            <Btn kind="accent">Crear establecimiento</Btn>
          </form>
        </Card>

        <Card title="Establecimientos" right={<Badge>{list?.length ?? 0}</Badge>}>
          {!list ? (
            <Empty>Cargando...</Empty>
          ) : list.length === 0 ? (
            <Empty>Aún no hay establecimientos. Crea el primero.</Empty>
          ) : (
            <div className="divide-y divide-white/5">
              {list.map((b) => (
                <div key={b.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1 basis-48">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold">{b.name}</span>
                      <Badge tone={b.status === 'ACTIVE' ? 'green' : 'red'}>{b.status === 'ACTIVE' ? 'Activo' : 'Suspendido'}</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {b._count.tables} mesas · {b._count.users} usuarios · {b._count.requests} solicitudes · creado {new Date(b.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <Btn
                    kind={b.status === 'ACTIVE' ? 'danger' : 'ok'}
                    onClick={() =>
                      (b.status !== 'ACTIVE' || confirm(`¿Suspender ${b.name}? Su equipo perderá el acceso y los QR dejarán de funcionar.`)) &&
                      run(async () => { await api('PATCH', `/super/businesses/${b.id}/status`, { active: b.status !== 'ACTIVE' }); await load(); })
                    }
                  >
                    {b.status === 'ACTIVE' ? 'Suspender' : 'Activar'}
                  </Btn>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      {node}
    </Shell>
  );
}
