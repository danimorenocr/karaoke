import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;

/** Carga una sola vez la API de reproductores de YouTube. */
function loadYouTubeApi(): Promise<void> {
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
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
  return apiPromise;
}

export interface ProbeItem {
  id: string; // id de la solicitud
  videoId: string;
}
export type ProbeOutcome = 'ok' | 'error' | 'timeout';

const PROBE_TIMEOUT_MS = 10_000; // si no arranca en 10 s no se sabe: se deja pasar y la TV decide
const BETWEEN_MS = 400; // respiro entre una prueba y la siguiente

/**
 * Reproductor oculto (fuera de pantalla y en silencio) que comprueba, una por una, que YouTube deje
 * reproducir las canciones pedidas ANTES de que lleguen a la TV. Cada resultado se avisa con onResult
 * y el panel lo reporta al backend: si YouTube confirma el bloqueo, la solicitud se rechaza sola y la
 * mesa elige otra. Un "timeout" no rechaza nada (puede ser la red del local): la TV es la ultima palabra.
 */
export default function SongProbe({ items, onResult }: { items: ProbeItem[]; onResult: (id: string, outcome: ProbeOutcome, code?: number) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const readyRef = useRef(false);
  const busyRef = useRef<string | null>(null); // solicitud en prueba
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seenRef = useRef<Set<string>>(new Set()); // ya encoladas o probadas en esta apertura del panel
  const queueRef = useRef<ProbeItem[]>([]);
  const resultRef = useRef(onResult);
  resultRef.current = onResult;

  const finish = (outcome: ProbeOutcome, code?: number) => {
    const id = busyRef.current;
    if (!id) return; // evento suelto (ej. del video anterior): se ignora
    busyRef.current = null;
    clearTimeout(timerRef.current);
    try { playerRef.current?.stopVideo?.(); } catch { /* reproductor no listo */ }
    resultRef.current(id, outcome, code);
    setTimeout(pump, BETWEEN_MS);
  };

  const pump = () => {
    if (!readyRef.current || busyRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    busyRef.current = next.id;
    try {
      playerRef.current.loadVideoById(next.videoId);
      timerRef.current = setTimeout(() => finish('timeout'), PROBE_TIMEOUT_MS);
    } catch {
      busyRef.current = null;
      setTimeout(pump, BETWEEN_MS);
    }
  };

  // Reproductor unico, creado al abrir el panel. Mudo para que el navegador lo deje sonar sin interaccion.
  useEffect(() => {
    let dead = false;
    loadYouTubeApi().then(() => {
      if (dead || !hostRef.current || playerRef.current) return;
      const el = document.createElement('div');
      hostRef.current.appendChild(el);
      playerRef.current = new window.YT.Player(el, {
        width: '2',
        height: '2',
        playerVars: { autoplay: 1, rel: 0, playsinline: 1, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3 },
        events: {
          onReady: () => {
            try { playerRef.current?.mute?.(); } catch { /* si no se puede mutar, la prueba sigue */ }
            readyRef.current = true;
            pump();
          },
          onStateChange: (e: any) => {
            if (e.data === window.YT.PlayerState.PLAYING) finish('ok');
          },
          onError: (e: any) => finish('error', Number(e?.data) || undefined),
        },
      });
    });
    return () => {
      dead = true;
      clearTimeout(timerRef.current);
      try { playerRef.current?.destroy?.(); } catch { /* ya destruido */ }
      playerRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Encola las solicitudes nuevas que llegan del panel (sin repetir las ya vistas en esta apertura)
  useEffect(() => {
    let added = false;
    for (const it of items) {
      if (!it?.videoId || seenRef.current.has(it.id)) continue;
      seenRef.current.add(it.id);
      if (busyRef.current === it.id) continue;
      queueRef.current.push(it);
      added = true;
    }
    if (added) pump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  return <div ref={hostRef} aria-hidden style={{ position: 'fixed', left: -9999, top: 0, width: 2, height: 2, overflow: 'hidden', pointerEvents: 'none' }} />;
}
