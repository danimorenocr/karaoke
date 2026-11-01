import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, auth, connectSocket, fmtDuration } from '../lib/api';
import { Thumb, useAction, useToast } from '../components/ui';
import DjSearch from '../components/DjSearch';

const ACCENT = '#22d3c5';
const ON_ACCENT = '#04202a';
const STATUS_LABEL: Record<string, [string, string]> = {
  COMPLETED: ['Completada', 'text-slate-400'],
  REJECTED: ['Rechazada', 'text-red-400'],
  CANCELLED: ['Saltada / cancelada', 'text-slate-400'],
  FAILED: ['Falló', 'text-red-400'],
};

const Card = ({ title, count, children, className = '' }: { title: string; count?: number; children: ReactNode; className?: string }) => (
  <section className={`rounded-2xl border border-white/10 bg-white/[0.04] ${className}`}>
    <h2 className="flex items-center justify-between border-b border-white/10 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
      {title}
      {count !== undefined && <span className="rounded-full bg-white/10 px-2 py-0.5 text-slate-200">{count}</span>}
    </h2>
    <div className="p-3">{children}</div>
  </section>
);

const Chip = ({ ok, children }: { ok: boolean; children: ReactNode }) => (
  <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${ok ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/5 text-slate-400'}`}>
    <span className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-slate-500'}`} />
    {children}
  </span>
);

const Btn = ({ kind = 'ghost', className = '', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'ghost' | 'accent' | 'ok' | 'danger' }) => {
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
};

/** Pitido corto de aviso (puede no sonar si el navegador aun no tuvo interaccion con la pagina). */
function beep() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.25].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.15, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.2);
    });
    setTimeout(() => ctx.close(), 800);
  } catch { /* sin audio */ }
}

export default function Dj() {
  const [s, setS] = useState<any>(null);
  const [online, setOnline] = useState(true);
  const [tvConnected, setTvConnected] = useState(false);
  const [tvDown, setTvDown] = useState(false); // la TV lleva varios segundos desconectada
  const { toast, node } = useToast();
  const run = useAction(toast);
  const user = auth.user();

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

  // Alerta si la TV se desconecta con la sesion en marcha (se espera 8 s para ignorar parpadeos de red)
  const tvStarted = !!s?.session?.tvStarted;
  useEffect(() => {
    if (!(tvStarted && !tvConnected)) { setTvDown(false); return; }
    const t = setTimeout(() => setTvDown(true), 8000);
    return () => clearTimeout(t);
  }, [tvStarted, tvConnected]);
  useEffect(() => {
    if (!tvDown) { document.title = 'Karaoke'; return; }
    beep();
    let on = true;
    const t = setInterval(() => { document.title = on ? '⚠️ TV DESCONECTADA' : 'Karaoke'; on = !on; }, 1000);
    return () => { clearInterval(t); document.title = 'Karaoke'; };
  }, [tvDown]);

  const togglePause = () => {
    const value = !s.session.paused;
    setS((p: any) => ({ ...p, session: { ...p.session, paused: value } }));
    act('PATCH', '/dj/playback/paused', { value });
  };

  if (!s) return <div className="grid min-h-screen place-items-center bg-[#050d18] text-slate-500">Cargando...</div>;
  const session = s.session;

  return (
    <div className="min-h-screen bg-[#050d18] text-slate-100" style={{ backgroundImage: `radial-gradient(70% 40% at 20% 0%, ${ACCENT}1a, transparent 70%)` }}>
      {/* Barra superior */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#050d18]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
          <div>
            <div className="text-lg font-bold leading-tight">{s.business.name}</div>
            <div className="text-xs text-slate-400">Panel DJ · {user?.name}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip ok={online}>{online ? 'Conectado' : 'Sin conexión'}</Chip>
            <Chip ok={tvConnected}>TV {tvConnected ? 'conectada' : 'desconectada'}</Chip>
            {session && <Chip ok={session.requestsOpen}>{session.requestsOpen ? 'Solicitudes abiertas' : 'Solicitudes bloqueadas'}</Chip>}
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">
              {s.business.autoApprove ? 'Aprobación automática' : 'Aprobación manual'}
            </span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {session ? (
              <>
                <Btn onClick={() => act('PATCH', '/dj/session/requests-open', { value: !session.requestsOpen })}>
                  {session.requestsOpen ? 'Bloquear solicitudes' : 'Abrir solicitudes'}
                </Btn>
                <Btn kind="danger" onClick={() => confirm('Finalizar la sesión cancela todo lo que sigue en cola. ¿Continuar?') && act('POST', '/dj/session/stop')}>
                  Finalizar sesión
                </Btn>
              </>
            ) : (
              <Btn kind="accent" onClick={() => act('POST', '/dj/session/start')}>Iniciar sesión de karaoke</Btn>
            )}
            <Link to="/tv" target="_blank" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15">Abrir TV ↗</Link>
            {user?.role === 'ADMIN' && <Link to="/admin" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15">Admin</Link>}
            <Btn onClick={() => { auth.clear(); location.href = '/login'; }}>Salir</Btn>
          </div>
        </div>
      </header>

      {tvDown && (
        <div className="border-b border-red-400/30 bg-red-500/20 px-6 py-3 text-center text-sm font-semibold text-red-100" role="alert">
          ⚠️ La pantalla de TV se desconectó. Revisa el internet o el navegador de la TV; al volver se reconecta sola
          (si recargaron la página, hay que pulsar “Iniciar karaoke” otra vez).
        </div>
      )}
      {!tvDown && session?.tvStarted && tvConnected && !s.tvArmed && (
        <div className="border-b border-amber-400/30 bg-amber-500/15 px-6 py-2 text-center text-sm text-amber-100">
          La TV está abierta pero no está reproduciendo: falta pulsar “Iniciar karaoke” en esa pantalla.
        </div>
      )}
      {!session ? (
        <div className="mx-auto mt-24 max-w-md px-6 text-center">
          <div className="mb-3 text-5xl">🎤</div>
          <h1 className="text-2xl font-bold">La sesión está cerrada</h1>
          <p className="mt-2 text-slate-400">Inicia la sesión para que los clientes puedan pedir canciones. Después abre la pantalla TV del bar y pulsa “Iniciar karaoke”.</p>
          <Btn kind="accent" className="mt-6 px-6 py-3 text-base" onClick={() => act('POST', '/dj/session/start')}>Iniciar sesión de karaoke</Btn>
        </div>
      ) : (
        <main className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {/* Columna izquierda: ahora + pendientes */}
          <div className="space-y-6">
            <section className="overflow-hidden rounded-2xl border border-white/10" style={{ background: `linear-gradient(135deg, ${ACCENT}22, rgba(255,255,255,.03))` }}>
              <div className="flex items-center justify-between px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: ACCENT }}>
                <span>Sonando ahora</span>
                {session.paused && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-amber-300">En pausa</span>}
              </div>
              {s.current ? (
                <div className="flex flex-wrap items-center gap-5 px-5 pb-5">
                  <Thumb src={s.current.thumbnail} className="h-24 w-40 !rounded-xl" />
                  <div className="min-w-0 flex-1 basis-60">
                    <div className="line-clamp-2 text-xl font-bold leading-tight">{s.current.title}</div>
                    <div className="mt-1 text-sm text-slate-300">
                      {s.current.tableName} {s.current.durationSec ? `· ${fmtDuration(s.current.durationSec)}` : ''}
                    </div>
                    {s.queue[0] && <div className="mt-2 truncate text-xs text-slate-400">Sigue: {s.queue[0].title} · {s.queue[0].tableName}</div>}
                  </div>
                  <div className="flex gap-2">
                    <Btn onClick={togglePause}>{session.paused ? '▶ Reanudar' : '⏸ Pausar'}</Btn>
                    <Btn onClick={() => act('POST', '/dj/playback/reload')}>↻ Recargar</Btn>
                    <Btn kind="danger" onClick={() => act('POST', '/dj/playback/skip')}>⏭ Saltar</Btn>
                  </div>
                </div>
              ) : (
                <p className="px-5 pb-6 text-sm text-slate-300">
                  {session.tvStarted
                    ? 'No suena nada. Cuando haya canciones aprobadas empezarán solas.'
                    : 'La TV aún no ha pulsado “Iniciar karaoke”. Abre la pantalla TV del bar y púlsalo para empezar.'}
                </p>
              )}
            </section>

            <DjSearch tables={s.tables} mode={s.business.searchMode} onAdded={load} toast={toast} />

            <Card title="Por aprobar" count={s.pending.length}>
              {s.pending.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500">Sin solicitudes pendientes.</p>
              ) : (
                <div className="space-y-2">
                  {s.pending.map((r: any) => (
                    <div key={r.id} className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                      <Thumb src={r.thumbnail} className="h-14 w-24 !rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{r.title}</div>
                        <div className="text-xs text-slate-400">
                          <span className="rounded bg-white/10 px-1.5 py-0.5 font-medium text-slate-200">{r.tableName}</span>
                          {r.durationSec ? <span className="ml-2">{fmtDuration(r.durationSec)}</span> : null}
                        </div>
                      </div>
                      <Btn kind="ok" onClick={() => act('PATCH', `/dj/requests/${r.id}/approve`)}>Aprobar</Btn>
                      <Btn kind="danger" onClick={() => act('PATCH', `/dj/requests/${r.id}/reject`, {})}>Rechazar</Btn>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Columna derecha: cola + recientes */}
          <div className="space-y-6">
            <Card title="Cola de reproducción" count={s.queue.length}>
              {s.queue.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500">La cola está vacía.</p>
              ) : (
                <div className="space-y-2">
                  {s.queue.map((r: any, i: number) => (
                    <div key={r.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
                      <div className="w-6 text-center text-sm font-bold text-slate-500">{i + 1}</div>
                      <Thumb src={r.thumbnail} className="h-11 w-[4.5rem] !rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{r.title}</div>
                        <div className="text-xs text-slate-400">{r.tableName}</div>
                      </div>
                      <div className="flex gap-1">
                        <button title="Subir" disabled={i === 0} onClick={() => move(i, -1)} className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-25">↑</button>
                        <button title="Bajar" disabled={i === s.queue.length - 1} onClick={() => move(i, 1)} className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-25">↓</button>
                        <button title="Quitar de la cola" onClick={() => act('PATCH', `/dj/requests/${r.id}/reject`, {})} className="grid h-8 w-8 place-items-center rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Mesas" count={s.tables.filter((t: any) => t.waiting > 0).length}>
              <div className="space-y-1.5">
                {s.tables.map((t: any) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{t.name}</div>
                      <div className="text-xs text-slate-500">{t.waiting > 0 ? `${t.waiting} canción(es) en espera` : 'Sin canciones en espera'}</div>
                    </div>
                    <button
                      onClick={() => confirm(`¿Desvincular ${t.name}? Se quitarán sus ${t.waiting} canciones de la cola y su historial desaparecerá en el celular del cliente (la que esté sonando no se corta).`) && run(async () => {
                        const r = await api('POST', `/dj/tables/${t.id}/unlink`);
                        toast(`${t.name} desvinculada: ${r.removed} canción(es) quitada(s)`);
                        await load();
                      })}
                      className="rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/25"
                    >
                      Desvincular
                    </button>
                  </div>
                ))}
                {s.tables.length === 0 && <p className="p-4 text-center text-sm text-slate-500">No hay mesas creadas.</p>}
              </div>
            </Card>

            <Card title="Recientes" count={s.history.length}>
              {s.history.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500">Aún no hay historial en esta sesión.</p>
              ) : (
                <div className="divide-y divide-white/5">
                  {s.history.map((r: any) => {
                    const [label, color] = STATUS_LABEL[r.status] ?? [r.status, 'text-slate-400'];
                    return (
                      <div key={r.id} className="flex items-center gap-3 px-2 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{r.title}</div>
                          <div className="text-xs text-slate-500">{r.tableName} · <span className={color}>{label}</span></div>
                        </div>
                        {['FAILED', 'CANCELLED', 'COMPLETED'].includes(r.status) && (
                          <button onClick={() => act('PATCH', `/dj/requests/${r.id}/retry`)} className="rounded-lg bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/15">Reintentar</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </main>
      )}
      {node}
    </div>
  );
}
