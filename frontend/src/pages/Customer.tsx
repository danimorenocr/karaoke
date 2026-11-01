import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { connectSocket, fmtDuration, pub } from '../lib/api';
import { Thumb, useAction, useToast } from '../components/ui';
import GoogleSearch, { GOOGLE_CSE_ID, GoogleItem } from '../components/GoogleSearch';

const STATUS: Record<string, [string, string]> = {
  PENDING: ['Esperando al DJ', 'text-amber-300'],
  APPROVED: ['En cola', 'text-sky-300'],
  PLAYING: ['Sonando ahora', 'text-emerald-300'],
  COMPLETED: ['Completada', 'text-slate-500'],
  REJECTED: ['Rechazada', 'text-red-400'],
  CANCELLED: ['Cancelada', 'text-slate-500'],
  FAILED: ['No se pudo reproducir', 'text-red-400'],
};
const WAITING = ['PENDING', 'APPROVED'];
const DEFAULT_PINK = '#ec4899';
const TEAL = '#22d3c5';

type View = 'home' | 'queue' | 'mine';

const Icon = ({ d, className = 'h-6 w-6' }: { d: ReactNode; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>{d}</svg>
);
const icons = {
  home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 13l4 4L19 7" />,
  table: <><path d="M3 8h18" /><path d="M5 8v11M19 8v11M3 8l2-4h14l2 4" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></>,
};

export default function Customer() {
  const { token } = useParams();
  const [state, setState] = useState<any>(null);
  const [invalid, setInvalid] = useState(false);
  const [view, setView] = useState<View>('home');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [sentId, setSentId] = useState<string | null>(null); // para el aviso "solicitud enviada"
  const [busyVideo, setBusyVideo] = useState<string | null>(null);
  const [googleQuery, setGoogleQuery] = useState(''); // si no esta vacio, se usa el respaldo de Google
  const [googleItems, setGoogleItems] = useState<GoogleItem[]>([]);
  const [adding, setAdding] = useState<any>(null); // cancion que se esta enviando (aviso mientras responde el servidor)
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    if (!adding) return;
    setMsgIdx(0);
    const t = setInterval(() => setMsgIdx((i) => i + 1), 2200);
    return () => clearInterval(t);
  }, [adding]);
  const { toast, node } = useToast();
  const run = useAction(toast);
  const lastQuery = useRef('');

  const load = useCallback(async () => {
    try {
      setState(await pub('GET', `/public/${token}/state`));
    } catch (e: any) {
      if (e.status === 404) setInvalid(true);
    }
  }, [token]);

  useEffect(() => {
    load();
    const off = connectSocket({ tableToken: token }, (name) => {
      if (name === 'queue.updated' || name === 'connect') load();
    });
    const poll = setInterval(load, 20000); // respaldo si el socket se cae
    return () => {
      off();
      clearInterval(poll);
    };
  }, [token, load]);

  // Busqueda con debounce para cuidar la cuota de YouTube
  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) {
      setResults([]);
      setSearchError('');
      lastQuery.current = '';
      return;
    }
    const t = setTimeout(async () => {
      if (lastQuery.current === term) return;
      lastQuery.current = term;
      setSearching(true);
      setSearchError('');
      try {
        setResults(await pub('GET', `/youtube/search?q=${encodeURIComponent(term)}`));
        setGoogleQuery('');
      } catch (e: any) {
        setResults([]);
        lastQuery.current = '';
        // Cuota agotada o busqueda no configurada: respaldo con Google si esta configurado
        if (GOOGLE_CSE_ID && (e.status === 429 || e.status === 503)) {
          setGoogleItems([]);
          setGoogleQuery(term);
        } else {
          setGoogleQuery('');
          setSearchError(e.message);
        }
      } finally {
        setSearching(false);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [q]);

  // El aviso de "solicitud enviada" se oculta solo
  useEffect(() => {
    if (!sentId) return;
    const t = setTimeout(() => setSentId(null), 6000);
    return () => clearTimeout(t);
  }, [sentId]);

  if (invalid) {
    return <div className="grid min-h-dvh place-items-center bg-[#050d18] p-8 text-center text-slate-300">Este codigo QR no es valido o fue desactivado.<br />Pide ayuda al personal.</div>;
  }
  if (!state) return <div className="grid min-h-dvh place-items-center bg-[#050d18] text-slate-500">Cargando...</div>;

  const brand = state.business.primaryColor;
  const accent = !brand || brand.toLowerCase() === DEFAULT_PINK ? TEAL : brand;
  const closed = !state.session ? 'El karaoke aun no ha comenzado' : !state.session.open ? 'Las solicitudes estan pausadas por ahora' : '';
  const waitingCount = state.mine.filter((r: any) => WAITING.includes(r.status)).length;
  const full = waitingCount >= state.maxPending;
  const requestedIds = new Set(state.mine.filter((r: any) => WAITING.includes(r.status) || r.status === 'PLAYING').map((r: any) => r.videoId));

  const sent = sentId ? state.mine.find((r: any) => r.id === sentId) : null;
  const sentPos = sent ? state.queue.findIndex((r: any) => r.id === sent.id) + 1 : 0;

  const request = (s: any) =>
    run(async () => {
      setBusyVideo(s.videoId);
      setSentId(null);
      setAdding(s);
      try {
        const r = await pub('POST', `/public/${token}/requests`, {
          videoId: s.videoId,
          title: s.title,
          channel: s.channelTitle,
          thumbnail: s.thumbnail,
          durationSec: s.durationSec,
        });
        setSentId(r.id);
        await load();
      } finally {
        setBusyVideo(null);
        setAdding(null);
      }
    });

  /** Un video encontrado por Google: se valida (que se pueda reproducir) antes de pedirlo. */
  const requestGoogle = (g: GoogleItem) =>
    run(async () => {
      setBusyVideo(g.videoId);
      let verified: any;
      try {
        [verified] = await pub('GET', `/youtube/search?q=${encodeURIComponent('https://www.youtube.com/watch?v=' + g.videoId)}`);
      } catch {
        setBusyVideo(null);
        throw new Error('Este video no se puede reproducir en la TV. Prueba con otro.');
      }
      setBusyVideo(null);
      await request(verified ?? { videoId: g.videoId, title: g.title, thumbnail: g.thumbnail, channelTitle: '' });
    });

  const tabs: [View, string, ReactNode][] = [
    ['home', 'Inicio', icons.home],
    ['queue', 'Cola', icons.list],
    ['mine', 'Mi solicitud', icons.star],
  ];

  return (
    <div className="min-h-dvh bg-[#050d18] text-slate-100" style={{ backgroundImage: `radial-gradient(120% 60% at 50% 0%, ${accent}22, transparent 60%)` }}>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-28 pt-4">
        {/* Encabezado */}
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {state.business.logoUrl ? (
              <img src={state.business.logoUrl} className="h-9 w-9 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: accent + '33', color: accent }}>
                <Icon d={icons.mic} className="h-5 w-5" />
              </span>
            )}
            <span className="truncate text-lg font-bold">{state.business.name}</span>
          </div>
          <span className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium">
            <Icon d={icons.table} className="h-4 w-4" />
            {state.table.name}
          </span>
        </header>

        {closed && <div className="mt-4 rounded-xl bg-amber-500/15 p-3 text-sm text-amber-200">{closed}</div>}

        {view === 'home' && (
          <main className="flex-1">
            {/* Bienvenida: se oculta mientras se busca para dar espacio a los resultados */}
            {!q.trim() && (
              <section className="px-2 pb-6 pt-10 text-center">
                <h1 className="text-4xl font-extrabold tracking-tight">¡Bienvenido!</h1>
                <p className="mx-auto mt-3 max-w-[16rem] text-lg leading-snug text-slate-300">
                  Busca tu canción favorita y súbela a la cola 🎤
                </p>
              </section>
            )}

            <div className={`relative ${q.trim() ? 'mt-5' : ''}`}>
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Icon d={icons.search} className="h-5 w-5" /></span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar canción o pegar link de YouTube"
                enterKeyHint="search"
                className="w-full rounded-2xl border border-white/10 bg-white/5 py-4 pl-12 pr-4 text-base text-slate-100 outline-none placeholder:text-slate-500 focus:border-white/30"
              />
            </div>

            {!q.trim() && (
              <p className="mt-4 text-center text-sm text-slate-500">
                Tu mesa: {waitingCount}/{state.maxPending} canciones en espera
              </p>
            )}

            {state.current && !q.trim() && (
              <div className="mt-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                <Thumb src={state.current.thumbnail} className="h-12 w-12" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>Sonando ahora · {state.current.tableName}</div>
                  <div className="truncate font-medium">{state.current.title}</div>
                </div>
              </div>
            )}

            {q.trim() && (
              <div className="mt-4 space-y-2">
                {q.trim().length < 3 && <p className="text-sm text-slate-500">Escribe al menos 3 letras…</p>}
                {searching && <p className="text-sm text-slate-400">Buscando…</p>}
                {searchError && <p className="text-sm text-red-400">{searchError}</p>}
                {!searching && !searchError && !googleQuery && q.trim().length >= 3 && results.length === 0 && lastQuery.current && (
                  <p className="text-sm text-slate-500">Sin resultados.</p>
                )}
                {results.map((s) => {
                  const done = requestedIds.has(s.videoId);
                  const disabled = !!closed || full || done || busyVideo === s.videoId;
                  return (
                    <div key={s.videoId} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-2">
                      <Thumb src={s.thumbnail} className="h-14 w-14" />
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-[15px] font-semibold leading-tight">{s.title}</div>
                        <div className="mt-0.5 truncate text-xs text-slate-400">{s.channelTitle} {fmtDuration(s.durationSec)}</div>
                      </div>
                      <button
                        aria-label={done ? 'Ya solicitada' : 'Pedir canción'}
                        disabled={disabled}
                        onClick={() => request(s)}
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 transition active:scale-95 disabled:opacity-40"
                        style={done ? { background: accent, color: '#04202a' } : undefined}
                      >
                        <Icon d={done ? icons.check : icons.plus} />
                      </button>
                    </div>
                  );
                })}
                {googleQuery && (
                  <>
                    {googleItems.map((g) => {
                      const done = requestedIds.has(g.videoId);
                      return (
                        <div key={g.videoId} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-2">
                          <Thumb src={g.thumbnail} className="h-14 w-14" />
                          <div className="line-clamp-2 min-w-0 flex-1 text-[15px] font-semibold leading-tight">{g.title}</div>
                          <button
                            aria-label="Pedir canción"
                            disabled={!!closed || full || done || busyVideo === g.videoId}
                            onClick={() => requestGoogle(g)}
                            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 transition active:scale-95 disabled:opacity-40"
                            style={done ? { background: accent, color: '#04202a' } : undefined}
                          >
                            <Icon d={done ? icons.check : icons.plus} />
                          </button>
                        </div>
                      );
                    })}
                    <GoogleSearch query={googleQuery} onResults={setGoogleItems} onError={setSearchError} onPick={(g) => !closed && !full && !requestedIds.has(g.videoId) && requestGoogle(g)} />
                  </>
                )}
                {full && (results.length > 0 || googleItems.length > 0) && <p className="text-center text-xs text-amber-300">Tu mesa llegó al máximo de canciones en espera ({state.maxPending}).</p>}
              </div>
            )}
          </main>
        )}

        {view === 'queue' && (
          <main className="mt-6 flex-1 space-y-2">
            <h2 className="mb-1 text-xl font-bold">Cola de canciones</h2>
            {state.current && (
              <div className="flex items-center gap-3 rounded-2xl p-3" style={{ background: accent + '22' }}>
                <Thumb src={state.current.thumbnail} className="h-12 w-12" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase" style={{ color: accent }}>Sonando · {state.current.tableName}</div>
                  <div className="truncate font-medium">{state.current.title}</div>
                </div>
              </div>
            )}
            {state.queue.length === 0 ? (
              <p className="p-8 text-center text-slate-500">La cola está vacía. ¡Sé el primero!</p>
            ) : (
              state.queue.map((r: any, i: number) => (
                <div key={r.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-2">
                  <div className="w-7 text-center font-bold text-slate-400">{i + 1}</div>
                  <Thumb src={r.thumbnail} className="h-11 w-11" />
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-medium">{r.title}</div>
                    <div className="text-xs text-slate-400">{r.tableName}</div>
                  </div>
                </div>
              ))
            )}
          </main>
        )}

        {view === 'mine' && (
          <main className="mt-6 flex-1 space-y-2">
            <h2 className="mb-1 text-xl font-bold">Mis solicitudes</h2>
            {state.mine.length === 0 ? (
              <p className="p-8 text-center text-slate-500">Aún no has pedido canciones.</p>
            ) : (
              state.mine.map((r: any) => (
                <div key={r.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-2">
                  <Thumb src={r.thumbnail} className="h-12 w-12" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium">{r.title}</div>
                    <div className={`text-xs ${STATUS[r.status][1]}`}>
                      {STATUS[r.status][0]}
                      {r.status === 'REJECTED' && r.rejectionReason ? `: ${r.rejectionReason}` : ''}
                    </div>
                  </div>
                  {WAITING.includes(r.status) && (
                    <button
                      className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold"
                      onClick={() => run(async () => { await pub('POST', `/public/${token}/requests/${r.id}/cancel`); await load(); })}
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              ))
            )}
          </main>
        )}
      </div>

      {/* Aviso inferior mientras se envia la solicitud */}
      {adding && (
        <div
          className="fixed inset-x-4 bottom-[4.9rem] z-20 mx-auto flex max-w-md items-center gap-3 rounded-2xl border p-3 backdrop-blur"
          style={{ background: '#08222b', borderColor: accent + '66' }}
          role="status"
        >
          <span className="relative grid h-10 w-10 shrink-0 place-items-center">
            <svg className="absolute inset-0 h-10 w-10 animate-spin" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="17" stroke={accent + '33'} strokeWidth="4" />
              <path d="M20 3a17 17 0 0117 17" stroke={accent} strokeWidth="4" strokeLinecap="round" />
            </svg>
            <span className="text-base">🎵</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">
              {['Agregando tu canción a la cola…', 'Calentando el micrófono 🎤', 'Ya casi, ¡afina la garganta!'][msgIdx % 3]}
            </span>
            <span className="block truncate text-sm text-slate-300">{adding.title}</span>
          </span>
        </div>
      )}

      {/* Aviso inferior: solicitud enviada */}
      {sent && !adding && (
        <button
          onClick={() => { setView('mine'); setSentId(null); }}
          className="fixed inset-x-4 bottom-[4.9rem] z-20 mx-auto flex max-w-md items-center gap-3 rounded-2xl border p-3 text-left backdrop-blur"
          style={{ background: '#08222b', borderColor: accent + '66' }}
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: accent, color: '#04202a' }}>
            <Icon d={icons.check} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Tu solicitud fue enviada</span>
            <span className="block truncate text-sm text-slate-300">
              {sentPos > 0 ? `Posición en la cola: #${sentPos}` : 'Esperando aprobación del DJ'}
            </span>
          </span>
          <span className="text-slate-400">›</span>
        </button>
      )}

      {/* Navegacion inferior */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#07111d]/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-md">
          {tabs.map(([k, label, icon]) => {
            const active = view === k;
            const badge = k === 'queue' ? state.queue.length : k === 'mine' ? waitingCount : 0;
            return (
              <button key={k} onClick={() => setView(k)} className="relative flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium" style={{ color: active ? accent : '#94a3b8' }}>
                <Icon d={icon} className="h-6 w-6" />
                {label}
                {badge > 0 && (
                  <span className="absolute right-[28%] top-2 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-[#04202a]" style={{ background: accent }}>{badge}</span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
      {node}
    </div>
  );
}
