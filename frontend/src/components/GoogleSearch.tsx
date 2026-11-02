import { useEffect, useRef } from 'react';
import { pub } from '../lib/api';

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
let cbCount = 0; // cuantas veces ha avisado Google que termino una busqueda

function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    // Forma oficial de recibir los resultados: se define antes de cargar cse.js
    (window as any).__gcse = { searchCallbacks: { web: { ready: (...a: unknown[]) => (window as any)[CALLBACK]?.(...a) } } };
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
  const seen = new Set<string>();
  const out: GoogleItem[] = [];
  const URL_KEYS = ['url', 'unescapedUrl', 'formattedUrl', 'visibleUrl', 'link'];
  // Busca en cualquier parte de lo que entrega Google (el formato exacto cambia entre versiones)
  const walk = (v: unknown, depth: number) => {
    if (!v || typeof v !== 'object' || depth > 5) return;
    if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
    const r = v as Record<string, unknown>;
    const id = URL_KEYS.map((k) => (typeof r[k] === 'string' ? (r[k] as string).match(VIDEO)?.[1] : undefined)).find(Boolean);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push({
        videoId: id,
        title: String(r.titleNoFormatting ?? r.title ?? '').replace(/<[^>]+>/g, '').replace(/\s*-\s*YouTube\s*$/i, '') || 'Canción',
        thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      });
      return;
    }
    Object.values(r).forEach((x) => walk(x, depth + 1));
  };
  walk(args.filter((a) => !(a instanceof Node)), 0);
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

export default function GoogleSearch({ query, mode, onResults, onError, onPick, onLoading, light }: { query: string; mode: "KARAOKE" | "ANY"; onResults: (items: GoogleItem[]) => void; onError: (msg: string) => void; onPick: (item: GoogleItem) => void; onLoading?: (loading: boolean) => void; light?: boolean }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Verifica que la TV pueda reproducir los videos y solo muestra esos
    const handle = (items: GoogleItem[]) => {
      onResults([]); // hasta verificar, no se muestra nada
      if (!items.length) { onLoading?.(false); return; }
      pub('GET', `/youtube/validate?ids=${items.map((i) => i.videoId).join(',')}&music=1`)
        .then((r: { ok: string[]; titles?: Record<string, string> }) => {
          const ok = new Set(r.ok);
          const good = items.filter((i) => ok.has(i.videoId));
          // Si Google no dio el titulo, se toma del texto del enlace que pinto en su bloque
          const withTitles = () => {
            const t = new Map<string, string>();
            box.current?.querySelectorAll('a').forEach((a) => {
              const id = idFromLink(a as HTMLAnchorElement);
              const txt = (a.textContent ?? '').replace(/\s*-\s*YouTube\s*$/i, '').trim();
              if (id && txt && !t.has(id)) t.set(id, txt);
            });
            // titulo: el que da el backend (YouTube) > texto del enlace de Google > el que ya traia
            return good.map((i) => ({ ...i, title: r.titles?.[i.videoId] || (i.title === 'Canción' ? t.get(i.videoId) : '') || i.title }));
          };
          onResults(withTitles());
          [400, 1200, 2500].forEach((ms) => setTimeout(() => onResults(withTitles()), ms));
          onLoading?.(false);
          // Tambien se ocultan en el bloque propio de Google (los anuncios no se tocan)
          const hide = () =>
            box.current?.querySelectorAll('a.gs-title').forEach((a) => {
              const id = idFromLink(a as HTMLAnchorElement);
              if (id && !ok.has(id)) (a.closest('.gsc-webResult') as HTMLElement | null)?.style.setProperty('display', 'none');
            });
          hide();
          setTimeout(hide, 400);
        })
        .catch(() => { onResults(items); onLoading?.(false); }); // si falla la verificacion se muestran igual; se valida al pedir
    };

    let lastCb = 0;
    (window as any)[CALLBACK] = (...args: unknown[]) => {
      if (args.length && Date.now() - lastCb < 300) return true; // Google puede avisar por dos vias
      if (args.length) lastCb = Date.now();
      cbCount++;
      const items = parse(args);
      console.log('[google-cse] resultados', items.length, args);
      if (items.length) handle(items);
      else {
        // Google no entrego la lista en un formato conocido: se leen los enlaces que pinto en su bloque
        onResults([]);
        setTimeout(() => {
          const seen = new Set<string>();
          const found: GoogleItem[] = [];
          box.current?.querySelectorAll('a').forEach((a) => {
            const id = idFromLink(a as HTMLAnchorElement);
            const txt = (a.textContent ?? '').trim();
            if (!id || (seen.has(id) && !txt)) return;
            if (seen.has(id)) { const f = found.find((x) => x.videoId === id)!; if (f.title === 'Canción') f.title = txt.replace(/\s*-\s*YouTube\s*$/i, ''); return; }
            seen.add(id);
            found.push({ videoId: id, title: (a.textContent ?? '').replace(/\s*-\s*YouTube\s*$/i, '').trim() || 'Canción', thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` });
          });
          handle(found);
        }, 600);
      }
      return true; // deja que Google muestre sus propios resultados
    };
  }, [onResults]);

  useEffect(() => {
    if (!query) return;
    let dead = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    loadScript()
      .then(() => {
        // El elemento se crea de forma asincrona tras cargar el script
        const tryRun = (n = 0) => {
          if (dead) return;
          const el = (window as any).google?.search?.cse?.element?.getElement(GNAME);
          if (el) {
            onLoading?.(true);
            const text = mode === "KARAOKE" ? `${query} karaoke` : query;
            const before = cbCount;
            let tries = 0;
            let leido = false;
            // Google guarda la ultima busqueda en el hash (#gsc.q=...): se limpia para que no se mezcle con la nueva
            const fire = () => { tries++; try { if (location.hash.includes('gsc.')) history.replaceState(null, '', location.pathname + location.search); el.execute(text); } catch { /* se reintenta */ } };
            fire();
            // Google a veces ignora un execute() seguido de otro: si no avisa en 3 s se repite (hasta 3 veces);
            // el esqueleto se quita cuando Google avisa que termino, y como maximo a los 12 s.
            const started = Date.now();
            clearInterval(poll);
            poll = setInterval(() => {
              const elapsed = Date.now() - started;
              if (cbCount > before) {
                clearInterval(poll); // el aviso de Google ya quita el esqueleto tras validar los videos
              } else if (elapsed > 3000 && !leido && [...(box.current?.querySelectorAll('a') ?? [])].some((a) => idFromLink(a as HTMLAnchorElement))) {
                // Google pinto videos pero nunca aviso: se leen directamente del bloque
                leido = true;
                clearInterval(poll);
                (window as any)[CALLBACK]?.();
              } else if (elapsed > 12_000) {
                clearInterval(poll);
                onLoading?.(false);
              } else if (tries < 3 && elapsed > tries * 3000) {
                fire();
              }
            }, 300);
          }
          else if (n < 20) setTimeout(() => tryRun(n + 1), 250);
          else { onLoading?.(false); onError('El buscador de Google no respondio'); }
        };
        tryRun();
      })
      .catch((e) => { if (!dead) { onLoading?.(false); onError(e.message); } });
    return () => { dead = true; clearInterval(poll); };
  }, [query]);

  return (
    <div
      ref={box}
      className={light ? 'karaoke-cse cse-light mt-3 overflow-hidden rounded-2xl border border-black/10 bg-neutral-50 p-3 text-neutral-900' : 'karaoke-cse mt-3 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-3 text-slate-100'}
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
      {/* <div className="mb-1 text-xs text-slate-400">Resultados de Google (respaldo) · toca uno para pedirlo</div> */}
      <div className="gcse-searchresults-only" data-gname={GNAME} data-autoSearchOnLoad="false" data-resultsReadyCallback={CALLBACK} />
    </div>
  );
}
