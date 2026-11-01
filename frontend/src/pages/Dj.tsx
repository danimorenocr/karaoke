import { useCallback, useEffect, useState } from 'react';
import { api, connectSocket, fmtDuration } from '../lib/api';
import { Thumb, TopBar, useAction, useToast } from '../components/ui';

export default function Dj() {
  const [s, setS] = useState<any>(null);
  const [online, setOnline] = useState(true);
  const [tvConnected, setTvConnected] = useState(false);
  const { toast, node } = useToast();
  const run = useAction(toast);

  const load = useCallback(async () => {
    try {
      const data = await api('GET', '/dj/queue');
      setS(data);
      setTvConnected(data.tvConnected);
    } catch (e: any) {
      toast(e.message, true);
    }
  }, []);

  useEffect(() => {
    load();
    const off = connectSocket({ role: 'dj' }, (name, payload) => {
      if (name === 'queue.updated' || name === 'connect') { setOnline(true); load(); }
      if (name === 'disconnect') setOnline(false);
      if (name === 'tv.status') setTvConnected(payload.connected);
    });
    const poll = setInterval(load, 20000);
    return () => { off(); clearInterval(poll); };
  }, [load]);

  const act = (method: string, path: string, body?: unknown) => run(async () => { await api(method, path, body); await load(); });

  const move = (i: number, dir: -1 | 1) => {
    const ids = s.queue.map((r: any) => r.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    act('PATCH', '/dj/queue/reorder', { ids });
  };

  if (!s) return <div className="p-8 text-zinc-500">Cargando...</div>;
  const session = s.session;

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <TopBar title="Panel DJ" />
      <div className="flex flex-wrap items-center gap-2 p-4 text-sm">
        <span className={`rounded-full px-3 py-1 ${online ? 'bg-emerald-900 text-emerald-200' : 'bg-red-900 text-red-200'}`}>{online ? 'Conectado' : 'Sin conexion'}</span>
        <span className={`rounded-full px-3 py-1 ${tvConnected ? 'bg-emerald-900 text-emerald-200' : 'bg-zinc-800 text-zinc-400'}`}>
          TV {tvConnected ? 'conectada' : 'desconectada'}
        </span>
        {session ? (
          <>
            <span className="rounded-full bg-zinc-800 px-3 py-1">Sesion activa</span>
            <button className="btn" onClick={() => act('PATCH', '/dj/session/requests-open', { value: !session.requestsOpen })}>
              {session.requestsOpen ? 'Bloquear solicitudes' : 'Abrir solicitudes'}
            </button>
            <button className="btn btn-danger ml-auto" onClick={() => confirm('Finalizar la sesion cancela todo lo que sigue en cola. Continuar?') && act('POST', '/dj/session/stop')}>
              Finalizar sesion
            </button>
          </>
        ) : (
          <button className="btn btn-primary ml-auto" onClick={() => act('POST', '/dj/session/start')}>Iniciar sesion de karaoke</button>
        )}
      </div>

      {!session ? (
        <p className="p-8 text-center text-zinc-500">Inicia la sesion para que los clientes puedan pedir canciones. Luego abre /tv en la pantalla del bar.</p>
      ) : (
        <div className="space-y-6 px-4">
          <section className="card">
            <h2 className="mb-2 text-xs font-semibold uppercase text-zinc-400">Sonando ahora</h2>
            {s.current ? (
              <div className="flex items-center gap-3">
                <Thumb src={s.current.thumbnail} className="h-14 w-24" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{s.current.title}</div>
                  <div className="text-xs text-zinc-400">{s.current.tableName} {fmtDuration(s.current.durationSec)}</div>
                </div>
                <div className="flex gap-2">
                  <button className="btn" onClick={() => { const value = !session.paused; setS((p: any) => ({ ...p, session: { ...p.session, paused: value } })); act('PATCH', '/dj/playback/paused', { value }); }}>{session.paused ? 'Reanudar' : 'Pausar'}</button>
                  <button className="btn" onClick={() => act('POST', '/dj/playback/reload')}>Recargar video</button>
                  <button className="btn btn-danger" onClick={() => act('POST', '/dj/playback/skip')}>Saltar</button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                {session.tvStarted ? 'Nada suena. Aprueba canciones y empezaran solas.' : 'La TV aun no ha pulsado "Iniciar karaoke" (abre /tv en la pantalla del bar).'}
              </p>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase text-zinc-400">Por aprobar ({s.pending.length})</h2>
            <div className="space-y-2">
              {s.pending.map((r: any) => (
                <div key={r.id} className="card flex items-center gap-3 !p-3">
                  <Thumb src={r.thumbnail} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.title}</div>
                    <div className="text-xs text-zinc-400">{r.tableName} {fmtDuration(r.durationSec)}</div>
                  </div>
                  <button className="btn btn-ok" onClick={() => act('PATCH', `/dj/requests/${r.id}/approve`)}>Aprobar</button>
                  <button className="btn btn-danger" onClick={() => act('PATCH', `/dj/requests/${r.id}/reject`, {})}>Rechazar</button>
                </div>
              ))}
              {s.pending.length === 0 && <p className="text-sm text-zinc-500">Sin solicitudes pendientes.</p>}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase text-zinc-400">Cola ({s.queue.length})</h2>
            <div className="space-y-2">
              {s.queue.map((r: any, i: number) => (
                <div key={r.id} className="card flex items-center gap-3 !p-3">
                  <div className="w-5 text-center text-zinc-500">{i + 1}</div>
                  <Thumb src={r.thumbnail} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.title}</div>
                    <div className="text-xs text-zinc-400">{r.tableName}</div>
                  </div>
                  <button className="btn !px-2" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button className="btn !px-2" disabled={i === s.queue.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button className="btn" onClick={() => act('PATCH', `/dj/requests/${r.id}/reject`, {})}>Quitar</button>
                </div>
              ))}
              {s.queue.length === 0 && <p className="text-sm text-zinc-500">La cola esta vacia.</p>}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase text-zinc-400">Recientes</h2>
            <div className="space-y-1">
              {s.history.map((r: any) => (
                <div key={r.id} className="flex items-center gap-3 text-sm text-zinc-400">
                  <span className="min-w-0 flex-1 truncate">{r.title} · {r.tableName}</span>
                  <span className={r.status === 'FAILED' ? 'text-red-400' : ''}>{r.status}</span>
                  {['FAILED', 'CANCELLED', 'COMPLETED'].includes(r.status) && (
                    <button className="btn !px-2 !py-1 text-xs" onClick={() => act('PATCH', `/dj/requests/${r.id}/retry`)}>Reintentar</button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      {node}
    </div>
  );
}
