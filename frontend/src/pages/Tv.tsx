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
  const [banner, setBanner] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [hold, setHold] = useState(false); // pausa entre canciones: aviso en pantalla mientras se pasan los microfonos
  const holdRef = useRef(false);
  const [bar, setBar] = useState<{ start: number; ms: number } | null>(null); // barra de carga del aviso entre canciones
  const endedAt = useRef<number | null>(null); // cuando termino la ultima cancion: desde ahi cuenta la pausa
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function endHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    holdRef.current = false;
    setHold(false);
  }

  /** Alinea el reproductor con lo que dice el backend. */
  function sync(s: any, forceReload = false) {
    const p = playerRef.current;
    // El reproductor solo tiene sus metodos (loadVideoById, etc.) despues de onReady
    if (!p || !armedRef.current || !readyRef.current || replacedRef.current) return;
    const cur = s.current;
    if (!cur) {
      endHold();
      setBar(null);
      endedAt.current = null;
      if (loadedId.current) p.stopVideo?.();
      loadedId.current = null;
      setPlaying(false);
      return;
    }
    if (cur.id !== loadedId.current || forceReload) {
      const isNew = cur.id !== loadedId.current;
      const firstLoad = loadedId.current === null; // solo al recargar la pagina se retoma a mitad de cancion
      loadedId.current = cur.id;
      reported.current = null;
      setBlocked(false);
      setPlaying(false);
      setSlow(false);
      endHold();
      // Si la TV se recargo (o el servidor reinicio) a mitad de cancion, retoma donde iba
      const pos = isNew && !firstLoad ? 0 : Number(s.session?.positionSec ?? 0);
      const start = () => p.loadVideoById({ videoId: cur.videoId, startSeconds: pos > 5 ? pos - 2 : 0 });
      const sec = Number(s.business?.tvInterludeSec ?? 8);
      lastPaused.current = false;
      if (isNew && sec > 0 && pos <= 5) {
        // Pausa entre canciones: se muestra el aviso y el video arranca al terminar la cuenta.
        // La cuenta empieza cuando termino la cancion anterior (no cuando llega la nueva) para que sean `sec` en total.
        const since = endedAt.current && Date.now() - endedAt.current < sec * 1000 ? Date.now() - endedAt.current : 0;
        if (!since) setBar({ start: Date.now(), ms: sec * 1000 });
        p.stopVideo?.();
        holdRef.current = true;
        setHold(true);
        holdTimer.current = setTimeout(() => {
          holdTimer.current = null;
          holdRef.current = false;
          endedAt.current = null;
          setHold(false);
          setBar(null);
          if (loadedId.current !== cur.id || replacedRef.current) return;
          start();
          if (stateRef.current) sync(stateRef.current); // respeta una pausa del DJ que llego durante la espera
        }, sec * 1000 - since);
        return;
      }
      endedAt.current = null;
      setBar(null);
      start();
    }
    if (holdRef.current) return;
    const paused = !!s.session?.paused;
    if (paused !== lastPaused.current) {
      lastPaused.current = paused;
      paused ? p.pauseVideo?.() : p.playVideo?.();
    }
  }

  async function report(kind: 'ended' | 'error', code?: number) {
    const id = loadedId.current;
    if (!id || reported.current === id) return;
    reported.current = id;
    try {
      await api('POST', `/player/${kind}`, code ? { requestId: id, code } : { requestId: id });
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
              const sec = Number(stateRef.current?.business?.tvInterludeSec ?? 8);
              if (sec > 0) { endedAt.current = Date.now(); setBar({ start: Date.now(), ms: sec * 1000 }); }
              report('ended');
            }
            if (e.data === window.YT.PlayerState.PLAYING) { setBlocked(false); setPlaying(true); }
            // Pausa que no vino del DJ (p.ej. el navegador pausa al ocultar la pestana): reanudar.
            if (e.data === window.YT.PlayerState.PAUSED && armedRef.current && loadedId.current && !lastPaused.current && !holdRef.current) {
              console.info('[TV] pausa que no vino del DJ (hidden=' + document.hidden + '): reanudando');
              setTimeout(() => {
                if (!lastPaused.current && playerRef.current?.getPlayerState?.() === window.YT.PlayerState.PAUSED) playerRef.current.playVideo();
              }, 100);
            }
          },
          onError: (e: any) => report('error', Number(e?.data) || undefined), // video eliminado / no incrustable / etc.
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
      if (name === 'playback.resumed' && armedRef.current && !holdRef.current) { lastPaused.current = false; playerRef.current?.playVideo?.(); }
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
      const sendPos = id && !holdRef.current && (st === window.YT?.PlayerState?.PLAYING || st === window.YT?.PlayerState?.PAUSED);
      api('POST', '/player/heartbeat', sendPos ? { requestId: id, positionSec: Math.floor(p.getCurrentTime()) } : {}).catch(() => {});
    }, 5000);
    // Vigilante: si deberia estar sonando (el DJ no pauso) y el reproductor esta detenido, lo reanuda.
    // Cubre el caso de que el navegador pause el video al cambiar de pestana o ventana.
    const watchdog = setInterval(() => {
      const p = playerRef.current;
      if (!armedRef.current || !readyRef.current || !loadedId.current || lastPaused.current || holdRef.current || !p?.getPlayerState) return;
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
      if (!document.hidden && armedRef.current && loadedId.current && !lastPaused.current && !holdRef.current && p?.getPlayerState?.() === window.YT.PlayerState.PAUSED) p.playVideo();
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
      if (holdTimer.current) clearTimeout(holdTimer.current);
      readyRef.current = false;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [load]);

  // Sonido de transicion (sintetizado, sin archivos). El audio solo se desbloquea tras un clic en la TV.
  const audioRef = useRef<AudioContext | null>(null);
  function unlockAudio() {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioRef.current) audioRef.current = new AC();
      audioRef.current.resume?.();
    } catch { /* sin audio: el interlude funciona igual */ }
  }
  function chime(kind: 'in' | 'next' | 'score') {
    const ctx = audioRef.current;
    if (!ctx || ctx.state !== 'running') return;
    const notes = kind === 'in' ? [523.25, 659.25, 783.99, 1046.5] : kind === 'score' ? [659.25, 880, 1318.5] : [783.99, 1174.66];
    const step = kind === 'in' ? 0.13 : kind === 'score' ? 0.12 : 0.16;
    const t0 = ctx.currentTime + 0.02;
    notes.forEach((f, i) => {
      const t = t0 + i * step;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'in' ? 1.1 : 0.8));
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.2);
    });
  }

  async function start() {
    unlockAudio();
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

  // Imagen del bar para el aviso entre canciones: se pide solo cuando cambia
  const bannerAt = state?.business?.tvBannerAt ?? null;
  useEffect(() => {
    if (!bannerAt) { setBanner(null); return; }
    api('GET', '/player/banner').then((r) => setBanner(r.banner ?? null)).catch(() => {});
  }, [bannerAt]);

  const logoAt = state?.business?.logoAt ?? null;
  useEffect(() => {
    if (!logoAt) { setLogo(null); return; }
    api('GET', '/player/logo').then((r) => setLogo(r.logo ?? null)).catch(() => {});
  }, [logoAt]);

  const cur = state?.current;
  // Fondo de la transmision: el color de marca del bar muy oscurecido (en vez de negro puro)
  const brand = /^#[0-9a-f]{6}$/i.test(state?.business?.primaryColor ?? '') ? state.business.primaryColor : null;
  const tvBg = brand ? `color-mix(in srgb, ${brand} 24%, #000)` : '#000';
  const noSession = state && !state.session;
  const idle = !cur;
  // Aviso entre canciones: se muestra hasta que el video nuevo empieza a sonar
  const transition = armed && !!cur && (hold || (!playing && !blocked && !slow));
  const logoSrc = logo ?? "/logo.png"; // sin logo propio, el de TONO (igual que la pantalla de inicio)
  const bigImg = banner ?? logoSrc; // imagen grande del interlude: la del bar o, si no hay, el logo
  const hasBanner = !!bigImg;
  // Modo competencia: pantalla de votacion (con cuenta regresiva) y, al cerrar, el aviso de la siguiente mesa.
  // Sin competencia: imagen del bar a pantalla completa (60% del tiempo) y luego la mesa y cancion que siguen.
  const voteSec: number | null = state?.business?.voteSec ?? null;
  const scoreSec: number = state?.business?.scoreSec ?? 0; // marcador general (solo acumulado por mesa)
  // El resultado de la votacion deja de venir del servidor al cerrarse la ventana: se conserva durante el interlude.
  const [snap, setSnap] = useState<any>(null);
  useEffect(() => { if (state?.vote) setSnap(state.vote); }, [state?.vote]);
  useEffect(() => { if (!transition) setSnap(null); }, [transition]);
  const vt = state?.vote ?? snap;
  const voteExpected = voteSec != null && (!!vt || (!!cur && cur.id === finishedId));
  const [showNext, setShowNext] = useState(false);
  useEffect(() => {
    setShowNext(false);
    if (!transition || !bar) return;
    const left = bar.start + (voteExpected ? (voteSec! + (vt?.ranking ? scoreSec : 0)) * 1000 : bar.ms * 0.6) - Date.now();
    if (left <= 0) { setShowNext(true); return; }
    const t = setTimeout(() => setShowNext(true), left);
    return () => clearTimeout(t);
  }, [transition, bar?.start, bar?.ms, voteExpected, voteSec, scoreSec, !!vt?.ranking]);
  const [tick, setTick] = useState(0);
  const ticking = transition && voteExpected;
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [ticking]);
  void tick;
  const elapsed = bar ? Date.now() - bar.start : 0;
  const inCompetition = transition && voteExpected && !!bar && !showNext;
  const votePhase = inCompetition && elapsed < voteSec! * 1000;
  const scorePhase = inCompetition && !votePhase && scoreSec > 0 && !!vt?.ranking;
  const bannerPhase = transition && hasBanner && !!bar && !showNext && !voteExpected;
  const fallbackInterlude = transition && !bannerPhase && !votePhase && !scorePhase; // ya paso la imagen / la votacion: pantalla con la mesa que sigue
  const voteLeft = votePhase && bar && voteSec != null ? Math.max(0, Math.ceil((bar.start + voteSec * 1000 - Date.now()) / 1000)) : 0;
  useEffect(() => { if (votePhase) chime('in'); }, [votePhase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (scorePhase) chime('score'); }, [scorePhase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (bannerPhase) chime('in'); }, [bannerPhase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (fallbackInterlude && !blocked) chime('next'); }, [fallbackInterlude]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!transition) return;
    const t = setTimeout(() => setSlow(true), 15000);
    return () => clearTimeout(t);
  }, [transition, cur?.id]);

  return (
    <div className="fixed inset-0 text-white" style={{ background: tvBg }}>
      <style>{`
              @keyframes tv-in{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
              @keyframes tv-glow{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.08)}}
              @keyframes tv-eq{0%,100%{height:12%}50%{height:100%}}
              @keyframes tv-pulse{0%,100%{box-shadow:0 0 0 0 #a9b8ff66}50%{box-shadow:0 0 0 18px transparent}}
              .tv-idle>*{animation:tv-in .9s both cubic-bezier(.2,.7,.2,1)}
              .tv-idle>*:nth-child(3){animation-delay:.12s}.tv-idle>*:nth-child(4){animation-delay:.24s}.tv-idle>*:nth-child(5){animation-delay:.36s}.tv-idle>*:nth-child(6){animation-delay:.48s}
              .tv-idle>.tv-glow{animation:tv-glow 6s ease-in-out infinite}
              .tv-btn{animation:tv-pulse 2.4s infinite;transition:transform .2s,filter .2s}.tv-btn:hover{transform:scale(1.04);filter:brightness(1.08)}.tv-btn:active{transform:scale(.97)}
              .tv-eq i{display:block;width:.6rem;border-radius:9px;background:#a9b8ff;animation:tv-eq 1.2s ease-in-out infinite}
              @keyframes tv-kb{from{opacity:0;transform:scale(.96)}15%{opacity:1}to{opacity:1;transform:scale(1.03)}}
              @keyframes tv-next{0%,100%{box-shadow:0 0 0 0 #a9b8ff55}50%{box-shadow:0 0 60px 6px #a9b8ff33}}
              @keyframes tv-bar{from{width:0}to{width:100%}}
      .tv-bar{background:#a9b8ff;box-shadow:0 0 14px #a9b8ffaa;animation:tv-bar linear both}
      .tv-banner-anim{animation:tv-kb 12s ease-out both}
              @keyframes tv-up{from{opacity:0;transform:translateY(5vh) scale(.97)}to{opacity:1;transform:none}}
              @keyframes tv-ring{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.9);opacity:0}}
              @keyframes tv-dot{0%,100%{opacity:1}50%{opacity:.25}}
              .tv-dot{animation:tv-dot 1s ease-in-out infinite}
              .tv-up{animation:tv-up .8s both cubic-bezier(.2,.7,.2,1)}
              .tv-ring{animation:tv-ring 1.8s ease-out infinite}
              .tv-next{animation:tv-next 2.2s ease-in-out infinite}
              @media (prefers-reduced-motion:reduce){.tv-idle *,.tv-banner-anim{animation:none!important}}
            `}</style>
      {replaced && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-[#05060a] p-8 text-center" style={{ fontFamily: "'Nunito', system-ui, sans-serif" }}>
          <div className="grid h-20 w-20 place-items-center rounded-3xl" style={{ background: '#a9b8ff22', color: '#a9b8ff' }}><svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 6h18v12H3zM8 21h8" /></svg></div>
          <div className="text-3xl font-bold">Otra pantalla tomó el control</div>
          <p className="max-w-lg text-lg text-zinc-400">
            Se abrió el karaoke en otra pantalla, así que esta se detuvo para no duplicar el sonido. Si prefieres usar esta, pulsa el botón.
          </p>
          <button onClick={() => location.reload()} className="rounded-2xl bg-[#a9b8ff] px-10 py-4 text-2xl font-extrabold text-[#0b1030] hover:brightness-110">
            Usar esta pantalla
          </button>
        </div>
      )}
      <div className="absolute inset-0">
        <div ref={hostRef} className="absolute inset-x-0 bottom-0 top-[11vh] [&>iframe]:h-full [&>iframe]:w-full" />

        {/* Interlude, fase 1: imagen del bar centrada sobre su propio fondo difuminado */}
        {bigImg && (
          <div
            className={`pointer-events-none absolute inset-0 z-[5] overflow-hidden bg-[#1c1c20] transition-opacity duration-500 ${bannerPhase ? 'opacity-100' : 'opacity-0'}`}
            style={{ fontFamily: "'Nunito', system-ui, sans-serif" }}
          >
            <img src={bigImg} alt="" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-70 blur-[90px]" draggable={false} />
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/25 to-black/70" />
            <div className="absolute inset-0 flex items-center justify-center pb-[9vh]">
              <img key={bannerPhase ? (bar?.start ?? cur?.id) : 'off'} src={bigImg} alt="" className={`max-h-[68vh] max-w-[80vw] object-contain shadow-[0_30px_80px_rgba(0,0,0,.55)] ${bannerPhase ? 'tv-banner-anim' : ''}`} draggable={false} />
            </div>
            <div className="absolute inset-x-0 bottom-[7vh] text-center text-2xl font-semibold text-slate-200/90 md:text-3xl">
              Pide tu canción desde tu mesa · <span className="font-bold text-[#a9c0ff]">escanea el QR</span>
            </div>
            <div className="absolute bottom-[3.5vh] right-[4vw] flex items-baseline gap-3 text-slate-300/80">
              <span className="text-xl font-semibold md:text-2xl">con</span>
              <span className="text-3xl font-black tracking-[0.2em] md:text-5xl" style={{ color: '#e8e4dc' }}>TONO</span>
            </div>
          </div>
        )}

        {/* Modo competencia: pantalla de votacion con puntaje en vivo; se cierra cuando pasa a la siguiente mesa */}
        {votePhase && bar && voteSec != null && (() => {
          const dist: number[] = vt?.dist ?? [0, 0, 0, 0, 0];
          const count: number = vt?.count ?? 0;
          const title = vt?.title ?? cur?.title ?? '';
          const who = vt ? vt.tableName : cur?.auto ? null : cur?.tableName;
          return (
            <div key={bar.start} className="tv-up absolute inset-0 z-[15] overflow-hidden text-center" style={{ fontFamily: "'Nunito', system-ui, sans-serif", background: tvBg }}>
              <div className="tv-glow absolute left-1/2 top-[42%] h-[85vmin] w-[85vmin] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" style={{ background: 'radial-gradient(circle,#fbbf2433,transparent 65%)' }} />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-[2.2vh] px-[6vw] pb-[10vh]">
                <img src={logoSrc} alt="" className="h-[13vh] max-w-[40vw] object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,.5)]" draggable={false} />
                <div className="flex items-center gap-3 rounded-full border border-amber-300/40 bg-amber-300/10 px-6 py-2 text-xl font-extrabold uppercase tracking-[0.3em] text-amber-300 md:text-2xl">
                  <span className="tv-dot h-3 w-3 rounded-full bg-red-500" /> Competencia · Votación abierta
                </div>
                <div className="text-2xl font-semibold text-slate-300 md:text-4xl">{who ? 'Acaba de cantar' : 'Acaba de sonar'}</div>
                {who && <div className="max-w-[88vw] truncate bg-gradient-to-b from-white to-[#ffe9a8] bg-clip-text pb-1 text-7xl font-black leading-tight text-transparent md:text-[8rem]">{who}</div>}
                <div className="max-w-[84vw] truncate text-3xl font-bold text-slate-200 md:text-5xl">{title}</div>
                <div className="mt-[1vh] flex items-end gap-4">
                  <span className={`font-black leading-none tabular-nums ${vt?.ranking ? 'text-7xl md:text-[6.5rem]' : 'text-8xl md:text-[10rem]'}`} style={{ color: '#fbbf24' }}>{count > 0 ? vt.avg : '—'}</span>
                  <span className="pb-2 text-4xl text-amber-300 md:text-6xl" aria-hidden>★</span>
                </div>
                <div className="text-xl text-slate-300 md:text-3xl">{count > 0 ? `${count} voto${count === 1 ? '' : 's'} del público` : 'Esperando los votos del público…'}</div>
                {vt?.ranking ? null : (
                <div className="grid w-full max-w-2xl gap-1.5">
                  {[5, 4, 3, 2, 1].map((n) => (
                    <div key={n} className="flex items-center gap-3 text-lg text-slate-300 md:text-2xl">
                      <span className="w-12 text-right">{n} ★</span>
                      <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-amber-400 transition-all duration-500" style={{ width: count ? `${(dist[n - 1] / count) * 100}%` : '0%' }} /></div>
                      <span className="w-10 text-left">{dist[n - 1]}</span>
                    </div>
                  ))}
                </div>
                )}
              </div>
              <div className="absolute inset-x-0 bottom-[3.2vh] px-[6vw] text-center">
                <div className="text-xl font-semibold text-slate-200 md:text-3xl">
                  Escanea el QR de tu mesa y <span className="font-extrabold text-amber-300">califica la actuación</span> · la votación cierra en <span className="font-extrabold tabular-nums text-white">{voteLeft}s</span>
                </div>
                <div className="mx-auto mt-3 h-3 w-full max-w-4xl overflow-hidden rounded-full bg-white/15">
                  <div className="tv-bar h-full" style={{ animationDuration: `${voteSec * 1000}ms`, background: '#fbbf24', boxShadow: '0 0 14px #fbbf24aa' }} />
                </div>
              </div>
            </div>
          );
        })()}

        {/* Modo competencia (acumulado por mesa): marcador general con puntos, estilo concurso */}
        {scorePhase && bar && vt?.ranking && (() => {
          const rk: any[] = vt.ranking;
          const top = rk.slice(0, 5);
          const cu = rk.find((x) => x.current);
          const rows = cu && !top.includes(cu) ? [...top.slice(0, 4), cu] : top;
          const gained = (vt.dist as number[]).reduce((a, c, i) => a + c * (i + 1), 0);
          const tile = ['linear-gradient(90deg,#f59e0b,#fbbf24)', 'linear-gradient(90deg,#94a3b8,#cbd5e1)', 'linear-gradient(90deg,#b45309,#d97706)'];
          return (
            <div key={bar.start} className="absolute inset-0 z-[15] overflow-hidden text-center" style={{ fontFamily: "'Nunito', system-ui, sans-serif", background: tvBg }}>
              <div className="tv-glow absolute left-1/2 top-[35%] h-[90vmin] w-[90vmin] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" style={{ background: 'radial-gradient(circle,#fbbf2430,transparent 65%)' }} />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-[2.5vh] px-[6vw]">
                <img src={logoSrc} alt="" className="tv-up h-[20vh] max-w-[55vw] object-contain drop-shadow-[0_12px_40px_rgba(0,0,0,.55)]" draggable={false} />
                <div className="tv-up text-[3.4vh] font-extrabold uppercase tracking-[0.4em] text-amber-300" style={{ animationDelay: '.1s' }}>Marcador general</div>
                <div className="grid w-full max-w-5xl gap-[1.4vh]">
                  {rows.map((x, i) => {
                    const pos = rk.indexOf(x) + 1;
                    const medal = pos <= 3;
                    return (
                      <div key={x.tableName} className="tv-up flex items-center gap-[2vw] rounded-2xl px-[2vw] py-[1.2vh] shadow-xl" style={{ animationDelay: `${0.15 + i * 0.12}s`, background: medal ? tile[pos - 1] : 'rgba(255,255,255,.09)', color: medal ? '#1a1208' : '#f1f5f9', outline: x.current ? '4px solid #fff' : 'none' }}>
                        <span className="w-[7vh] text-[5vh] font-black leading-none">{pos}º</span>
                        <span className="min-w-0 flex-1 truncate text-left text-[5vh] font-extrabold leading-tight">{x.tableName}</span>
                        {x.current && gained > 0 && <span className="rounded-full bg-black/80 px-[1.4vw] py-[0.4vh] text-[3vh] font-black text-amber-300">+{gained}</span>}
                        <span className="text-right text-[6vh] font-black leading-none tabular-nums">{x.points}<span className="ml-2 text-[2.8vh] font-bold opacity-70">pts</span></span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Interlude, fase 2: quien sigue y que va a cantar */}
        {fallbackInterlude && armed && !blocked && cur && (
          <div className="absolute inset-0 z-10 overflow-hidden bg-[#07080f] text-center" style={{ fontFamily: "'Nunito', system-ui, sans-serif" }}>
            <img src={bigImg} alt="" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-[100px]" draggable={false} />
            <div className="tv-glow absolute left-1/2 top-[46%] h-[80vmin] w-[80vmin] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" style={{ background: 'radial-gradient(circle,#7c8cff40,transparent 65%)' }} />
            <div key={cur.id} className="tv-up absolute inset-0 flex flex-col items-center justify-center gap-[3vh] px-[6vw] pb-[8vh]">
              <div className="text-2xl font-bold uppercase tracking-[0.4em] text-[#a9b8ff] md:text-4xl">{cur.auto ? 'Sigue' : 'Sigue la mesa'}</div>
              <div className="max-w-[88vw] truncate bg-gradient-to-b from-white to-[#c9d2ff] bg-clip-text pb-2 text-7xl font-black leading-tight tracking-tight text-transparent md:text-[9rem]">
                {cur.auto ? 'La música de TONO' : cur.tableName}
              </div>
              {!cur.auto && (
                <div className="flex max-w-[84vw] items-center gap-4 rounded-full border border-white/15 bg-white/[0.07] px-8 py-4 backdrop-blur-md">
                  <svg viewBox="0 0 24 24" className="h-8 w-8 shrink-0 text-[#a9b8ff]" fill="currentColor" aria-hidden><path d="M9 18V5l12-2v13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                  <span className="truncate text-3xl font-bold text-slate-100 md:text-5xl">{cur.title}</span>
                </div>
              )}
              {state?.next && (
                <div className="mt-2 max-w-[80vw] truncate text-xl text-slate-400 md:text-3xl">
                  Después: <span className="text-slate-200">{state.next.auto ? 'La música de TONO' : `${state.next.tableName} · ${state.next.title}`}</span>
                </div>
              )}
            </div>
            <div className="absolute inset-x-0 bottom-[4.5vh] text-center text-xl font-semibold text-slate-300/80 md:text-2xl">
              Pide tu canción desde tu mesa · <span className="font-bold text-[#a9c0ff]">escanea el QR</span>
            </div>
          </div>
        )}

        {(!armed || idle || blocked) && (
          <div className="tv-idle absolute inset-0 z-10 flex flex-col items-center justify-center gap-7 overflow-hidden bg-[#05060a] p-8 text-center" style={{ fontFamily: "'Nunito', system-ui, sans-serif" }}>
            <div className="tv-glow pointer-events-none absolute left-1/2 top-1/2 h-[70vmin] w-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" style={{ background: 'radial-gradient(circle,#a9b8ff33,transparent 65%)' }} />
            <img src={logo ?? '/logo.png'} alt={state?.business?.name ?? 'TONO'} className="relative h-28 w-auto max-w-[60vw] object-contain md:h-40" draggable={false} />
            <div className="relative text-6xl font-black tracking-tight md:text-8xl" style={{ color: '#f5ecdc' }}>{state?.business?.name ?? 'Karaoke'}</div>
            {err && <div className="relative rounded-2xl border border-red-400/30 bg-red-500/15 px-6 py-3 text-xl text-red-200">{err}</div>}
            {noSession ? (
              <div className="relative flex items-center gap-4 text-2xl text-slate-300 md:text-3xl">
                <span className="tv-eq flex h-8 items-end gap-1" aria-hidden>{[0, 0.2, 0.4, 0.1, 0.3].map((d) => <i key={d} style={{ animationDelay: `${d}s` }} />)}</span>
                Esperando que el DJ inicie la sesión…
              </div>
            ) : !armed ? (
              <button onClick={start} className="tv-btn relative rounded-full px-14 py-6 text-3xl font-extrabold text-[#0b1030] md:text-4xl" style={{ background: '#a9b8ff' }}>
                Iniciar transmisión
              </button>
            ) : blocked ? (
              <button onClick={() => { unlockAudio(); playerRef.current?.playVideo(); setBlocked(false); }} className="tv-btn relative rounded-full px-14 py-6 text-3xl font-extrabold text-[#0b1030] md:text-4xl" style={{ background: '#a9b8ff' }}>
                Pulsa para continuar
              </button>
            ) : cur && cur.id !== finishedId ? (
              <div key={cur.id} className="relative flex flex-col items-center gap-3">
                <div className="text-xl font-bold uppercase tracking-[0.3em] text-[#a9b8ff] md:text-3xl">{cur.auto ? 'Sigue' : 'Sigue la mesa'}</div>
                <div className="tv-next rounded-3xl border border-[#a9b8ff]/40 bg-[#a9b8ff]/10 px-12 py-4 text-6xl font-black md:text-8xl" style={{ color: '#f5ecdc' }}>
                  {cur.auto ? 'La música de TONO' : cur.tableName}
                </div>
                {!cur.auto && <div className="max-w-3xl truncate text-xl text-slate-300 md:text-3xl">{cur.title}</div>}
              </div>
            ) : cur ? (
              <div className="relative h-24" aria-hidden />
            ) : (
              <div className="relative flex items-center gap-4 text-2xl text-slate-300 md:text-3xl">
                <span className="tv-eq flex h-8 items-end gap-1" aria-hidden>{[0, 0.2, 0.4, 0.1, 0.3].map((d) => <i key={d} style={{ animationDelay: `${d}s` }} />)}</span>
                Escanea el QR de tu mesa y pide tu canción
              </div>
            )}
          </div>
        )}
      </div>

      {/* Barra de carga del aviso entre canciones */}
      {bar && transition && !votePhase && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[40] h-2 bg-white/15" aria-hidden>
          <div key={bar.start} className="tv-bar h-full" style={{ animationDuration: `${bar.ms}ms` }} />
        </div>
      )}

      {/* Cabecera fija: logo del local, cancion y mesa a la izquierda; siguiente y marca TONO a la derecha */}
      {cur && !transition && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-[11vh] min-h-[84px] items-center justify-between gap-6 px-[2.2vw]" style={{ fontFamily: "'Nunito', system-ui, sans-serif", background: tvBg }}>
          <div className="flex min-w-0 items-center gap-5">
            <img src={logoSrc} alt="" className="h-[7vh] max-h-16 min-h-[48px] w-auto max-w-[14vw] shrink-0 rounded-md bg-black object-contain" draggable={false} />
            <div className="h-[6vh] w-px shrink-0 bg-white/15" />
            <div className="min-w-0">
              <div className="truncate text-3xl font-extrabold leading-tight text-white md:text-4xl">{cur.title}</div>
            </div>
          </div>
          <div className="flex min-w-0 shrink-0 items-center gap-5">
            {!cur.auto && cur.tableName && (
              <span className="shrink-0 rounded-full bg-[#a9c0ff] px-7 py-2 text-3xl font-extrabold text-[#0b1030] md:text-4xl">{cur.tableName}</span>
            )}
            <img src="/favicon.png" alt="TONO" className="h-[7vh] max-h-14 min-h-[40px] w-auto rounded-xl opacity-90" draggable={false} />
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute right-4 top-24 z-30 flex gap-2">
        {!online && <div className="rounded bg-red-700 px-3 py-1 text-sm">Sin conexion</div>}
        {state?.session?.paused && <div className="rounded bg-amber-600 px-3 py-1 text-sm">En pausa</div>}
      </div>
    </div>
  );
}
