import { PointerEvent as ReactPointerEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { api, auth, connectSocket, fmtDuration } from '../lib/api';
import { Thumb, useAction, useToast } from '../components/ui';
import DjSearch from '../components/DjSearch';
import SongProbe, { ProbeOutcome } from '../components/SongProbe';
import SongProgress from '../components/SongProgress';
import { ACCENT, Btn, Icon, NavItem, Shell } from '../components/kit';
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

type QGroup = { tableId: string | null; name: string; items: any[]; start: number };
/** La cola ya viene ordenada: se parte en bloques de canciones consecutivas de la misma mesa. */
const buildGroups = (queue: any[]): QGroup[] => {
  const groups: QGroup[] = [];
  queue.forEach((r, i) => {
    const last = groups[groups.length - 1];
    if (last && last.tableId === r.tableId) last.items.push(r);
    else groups.push({ tableId: r.tableId, name: r.tableName, items: [r], start: i });
  });
  return groups;
};

type Tab = 'live' | 'tables' | 'history';
const NAV: NavItem[] = [
  { id: 'live', label: 'En vivo', icon: 'dj' },
  { id: 'tables', label: 'Mesas', icon: 'qr' },
  { id: 'history', label: 'Recientes', icon: 'history' },
];
const HERO: Record<Tab, [string, string]> = {
  live: ['En vivo', 'Controla lo que suena, aprueba solicitudes y ordena la cola.'],
  tables: ['Mesas', 'Mira cuántas canciones espera cada mesa y desvincula las que ya se fueron.'],
  history: ['Recientes', 'Lo último que pasó en esta sesión. Puedes reintentar cualquier canción.'],
};

export default function Dj() {
  const [tab, setTab] = useState<Tab>('live');
  const [s, setS] = useState<any>(null);
  const [dlPct, setDlPct] = useState<Record<string, number>>({}); // avance en vivo de las descargas (requestId -> %)
  const [fetchedAt, setFetchedAt] = useState(0); // momento de la ultima recarga, para interpolar el progreso
  const [now, setNow] = useState(Date.now()); // reloj para la cuenta regresiva de cola vacia
  const [online, setOnline] = useState(true);
  const [tvConnected, setTvConnected] = useState(false);
  const [tvDown, setTvDown] = useState(false); // la TV lleva varios segundos desconectada
  const { toast, node } = useToast();
  const run = useAction(toast);
  const user = auth.user();

  // --- Reordenar la cola arrastrando (tactil y mouse) ---
  type DragData = { from: number; to: number; startY: number; scroll0: number; tops: number[]; heights: number[]; gap: number };
  const [drag, setDrag] = useState<{ id: string; from: number; to: number; offset: number; size: number } | null>(null);
  // Alternativas de YouTube para canciones marcadas "va a fallar", por solicitud
  const [alts, setAlts] = useState<Record<string, { loading?: boolean; items?: any[]; none?: boolean; reason?: string | null }>>({});
  const dragData = useRef<DragData | null>(null);
  const [gdrag, setGdrag] = useState<{ key: string; from: number; to: number; offset: number; size: number } | null>(null);
  const queueListRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api('GET', '/dj/queue');
      if (dragData.current) return; // no pisar la cola mientras se arrastra
      setS(data);
      setFetchedAt(Date.now());
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
      if (name === 'download.progress' && payload?.requestId) setDlPct((p) => ({ ...p, [payload.requestId]: payload.percent }));
    });
    const poll = setInterval(() => { if (!document.hidden) load(); }, 20000); // respaldo; con la pestana oculta no consulta
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { off(); clearInterval(poll); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  // Pantalla de carga: si la accion tarda mas de 0,3 s se bloquea la pantalla con un aviso (evita doble clic y la sensacion de que se trabo)
  const [working, setWorking] = useState<string | null>(null);
  const pendingN = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const workLabel = (method: string, path: string, body: any) =>
    path.includes('autodj') ? (body?.genres ? 'Buscando canciones de esos géneros…' : 'Cambiando el Auto-DJ…')
    : path.includes('approve') ? 'Aprobando la canción…'
    : path.includes('reject') ? 'Quitando la canción…'
    : path.includes('skip') ? 'Pasando a la siguiente…'
    : path.includes('reorder') ? 'Reordenando la cola…'
    : path.endsWith('/table') ? 'Cambiando la mesa…'
    : path.includes('swap') ? 'Cambiando la versión…'
    : 'Procesando…';
  const act = (method: string, path: string, body?: unknown) => {
    const label = workLabel(method, path, body);
    pendingN.current++;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setWorking(label), 300);
    return run(async () => {
      try { await api(method, path, body); await load(); }
      finally {
        if (--pendingN.current <= 0) { pendingN.current = 0; clearTimeout(timer.current); setWorking(null); }
      }
    });
  };

  /** Aplica el nuevo orden al instante y lo confirma con el backend; si falla, recarga el orden real. */
  const persistQueue = (q: any[]) => {
    setS((p: any) => (p ? { ...p, queue: q } : p));
    run(async () => {
      try {
        await api('PATCH', '/dj/queue/reorder', { ids: q.map((r: any) => r.id) });
        await load();
      } catch (e) {
        await load(); // restaura el orden real si el backend rechazo el cambio
        throw e;
      }
    });
  };
  const applyReorder = (from: number, to: number) => {
    if (!s) return;
    const q = [...s.queue];
    const [item] = q.splice(from, 1);
    q.splice(to, 0, item);
    persistQueue(q);
  };
  /** Mueve el conjunto de canciones de una mesa como un solo bloque. */
  const applyGroupReorder = (from: number, to: number) => {
    if (!s) return;
    const gs = buildGroups(s.queue);
    const [g] = gs.splice(from, 1);
    gs.splice(to, 0, g);
    persistQueue(gs.flatMap((x) => x.items));
  };

  /** Arrastre con puntero (dedo o mouse): mide las filas, mueve la tarjeta y desplaza las demas. */
  const onDragStart = (e: ReactPointerEvent, i: number) => {
    const list = queueListRef.current;
    if (!list || !s || s.queue.length < 2) return;
    e.preventDefault();
    const rows = Array.from(list.querySelectorAll('[data-qrow]')) as HTMLElement[];
    const tops = rows.map((r) => r.offsetTop);
    const heights = rows.map((r) => r.offsetHeight);
    const gap = 8;
    const id = s.queue[i].id;
    const d: DragData = { from: i, to: i, startY: e.clientY, scroll0: window.scrollY, tops, heights, gap };
    dragData.current = d;
    setDrag({ id, from: i, to: i, offset: 0, size: heights[i] + gap });

    const onMove = (ev: PointerEvent) => {
      const offset = ev.clientY - d.startY + (window.scrollY - d.scroll0);
      const center = d.tops[d.from] + d.heights[d.from] / 2 + offset;
      let to = 0;
      for (let k = 0; k < d.tops.length; k++) if (center > d.tops[k] + d.heights[k] / 2) to = k;
      d.to = to;
      // Desplaza la pagina al arrastrar cerca de los bordes de la pantalla
      if (ev.clientY < 90) window.scrollBy(0, -12);
      else if (ev.clientY > window.innerHeight - 90) window.scrollBy(0, 12);
      setDrag({ id, from: d.from, to, offset, size: d.heights[d.from] + d.gap });
    };
    const onEnd = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      dragData.current = null;
      setDrag(null);
      if (d.to !== d.from) applyReorder(d.from, d.to);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };

  /** Arrastre de una mesa completa (todas sus canciones juntas). */
  const onGroupDragStart = (e: ReactPointerEvent, gi: number) => {
    const list = queueListRef.current;
    if (!list || !s) return;
    const gs = buildGroups(s.queue);
    if (gs.length < 2) return;
    e.preventDefault();
    const els = Array.from(list.querySelectorAll('[data-qgroup]')) as HTMLElement[];
    const tops = els.map((r) => r.offsetTop);
    const heights = els.map((r) => r.offsetHeight);
    const key = `${gs[gi].tableId}-${gs[gi].items[0].id}`;
    const d: DragData = { from: gi, to: gi, startY: e.clientY, scroll0: window.scrollY, tops, heights, gap: 8 };
    dragData.current = d;
    setGdrag({ key, from: gi, to: gi, offset: 0, size: heights[gi] + 8 });
    const onMove = (ev: PointerEvent) => {
      const offset = ev.clientY - d.startY + (window.scrollY - d.scroll0);
      const center = d.tops[d.from] + d.heights[d.from] / 2 + offset;
      let to = 0;
      for (let k = 0; k < d.tops.length; k++) if (center > d.tops[k] + d.heights[k] / 2) to = k;
      d.to = to;
      if (ev.clientY < 90) window.scrollBy(0, -12);
      else if (ev.clientY > window.innerHeight - 90) window.scrollBy(0, 12);
      setGdrag({ key, from: d.from, to, offset, size: d.heights[d.from] + 8 });
    };
    const onEnd = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      dragData.current = null;
      setGdrag(null);
      if (d.to !== d.from) applyGroupReorder(d.from, d.to);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };

  // Alerta si la TV se desconecta con la sesion en marcha (se espera 8 s para ignorar parpadeos de red)
  const tvStarted = !!s?.session?.tvStarted;
  useEffect(() => {
    if (!(tvStarted && !tvConnected)) { setTvDown(false); return; }
    const t = setTimeout(() => setTvDown(true), 8000);
    return () => clearTimeout(t);
  }, [tvStarted, tvConnected]);
  useEffect(() => {
    if (!tvDown) { document.title = 'TONO'; return; }
    beep();
    let on = true;
    const t = setInterval(() => { document.title = on ? 'TV DESCONECTADA' : 'TONO'; on = !on; }, 1000);
    return () => { clearInterval(t); document.title = 'TONO'; };
  }, [tvDown]);

  // Reloj de 1 s mientras dura la cuenta regresiva de cola vacia (para pintar el cambio sin recargar)
  const holdOn = !!s?.queueHold;
  useEffect(() => {
    if (!holdOn) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [holdOn]);

  /** Reinicia la cancion desde 0 en la TV y la barra. */
  const reloadSong = () => {
    setS((p: any) => (p ? { ...p, session: { ...p.session, positionSec: 0 } } : p)); // la barra vuelve a 0:00 al instante
    setFetchedAt(Date.now());
    act('POST', '/dj/playback/reload');
  };

  // Respaldo del avance en vivo: mientras alguna cancion se descarga, el estado se vuelve a pedir cada 2 s
  const anyDownloading = !!s && [...(s.queue ?? []), ...(s.pending ?? [])].some((r: any) => r.downloading);
  useEffect(() => {
    if (!anyDownloading) return;
    const t = setInterval(() => { if (!document.hidden) load(); }, 2000);
    return () => clearInterval(t);
  }, [anyDownloading, load]);

  const togglePause = () => {
    const value = !s.session.paused;
    setS((p: any) => ({ ...p, session: { ...p.session, paused: value } }));
    act('PATCH', '/dj/playback/paused', { value });
  };

  if (!s) return <div className="grid min-h-screen place-items-center bg-[#05060a] text-slate-500">Cargando...</div>;
  const session = s.session;
  // Cola vacia: cuenta regresiva (resumeSec) y, al acabar, boton para reanudar cuando lleguen canciones
  const hold = s.queueHold as { emptyAt: string; resumeSec: number; waiting: number } | null;
  const holdLeft = hold ? Math.max(0, Math.ceil((new Date(hold.emptyAt).getTime() + hold.resumeSec * 1000 - now) / 1000)) : 0;
  const holdArmed = !!hold && holdLeft <= 0;
  // Solicitudes que el reproductor oculto aun no ha probado (las marca el backend con needsProbe)
  const probeItems = [...(s.pending ?? []), ...(s.queue ?? []), ...(s.autoQueue ?? [])]
    .filter((r: any) => r.needsProbe)
    .map((r: any) => ({ id: r.id, videoId: r.videoId }));
  /** El reproductor oculto avisa y se reporta; si YouTube la bloquea, el backend la marca "va a fallar" y el DJ decide. */
  const reportProbe = (id: string, outcome: ProbeOutcome, code?: number) => {
    api('POST', '/dj/probe', { requestId: id, outcome, code }).then(load).catch(() => {});
  };
  /** Busca otras subidas del mismo tema para una cancion marcada "va a fallar". */
  const findAlts = (id: string) => {
    setAlts((p) => ({ ...p, [id]: { loading: true } }));
    api('POST', '/dj/alternatives', { requestId: id })
      .then((r) => setAlts((p) => ({ ...p, [id]: { items: r?.items ?? [], none: !(r?.items ?? []).length, reason: r?.reason } })))
      .catch(() => setAlts((p) => ({ ...p, [id]: { none: true } })));
  };
  /** Cambia la cancion por la version elegida; la prueba en vivo la vuelve a comprobar sola. */
  const swapVersion = (id: string, videoId: string) => {
    setAlts((p) => { const n = { ...p }; delete n[id]; return n; });
    act('POST', '/dj/swap', { requestId: id, videoId });
  };
  /** Barra real de descarga (el agente del bar reporta el % de yt-dlp). */
  const dlBar = (r: any) => {
    const pct = Math.max(0, Math.min(100, Math.round(dlPct[r.id] ?? r.downloadPct ?? 0)));
    return (
      <div className="mt-1.5" role="progressbar" aria-label="Descarga" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-sky-400 transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-0.5 text-[11px] tabular-nums text-sky-300">{pct > 0 ? `Descargando ${pct}%` : 'Iniciando descarga…'}</div>
      </div>
    );
  };
  /** Lista de alternativas desplegada bajo una cancion marcada. */
  const altBlock = (r: any) => {
    const a = alts[r.id];
    if (!a) return null;
    if (a.loading) return <div className="mt-1.5 text-xs text-slate-400">Buscando otra versión…</div>;
    if (a.none) return (
      <div className="mt-1.5 text-xs text-slate-500">
        {a.reason === 'quota' ? 'Se agotó la cuota de búsqueda de YouTube por hoy: pega el link de otra versión en “Agregar canción”.'
          : a.reason === 'error' ? 'YouTube no respondió. Inténtalo de nuevo en un momento.'
          : 'No encontré otra versión que sirva.'}
        <button onClick={() => { setAlts((p) => { const n = { ...p }; delete n[r.id]; return n; }); findAlts(r.id); }} className="ml-2 font-semibold text-slate-300 underline">Reintentar</button>
      </div>
    );
    return (
      <div className="mt-1.5 space-y-1">
        {(a.items ?? []).map((v: any) => (
          <div key={v.videoId} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-1.5">
            <Thumb src={v.thumbnail} className="h-9 w-16 !rounded-md" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{v.title}</div>
              <div className="truncate text-[11px] text-slate-500">{v.channel}{v.durationSec ? ` · ${fmtDuration(v.durationSec)}` : ''}</div>
            </div>
            <button onClick={() => swapVersion(r.id, v.videoId)} className="shrink-0 rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30">Usar esta</button>
          </div>
        ))}
      </div>
    );
  };
  /** Boton para desplegar alternativas junto a la marca "Va a fallar". */
  const altBtn = (r: any) =>
    r.willFail && !alts[r.id] ? (
      <button onClick={() => findAlts(r.id)} className="ml-1.5 rounded bg-white/10 px-1.5 py-0.5 font-semibold text-slate-100 hover:bg-white/15">Buscar otra versión</button>
    ) : null;
  const [title, subtitle] = HERO[tab];
  const links: [string, string, 'tv' | 'home'][] = [['/tv', 'Pantalla TV', 'tv']];
  if (user?.role === 'ADMIN') links.push(['/admin', 'Panel admin', 'home']);

  const historyList = (
    s.history.length === 0 ? (
      <p className="p-6 text-center text-sm text-slate-500">Aún no hay historial en esta sesión.</p>
    ) : (
      <div className="divide-y divide-white/5">
        {s.history.map((r: any) => {
          const [label, color] = STATUS_LABEL[r.status] ?? [r.status, 'text-slate-400'];
          return (
            <div key={r.id} className="flex items-center gap-3 px-2 py-2.5 text-sm">
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
    )
  );

  const tablesList = (
    <div className="space-y-2">
      {s.tables.map((t: any) => (
        <div key={t.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{t.name}</div>
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
  );

  return (
    <Shell nav={NAV} active={tab} onNav={(id) => setTab(id as Tab)} eyebrow="Panel DJ" title={title} subtitle={subtitle} org={s.business.name} links={links}>
      {/* Reproductor oculto: prueba que YouTube deje reproducir cada cancion antes de que llegue a la TV */}
      <SongProbe items={probeItems} onResult={reportProbe} />
      {/* Estado y control de sesion */}
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-white/[0.07] pb-5">
        <p className="text-sm text-slate-400">
          {[
            online ? null : <b key="o" className="font-medium text-red-300">Sin conexión</b>,
            <span key="t" className={tvConnected ? '' : 'text-amber-300'}>{tvConnected ? 'TV conectada' : 'TV desconectada'}</span>,
            session ? <span key="s">{session.requestsOpen ? 'Solicitudes abiertas' : 'Solicitudes bloqueadas'}</span> : null,
            <span key="a">{s.business.autoApprove ? 'Aprobación automática' : 'Aprobación manual'}</span>,
            s.business.autoDjMode === 'AUTO' ? <span key="dj">Auto-DJ (música normal)</span> : null,
          ].filter(Boolean).flatMap((x, i) => (i ? [<span key={`d${i}`} className="mx-2 text-slate-600">·</span>, x] : [x]))}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {session ? (
            <>
              {(s.business.features ?? ['autoDj']).includes('autoDj') && (
              <Btn
                kind={s.business.autoDjMode === 'AUTO' ? 'accent' : undefined}
                onClick={() => act('PATCH', '/dj/autodj', { mode: s.business.autoDjMode === 'AUTO' ? 'OFF' : 'AUTO' })}
              >
                {s.business.autoDjMode === 'AUTO' ? 'Auto-DJ: activado' : 'Auto-DJ: apagado'}
              </Btn>
              )}
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
        </div>
      </div>

      {tvDown && (
        <div className="mb-6 rounded-2xl border border-red-400/30 bg-red-500/20 px-5 py-3 text-center text-sm font-semibold text-red-100" role="alert">
          <Icon name="warn" className="mr-2 inline h-5 w-5 align-[-.2em]" />La pantalla de TV se desconectó. Revisa el internet o el navegador de la TV; al volver se reconecta sola
          (si recargaron la página, hay que pulsar “Iniciar karaoke” otra vez).
        </div>
      )}
      {!tvDown && session?.tvStarted && tvConnected && !s.tvArmed && (
        <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/15 px-5 py-3 text-center text-sm text-amber-100">
          La TV está abierta pero no está reproduciendo: falta pulsar “Iniciar karaoke” en esa pantalla.
        </div>
      )}

      {!session ? (
        <div className="mx-auto max-w-md py-16 text-center">
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl" style={{ background: ACCENT + '22', color: ACCENT }}><Icon name="mic" className="h-8 w-8" /></div>
          <h2 className="text-2xl font-bold">La sesión está cerrada</h2>
          <p className="mt-2 text-slate-400">Inicia la sesión para que los clientes puedan pedir canciones. Después abre la pantalla TV del bar y pulsa “Iniciar karaoke”.</p>
          <Btn kind="accent" className="mt-6 px-6 py-3 text-base" onClick={() => act('POST', '/dj/session/start')}>Iniciar sesión de karaoke</Btn>
        </div>
      ) : (
        <>
          {tab === 'live' && (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className="space-y-6">
                <section className="overflow-hidden rounded-3xl border border-white/10" style={{ background: `radial-gradient(80% 120% at 100% 0%, ${ACCENT}2a, transparent 70%), rgba(255,255,255,.03)` }}>
                  <div className="flex items-center justify-between px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: ACCENT }}>
                    <span>Sonando ahora</span>
                    {session.paused && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-amber-300">En pausa</span>}
                  </div>
                  {s.current ? (
                    <>
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
                        <Btn onClick={togglePause}><span className="inline-flex items-center gap-2"><Icon name={session.paused ? 'play' : 'pause'} className="h-4 w-4" />{session.paused ? 'Reanudar' : 'Pausar'}</span></Btn>
                        <Btn onClick={reloadSong}><span className="inline-flex items-center gap-2"><Icon name="reload" className="h-4 w-4" />Recargar</span></Btn>
                        <Btn kind="danger" onClick={() => act('POST', '/dj/playback/skip')}><span className="inline-flex items-center gap-2"><Icon name="skip" className="h-4 w-4" />Saltar</span></Btn>
                      </div>
                    </div>
                    <SongProgress positionSec={Number(session.positionSec ?? 0)} durationSec={s.current.durationSec} paused={!!session.paused} fetchedAt={fetchedAt} />
                    </>
                  ) : hold ? (
                    <div className="px-5 pb-6">
                      {holdArmed ? (
                        <div className="flex flex-wrap items-center gap-4">
                          <Btn kind="accent" className={`px-5 py-2.5 ${hold.waiting > 0 ? 'animate-pulse' : ''}`} onClick={() => act('POST', '/dj/playback/resume')}>
                            <span className="inline-flex items-center gap-2"><Icon name="play" className="h-4 w-4" />Reanudar cola{hold.waiting > 0 ? ` (${hold.waiting})` : ''}</span>
                          </Btn>
                          <p className="min-w-60 flex-1 text-sm text-slate-300">
                            {hold.waiting > 0
                              ? `${hold.waiting === 1 ? 'Hay 1 canción esperando' : `Hay ${hold.waiting} canciones esperando`}. No suena sola para no montarse encima de la música externa: púlsalo cuando estés listo.`
                              : 'Cola en espera: la próxima canción que llegue no sonará sola. Púlsalo para volver al karaoke.'}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-300">
                          Se acabó la cola. Si llega una canción en los próximos <b className="tabular-nums text-white">{holdLeft} s</b> suena sola; después esperará a que pulses «Reanudar cola».
                        </p>
                      )}
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

                {s.business.autoDjMode === 'AUTO' && (
                  <Card title="Géneros del Auto-DJ">
                    <p className="mb-3 text-xs text-slate-400">
                      Elige los géneros que sonarán cuando no haya solicitudes. Sin ninguno, TONO usa lo más pedido en tu bar. Siempre son versiones normales, no karaoke.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(s.business.autoDjCatalog ?? []).map((g: string) => {
                        const on = (s.business.autoDjGenres ?? []).includes(g);
                        const next = on ? s.business.autoDjGenres.filter((x: string) => x !== g) : [...(s.business.autoDjGenres ?? []), g];
                        return (
                          <button key={g} onClick={() => act('PATCH', '/dj/autodj', { genres: next })}
                            className="rounded-full border px-3 py-1.5 text-sm font-medium"
                            style={on ? { background: ACCENT, borderColor: ACCENT, color: '#04202a' } : { borderColor: 'rgba(255,255,255,.15)', color: '#cbd5e1' }}>
                            {g}
                          </button>
                        );
                      })}
                    </div>
                  </Card>
                )}

                <Card title="Por aprobar" count={s.pending.length}>
                  {s.pending.length === 0 ? (
                    <p className="p-6 text-center text-sm text-slate-500">Sin solicitudes pendientes.</p>
                  ) : (
                    <div className="space-y-2">
                      {s.pending.map((r: any) => (
                        <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 sm:gap-4">
                          <Thumb src={r.thumbnail} className="h-14 w-24 !rounded-lg" />
                          <div className="min-w-0 flex-1 basis-40">
                            <div className="truncate font-semibold">{r.title}</div>
                            <div className="text-xs text-slate-400">
                              <span className="rounded bg-white/10 px-1.5 py-0.5 font-medium text-slate-200">{r.tableName}</span>
                              {r.durationSec ? <span className="ml-2">{fmtDuration(r.durationSec)}</span> : null}
                              {r.needsProbe && <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-300">Comprobando…</span>}
                              {r.downloading && <span className="ml-2 rounded bg-sky-500/20 px-1.5 py-0.5 font-medium text-sky-300" title="YouTube no la deja reproducir; el agente del bar la está bajando">Descargando {Math.round(dlPct[r.id] ?? r.downloadPct ?? 0)}%</span>}
                              {r.willFail && !r.downloading && <span className="ml-2 rounded bg-red-500/20 px-1.5 py-0.5 font-medium text-red-300" title="YouTube no deja reproducir este video aquí; si se pone en la TV, va a fallar">Va a fallar</span>}
                              {altBtn(r)}
                            </div>
                            {altBlock(r)}
                          </div>
                          <Btn kind="ok" onClick={() => act('PATCH', `/dj/requests/${r.id}/approve`)}>Aprobar</Btn>
                          <Btn kind="danger" onClick={() => act('PATCH', `/dj/requests/${r.id}/reject`, {})}>Rechazar</Btn>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              <Card title="Cola de reproducción" count={s.queue.length + (s.autoQueue?.length ?? 0)} className="self-start">
                {s.queue.length === 0 && !s.autoQueue?.length ? (
                  <p className="p-6 text-center text-sm text-slate-500">La cola está vacía.</p>
                ) : (
                  <div className="space-y-2">
                    <div ref={queueListRef} className="relative space-y-2">
                    {(() => {
                      // La cola ya viene agrupada por mesa desde el backend: se parte en bloques de mesas consecutivas
                      const groups = buildGroups(s.queue);
                      return groups.map((g, gi) => {
                        const gkey = `${g.tableId}-${g.items[0].id}`;
                        const gd = gdrag && gdrag.key === gkey ? gdrag : null;
                        let gshift = 0;
                        if (gdrag && !gd) {
                          if (gi > gdrag.from && gi <= gdrag.to) gshift = -gdrag.size;
                          else if (gi < gdrag.from && gi >= gdrag.to) gshift = gdrag.size;
                        }
                        return (
                        <div key={gkey} data-qgroup
                          className={`space-y-2 rounded-2xl border bg-white/[0.02] p-2 ${gd ? 'relative z-20 select-none border-white/25 shadow-xl shadow-black/50' : 'border-white/10'}`}
                          style={{
                            transform: gd ? `translateY(${gd.offset}px)` : gshift ? `translateY(${gshift}px)` : undefined,
                            transition: gd ? undefined : 'transform 150ms ease',
                            backgroundColor: gd ? '#0d1117' : undefined,
                          }}>
                          <div className="flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                            <span className="flex items-center gap-1">
                              <span title="Arrastra para mover todas las canciones de esta mesa" onPointerDown={(e) => onGroupDragStart(e, gi)}
                                className="-ml-1 grid h-7 w-6 shrink-0 cursor-grab touch-none place-items-center text-slate-500 hover:text-slate-300 active:cursor-grabbing">
                                <Icon name="grip" className="h-4 w-4" />
                              </span>
                              {g.name}
                            </span>
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-slate-300">{g.items.length}</span>
                          </div>
                          {g.items.map((r: any, k: number) => {
                            const i = g.start + k;
                            const d = drag && drag.id === r.id ? drag : null;
                            let shift = 0;
                            if (drag && !d) {
                              if (i > drag.from && i <= drag.to) shift = -drag.size;
                              else if (i < drag.from && i >= drag.to) shift = drag.size;
                            }
                            return (
                            <div key={r.id} data-qrow
                              className={`flex items-center gap-3 rounded-xl border bg-white/[0.04] p-2.5 ${d ? 'relative z-10 select-none border-white/25 shadow-xl shadow-black/50' : 'border-white/10'}`}
                              style={{
                                transform: d ? `translateY(${d.offset}px)` : shift ? `translateY(${shift}px)` : undefined,
                                transition: d ? undefined : 'transform 150ms ease',
                                backgroundColor: d ? '#0d1117' : undefined,
                              }}>
                              <span title="Arrastra para reordenar" onPointerDown={(e) => onDragStart(e, i)}
                                className="-ml-1 grid h-9 w-6 shrink-0 cursor-grab touch-none place-items-center text-slate-500 hover:text-slate-300 active:cursor-grabbing">
                                <Icon name="grip" className="h-4 w-4" />
                              </span>
                              <div className="w-6 text-center text-sm font-bold text-slate-500">{d ? d.to + 1 : i + 1}</div>
                              <Thumb src={r.thumbnail} className="h-11 w-[4.5rem] !rounded-lg" />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">{r.title}</div>
                                {r.needsProbe && <div className="text-xs text-amber-300">Comprobando…</div>}
                                {r.downloading && <div className="text-xs font-semibold text-sky-300">Descargando en el bar… sonará cuando termine</div>}
                                {r.downloading && dlBar(r)}
                                {r.willFail && !r.downloading && <div className="text-xs font-semibold text-red-300">Va a fallar · YouTube la bloquea{altBtn(r)}</div>}
                                {altBlock(r)}
                              </div>
                              <div className="flex gap-1">
                                <select
                                  title="Cambiar la mesa que pidió esta canción"
                                  value=""
                                  onChange={(e) => e.target.value && act('PATCH', `/dj/requests/${r.id}/table`, { tableId: e.target.value })}
                                  className="h-8 max-w-[7.5rem] rounded-lg border-0 bg-white/10 px-2 text-xs font-semibold text-slate-200 hover:bg-white/15"
                                >
                                  <option value="" className="bg-[#0b1624]">Cambiar mesa</option>
                                  {s.tables.filter((t: any) => t.id !== r.tableId).map((t: any) => (
                                    <option key={t.id} value={t.id} className="bg-[#0b1624]">{t.name}</option>
                                  ))}
                                </select>
                                <button title="Quitar de la cola" onClick={() => act('PATCH', `/dj/requests/${r.id}/reject`, {})} className="grid h-8 w-8 place-items-center rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25"><Icon name="x" className="h-4 w-4" /></button>
                              </div>
                            </div>
                            );
                          })}
                        </div>
                        );
                      });
                    })()}
                    </div>
                    {s.autoQueue?.length > 0 && (
                      <>
                        <div className="flex items-center gap-2 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          <span>Auto-DJ · siguen después de las solicitudes</span>
                        </div>
                        {s.autoQueue.map((r: any) => (
                          <div key={r.id} className="flex items-center gap-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-2.5">
                            <Thumb src={r.thumbnail} className="h-11 w-[4.5rem] !rounded-lg" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{r.title}</div>
                              <div className="text-xs text-slate-500">Auto-DJ{r.channel ? ` · ${r.channel}` : ''}{r.needsProbe && <> · <span className="text-amber-300">Comprobando…</span></>}{r.willFail && <> · <span className="font-semibold text-red-300">Va a fallar</span></>}{altBtn(r)}</div>
                              {altBlock(r)}
                            </div>
                            <button title="Quitar" onClick={() => act('PATCH', `/dj/requests/${r.id}/reject`, {})} className="grid h-8 w-8 place-items-center rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25"><Icon name="x" className="h-4 w-4" /></button>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </Card>
            </div>
          )}
          {tab === 'tables' && <Card title="Mesas" count={s.tables.filter((t: any) => t.waiting > 0).length}>{tablesList}</Card>}
          {tab === 'history' && <Card title="Recientes" count={s.history.length}>{historyList}</Card>}
        </>
      )}
      {working && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 backdrop-blur-[2px]" role="status" aria-live="polite">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0b1624] px-5 py-4 shadow-2xl">
            <svg className="h-6 w-6 animate-spin" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="16" stroke={ACCENT + '33'} strokeWidth="5" />
              <path d="M20 4a16 16 0 0116 16" stroke={ACCENT} strokeWidth="5" strokeLinecap="round" />
            </svg>
            <span className="text-sm font-medium text-slate-100">{working}</span>
          </div>
        </div>
      )}
      {node}
    </Shell>
  );
}
