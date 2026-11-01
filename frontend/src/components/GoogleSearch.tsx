import { useEffect } from 'react';

/**
 * Respaldo de busqueda: Google Programmable Search Element limitado a youtube.com.
 * Se usa solo cuando la cuota de la API de YouTube se agota. Los resultados de Google se muestran
 * visibles (incluidos sus anuncios); ademas entregamos los videos encontrados para poder pedirlos.
 */
export const GOOGLE_CSE_ID: string | undefined = import.meta.env.VITE_GOOGLE_CSE_ID || undefined;

export interface GoogleItem {
  videoId: string;
  title: string;
  thumbnail: string;
}

const GNAME = 'karaokeyt';
const CALLBACK = '__karaokeCseReady';
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://cse.google.com/cse.js?cx=${GOOGLE_CSE_ID}`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { scriptPromise = null; reject(new Error('No se pudo cargar el buscador de Google')); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

const VIDEO = /(?:youtube\.com\/watch\?(?:[^#]*&)?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/;

/** Convierte lo que entrega Google en videos reales (descarta canales, playlists y otras paginas). */
function parse(args: unknown[]): GoogleItem[] {
  const lists = args.filter(Array.isArray) as any[][];
  const results = lists.find((l) => l.some((r) => r && typeof r === 'object' && 'url' in r)) ?? [];
  const seen = new Set<string>();
  const out: GoogleItem[] = [];
  for (const r of results) {
    const id = String(r.url ?? '').match(VIDEO)?.[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      videoId: id,
      title: String(r.titleNoFormatting ?? r.title ?? '').replace(/<[^>]+>/g, '').replace(/\s*-\s*YouTube\s*$/i, ''),
      thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    });
  }
  return out;
}

/** Saca el id del video de un enlace de resultado (Google a veces lo envuelve en google.com/url?q=...). */
function idFromLink(a: HTMLAnchorElement): string | undefined {
  for (const raw of [a.getAttribute('data-ctorig'), a.getAttribute('data-cturl'), a.href]) {
    if (!raw) continue;
    let s = raw;
    try { s = decodeURIComponent(raw); } catch { /* se usa tal cual */ }
    const id = s.match(VIDEO)?.[1];
    if (id) return id;
  }
}

export default function GoogleSearch({ query, onResults, onError, onPick }: { query: string; onResults: (items: GoogleItem[]) => void; onError: (msg: string) => void; onPick: (item: GoogleItem) => void }) {
  useEffect(() => {
    (window as any)[CALLBACK] = (...args: unknown[]) => {
      onResults(parse(args));
      return true; // deja que Google muestre sus propios resultados
    };
  }, [onResults]);

  useEffect(() => {
    let dead = false;
    loadScript()
      .then(() => {
        // El elemento se crea de forma asincrona tras cargar el script
        const tryRun = (n = 0) => {
          if (dead) return;
          const el = (window as any).google?.search?.cse?.element?.getElement(GNAME);
          if (el) el.execute(`${query} karaoke`);
          else if (n < 20) setTimeout(() => tryRun(n + 1), 250);
          else onError('El buscador de Google no respondio');
        };
        tryRun();
      })
      .catch((e) => !dead && onError(e.message));
    return () => { dead = true; };
  }, [query]);

  return (
    <div
      className="karaoke-cse mt-3 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-3 text-slate-100"
      // Tocar un resultado pide la cancion en vez de abrir YouTube; los anuncios siguen funcionando normal
      onClickCapture={(e) => {
        const a = (e.target as HTMLElement).closest('a');
        if (!a) return;
        const id = idFromLink(a as HTMLAnchorElement);
        if (!id) return;
        e.preventDefault();
        e.stopPropagation();
        onPick({
          videoId: id,
          title: (a.textContent ?? '').replace(/\s*-\s*YouTube\s*$/i, '').trim() || 'Canción',
          thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
        });
      }}
    >
      <div className="mb-1 text-xs text-slate-400">Resultados de Google (respaldo) · toca uno para pedirlo</div>
      <div className="gcse-searchresults-only" data-gname={GNAME} data-autoSearchOnLoad="false" data-resultsReadyCallback={CALLBACK} />
    </div>
  );
}
