import { useCallback, useEffect, useRef, useState } from 'react';
import { api, connectSocket } from '../lib/api';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

function loadYouTubeApi(): Promise<void> {
  return new Promise((resolve) => {
    if (window.YT?.Player) return resolve();
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.getElementById('yt-api')) {
      const s = document.createElement('script');
      s.id = 'yt-api';
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
  });
}

/**
 * Pantalla del bar. El backend decide que suena (`current`); esta pagina solo lo ejecuta y reporta
 * fin/error con el id de la solicitud, asi un evento repetido no salta canciones.
 */
export default function Tv() {
  const [state, setState] = useState<any>(null);
  const [armed, setArmed] = useState(false); // el usuario pulso "Iniciar karaoke" en ESTA pagina
  const [blocked, setBlocked] = useState(false);
  const [online, setOnline] = useState(true);
  const [err, setErr] = useState('');
  const [playing, setPlaying] = useState(false); // el video actual ya empezo a sonar
  const [finishedId, setFinishedId] = useState<string | null>(null); // ultima cancion que termino
  const [replaced, setReplaced] = useState(false); // otra pantalla TV tomo el control
  const [slow, setSlow] = useState(false); // el video tarda mucho: se quita el aviso para no ocultar un posible error

  const playerRef = useRef<any>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const loadedId = useRef<string | null>(null);
  const reported = useRef<string | null>(null);
  const lastPaused = useRef(false);
  const armedRef = useRef(false);
  const readyRef = useRef(false);
  const replacedRef = useRef(false);
  const claimRef = useRef<() => void>(() => {});
  const stateRef = useRef<any>(null);

  const load = useCallback(async () => {
    if (replacedRef.current) return;
    try {
      const s = await api('GET', '/player/state');
      stateRef.current = s;
      setState(s);
      setErr('');
      sync(s);
    } catch (e: any) {
      setErr(e.message);
    }
  }, []);

  /** Alinea el reproductor con lo que dice el backend. */
  function sync(s: any, forceReload = false) {
    const p = playerRef.current;
    // El reproductor solo tiene sus metodos (loadVideoById, etc.) despues de onReady
    if (!p || !armedRef.current || !readyRef.current || replacedRef.current) return;
    const cur = s.current;
    if (!cur) {
      if (loadedId.current) p.stopVideo?.();
      loadedId.current = null;
      setPlaying(false);
      return;
    }
    if (cur.id !== loadedId.current || forceReload) {
      loadedId.current = cur.id;
      reported.current = null;
      setBlocked(false);
      setPlaying(false);
      setSlow(false);
      // Si la TV se recargo (o el servidor reinicio) a mitad de cancion, retoma donde iba
      const pos = Number(s.session?.positionSec ?? 0);
      p.loadVideoById({ videoId: cur.videoId, startSeconds: pos > 5 ? pos - 2 : 0 });
      lastPaused.current = false;
    }
    const paused = !!s.session?.paused;
    if (paused !== lastPaused.current) {
      lastPaused.current = paused;
      paused ? p.pauseVideo?.() : p.playVideo?.();
    }
  }

  async function report(kind: 'ended' | 'error') {
    const id = loadedId.current;
    if (!id || reported.current === id) return;
    reported.current = id;
    try {
      await api('POST', `/player/${kind}`, { requestId: id });
    } catch {
      reported.current = null; // reintenta en el siguiente evento / recarga
    }
    load();
  }

  useEffect(() => {
    let dead = false;
    loadYouTubeApi().then(() => {
      if (dead || !hostRef.current || playerRef.current) return; // nunca mas de un reproductor
      hostRef.current.innerHTML = '';
      const el = document.createElement('div');
      hostRef.current.appendChild(el);
      playerRef.current = new window.YT.Player(el, {
        width: '100%',
        height: '100%',
        playerVars: { autoplay: 1, rel: 0, playsinline: 1, controls: 1 },
        events: {
          onReady: () => {
            readyRef.current = true;
            load(); // si ya pulsaron "Iniciar karaoke", carga lo que corresponda
          },
          onStateChange: (e: any) => {
            if (e.data === window.YT.PlayerState.ENDED) {
              setPlaying(false);
              setFinishedId(loadedId.current);
              report('ended');
            }
            if (e.data === window.YT.PlayerState.PLAYING) { setBlocked(false); setPlaying(true); }
            // Pausa que no vino del DJ (p.ej. el navegador pausa al ocultar la pestana): reanudar.
            if (e.data === window.YT.PlayerState.PAUSED && armedRef.current && loadedId.current && !lastPaused.current) {
              console.info('[TV] pausa que no vino del DJ (hidden=' + document.hidden + '): reanudando');
              setTimeout(() => {
                if (!lastPaused.current && playerRef.current?.getPlayerState?.() === window.YT.PlayerState.PAUSED) playerRef.current.playVideo();
              }, 100);
            }
          },
          onError: () => report('error'), // video eliminado / no incrustable / etc.
          onAutoplayBlocked: () => setBlocked(true),
        },
      });
    });
    const off = connectSocket({ role: 'tv' }, (name) => {
      if (name === 'connect') { setOnline(true); if (armedRef.current && !replacedRef.current) claimRef.current(); load(); } // al reconectar, vuelve a tomar el control
      if (name === 'tv.replaced') {
        // Otra pantalla pulso "Iniciar karaoke": esta se detiene para no duplicar el sonido
        replacedRef.current = true;
        armedRef.current = false;
        setReplaced(true);
        try { playerRef.current?.stopVideo?.(); } catch { /* */ }
        return;
      }
      if (name === 'disconnect') setOnline(false);
      // Pausa/reanuda al instante con el evento; el refetch posterior solo confirma
      if (name === 'playback.paused' && armedRef.current) { lastPaused.current = true; playerRef.current?.pauseVideo?.(); }
      if (name === 'playback.resumed' && armedRef.current) { lastPaused.current = false; playerRef.current?.playVideo?.(); }
      if (name === 'queue.updated') load();
      if (name === 'playback.reload' && stateRef.current) sync(stateRef.current, true);
    });
    claimRef.current = () => off.emit('tv.claim');
    const poll = setInterval(load, 15000); // recuperacion si se pierde algun evento
    // Latido cada 5 s: avisa al servidor que la TV sigue viva y guarda en que segundo va la cancion
    const beat = setInterval(() => {
      if (!armedRef.current || replacedRef.current) return;
      const p = playerRef.current;
      const id = loadedId.current;
      const st = p?.getPlayerState?.();
      const sendPos = id && (st === window.YT?.PlayerState?.PLAYING || st === window.YT?.PlayerState?.PAUSED);
      api('POST', '/player/heartbeat', sendPos ? { requestId: id, positionSec: Math.floor(p.getCurrentTime()) } : {}).catch(() => {});
    }, 5000);
    // Vigilante: si deberia estar sonando (el DJ no pauso) y el reproductor esta detenido, lo reanuda.
    // Cubre el caso de que el navegador pause el video al cambiar de pestana o ventana.
    const watchdog = setInterval(() => {
      const p = playerRef.current;
      if (!armedRef.current || !readyRef.current || !loadedId.current || lastPaused.current || !p?.getPlayerState) return;
      const st = p.getPlayerState();
      const PS = window.YT.PlayerState;
      if (st === PS.PAUSED || st === PS.CUED || st === PS.UNSTARTED) {
        console.info('[TV] video detenido (estado ' + st + ', hidden=' + document.hidden + '): reanudando');
        p.playVideo();
      }
    }, 1500);
    // Al volver a la pestana, asegura que el video siga sonando si no esta en pausa
    const onVisible = () => {
      const p = playerRef.current;
      if (!document.hidden && armedRef.current && loadedId.current && !lastPaused.current && p?.getPlayerState?.() === window.YT.PlayerState.PAUSED) p.playVideo();
      if (!document.hidden) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      dead = true;
      off();
      clearInterval(poll);
      clearInterval(beat);
      clearInterval(watchdog);
      readyRef.current = false;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [load]);

  async function start() {
    armedRef.current = true;
    setArmed(true);
    claimRef.current(); // esta pantalla pasa a ser la TV activa del bar
    try {
      await api('POST', '/player/next');
    } catch (e: any) {
      setErr(e.message);
    }
    const s = await api('GET', '/player/state');
    stateRef.current = s;
    setState(s);
    sync(s, true);
  }

  const cur = state?.current;
  const noSession = state && !state.session;
  const idle = !cur;
  // Aviso entre canciones: se muestra hasta que el video nuevo empieza a sonar
  const transition = armed && !!cur && !playing && !blocked && !slow;
  useEffect(() => {
    if (!transition) return;
    const t = setTimeout(() => setSlow(true), 15000);
    return () => clearTimeout(t);
  }, [transition, cur?.id]);

  return (
    <div className="fixed inset-0 bg-black text-white">
      {replaced && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-zinc-950 p-8 text-center">
          <div className="text-5xl">📺</div>
          <div className="text-3xl font-bold">Otra pantalla tomó el control</div>
          <p className="max-w-lg text-lg text-zinc-400">
            Se abrió el karaoke en otra pantalla, así que esta se detuvo para no duplicar el sonido. Si prefieres usar esta, pulsa el botón.
          </p>
          <button onClick={() => location.reload()} className="rounded-2xl bg-pink-600 px-10 py-4 text-2xl font-bold hover:bg-pink-500">
            Usar esta pantalla
          </button>
        </div>
      )}
      <div className="absolute inset-0">
        <div ref={hostRef} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" />

        {/* Entre canciones: nombre del bar mientras carga el siguiente video */}
        <div
          className={`pointer-events-none absolute inset-0 z-[5] flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-zinc-950 via-fuchsia-950 to-zinc-950 p-8 text-center transition-opacity duration-500 ${transition ? 'opacity-100' : 'opacity-0'}`}
        >
          <div className="tv-brand text-7xl font-extrabold md:text-9xl">{state?.business?.name ?? 'Karaoke'}</div>
        </div>

        {(!armed || idle || blocked) && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-zinc-950 via-fuchsia-950 to-zinc-950 p-8 text-center">
            <div className="text-6xl font-extrabold md:text-8xl">{state?.business?.name ?? 'Karaoke'}</div>
            {err && <div className="text-xl text-red-400">{err}</div>}
            {noSession ? (
              <div className="text-3xl text-zinc-300">Esperando que el DJ inicie la sesion...</div>
            ) : !armed ? (
              <button onClick={start} className="rounded-2xl bg-pink-600 px-12 py-6 text-4xl font-bold hover:bg-pink-500">
                Iniciar karaoke
              </button>
            ) : blocked ? (
              <button onClick={() => { playerRef.current?.playVideo(); setBlocked(false); }} className="rounded-2xl bg-pink-600 px-12 py-6 text-4xl font-bold">
                Pulsa para continuar
              </button>
            ) : (
              <div className="text-3xl text-zinc-300">Escanea el QR de tu mesa y pide tu cancion</div>
            )}
          </div>
        )}
      </div>

      {/* Franja superior sobre el video (no tapa los controles de abajo) */}
      {cur && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-6 bg-gradient-to-b from-black/80 to-transparent px-8 pb-10 pt-4">
          <div className="min-w-0">
            <div className="truncate text-2xl font-bold drop-shadow">{cur.title}</div>
            <div className="text-lg text-pink-400">{cur.tableName}</div>
          </div>
          <div className="min-w-0 text-right">
            <div className="text-xs uppercase text-zinc-400">Siguiente</div>
            <div className="truncate text-lg drop-shadow">{state?.next ? `${state.next.title} · ${state.next.tableName}` : 'Sin canciones en cola'}</div>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute right-4 top-4 z-30 flex gap-2">
        {!online && <div className="rounded bg-red-700 px-3 py-1 text-sm">Sin conexion</div>}
        {state?.session?.paused && <div className="rounded bg-amber-600 px-3 py-1 text-sm">En pausa</div>}
      </div>
    </div>
  );
}
