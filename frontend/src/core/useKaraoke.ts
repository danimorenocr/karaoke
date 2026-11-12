import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { API_URL, clientId, connectSocket, pub } from '../lib/api';
import { useToast } from '../components/ui';
import { GOOGLE_CSE_ID, GoogleItem } from '../components/GoogleSearch';

/**
 * Motor de karaoke compartido por todas las experiencias: estado de la mesa, busqueda,
 * pedido de canciones, cola y valoracion. Las experiencias solo deciden COMO se ve.
 */

export type Step = 'ask' | 'searching' | 'results' | 'confirm' | 'adding' | 'done' | 'error';
export type Source = 'api' | 'google';

export const WAITING = ['PENDING', 'APPROVED'];
export const HOLDING = [...WAITING, 'PLAYING'];
export const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Esperando al DJ', APPROVED: 'En cola', PLAYING: 'Sonando ahora', COMPLETED: 'Completada',
  REJECTED: 'Rechazada', CANCELLED: 'Cancelada', FAILED: 'No se pudo reproducir',
};
export const LOADING_LINES = ['Agregando tu canción a la cola…', 'Calentando el micrófono…', 'Ya casi, afina la garganta…'];
const DEFAULT_PINK = '#ec4899';

export function useKaraoke(token: string | undefined) {
  const { toast, node: toastNode } = useToast();

  const [state, setState] = useState<any>(null);
  const [invalid, setInvalid] = useState(false);

  const [step, setStep] = useState<Step>('ask');
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [kind, setKind] = useState<'KARAOKE' | 'ANY'>('KARAOKE'); // karaoke o normal
  const [results, setResults] = useState<any[]>([]);
  const [picked, setPicked] = useState<{ song: any; source: Source } | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [lineIdx, setLineIdx] = useState(0);

  // Respaldo de Google
  const [googleQuery, setGoogleQuery] = useState('');
  const [googleEver, setGoogleEver] = useState(false);
  const [googleItems, setGoogleItems] = useState<GoogleItem[]>([]);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Valoracion opcional: maximo una vez al dia por navegador
  const today = new Date().toISOString().slice(0, 10);
  const [fbDone, setFbDone] = useState(() => { try { return localStorage.getItem('karaoke_fb') === today; } catch { return false; } });

  const load = useCallback(async () => {
    try {
      const st = await pub('GET', `/public/${token}/state?img=url`);
      // El logo llega como direccion versionada: el navegador lo descarga una vez y lo reutiliza
      const lg = st?.business?.logoUrl;
      if (typeof lg === 'string' && lg.startsWith('/')) st.business.logoUrl = API_URL + lg;
      setState(st);
    } catch (e: any) {
      if (e.status === 404) setInvalid(true);
    }
  }, [token]);

  // Cuenta un escaneo por visita (no por cada refresco de datos)
  useEffect(() => {
    try {
      if (sessionStorage.getItem(`karaoke_scan_${token}`)) return;
      sessionStorage.setItem(`karaoke_scan_${token}`, '1');
    } catch { /* sin storage: se cuenta igual */ }
    pub('POST', `/public/${token}/scan`, { clientId: clientId() }).catch(() => {});
  }, [token]);

  useEffect(() => {
    load();
    const off = connectSocket({ tableToken: token }, (name) => {
      if ((name === 'queue.updated' || name === 'connect') && !document.hidden) load(); // oculta: se actualiza al volver
    });
    const poll = setInterval(() => { if (!document.hidden) load(); }, 20000); // respaldo si el socket se cae (no consulta con la pestana oculta)
    const onVisible = () => { if (!document.hidden) load(); }; // al volver a la pestana se actualiza al momento
    document.addEventListener('visibilitychange', onVisible);
    return () => { off(); clearInterval(poll); document.removeEventListener('visibilitychange', onVisible); };
  }, [token, load]);

  useEffect(() => {
    if (step !== 'adding') return;
    setLineIdx(0);
    const t = setInterval(() => setLineIdx((i) => i + 1), 2200);
    return () => clearInterval(t);
  }, [step]);

  // ---------- derivados ----------
  const brand: string | undefined = state?.business.primaryColor;
  const accent = !brand || brand.toLowerCase() === DEFAULT_PINK ? '#111827' : brand;
  const mine: any[] = state?.mine ?? [];
  const holding = mine.filter((r) => HOLDING.includes(r.status)).length;
  const full = !!state && holding >= state.maxPending;
  const blocked = !state ? '' : !state.session ? 'El karaoke aún no ha comenzado.' : !state.session.open ? 'Las solicitudes están pausadas por ahora.' : '';
  const heldIds = new Set(mine.filter((r) => HOLDING.includes(r.status)).map((r) => r.videoId));
  const sorted = [...results].sort((a, b) => Number(!!a.risky) - Number(!!b.risky) || (b.viewCount ?? -1) - (a.viewCount ?? -1));
  const showSkeleton = step === 'searching' || (step === 'results' && !!googleQuery && googleLoading && googleItems.length === 0);
  const done = doneId ? mine.find((r) => r.id === doneId) : null;
  const pos = done && state ? state.queue.findIndex((r: any) => r.id === done.id) + 1 : 0;
  const doneText = !done ? 'Tu canción quedó pedida.'
    : done.status === 'PLAYING' ? '¡Está sonando ahora! 🎤'
    : done.status === 'PENDING' ? 'El DJ la revisará en un momento.'
    : pos > 0 ? `Vas en la posición #${pos} de la cola.` : 'Quedó en la cola.';

  // ---------- acciones ----------
  const searchSeq = useRef(0);
  async function runSearch(e?: FormEvent) {
    e?.preventDefault();
    const t = q.trim();
    if (t.length < 3) return;
    setTerm(t);
    setResults([]);
    setGoogleItems([]);
    setGoogleQuery('');
    setErrorMsg('');
    setPicked(null);
    setStep('searching');
    const seq = ++searchSeq.current;
    try {
      const found = await pub('GET', `/public/${token}/search?q=${encodeURIComponent(t)}&mode=${kind}`);
      if (seq !== searchSeq.current) return; // llego una respuesta vieja: ya hay una busqueda mas reciente
      setResults(found);
      setStep('results');
    } catch (err: any) {
      if (seq !== searchSeq.current) return;
      // Cuota agotada o busqueda no configurada: respaldo con Google si esta configurado
      if (GOOGLE_CSE_ID && (err.status === 429 || err.status === 503)) {
        setGoogleEver(true);
        setGoogleQuery(t);
        setStep('results');
      } else {
        setErrorMsg(err.message);
        setStep('error');
      }
    }
  }

  function pick(song: any, source: Source) {
    if (blocked) return toast(blocked, true);
    if (full) return toast(`Tu mesa ya tiene ${holding} canciones sin terminar (máximo ${state.maxPending}).`, true);
    if (heldIds.has(song.videoId)) return toast('Ya pediste esta canción', true);
    setPicked({ song, source });
    setStep('confirm');
  }

  async function confirm() {
    if (!picked) return;
    setStep('adding');
    try {
      let song = picked.song;
      if (picked.source === 'google') {
        // Un video de Google: se valida que se pueda reproducir en la TV antes de pedirlo
        try {
          [song] = await pub('GET', `/youtube/search?q=${encodeURIComponent('https://www.youtube.com/watch?v=' + song.videoId)}`);
        } catch {
          throw new Error('Ese video no se puede reproducir en la TV. Elige otro.');
        }
      }
      const r = await pub('POST', `/public/${token}/requests`, {
        videoId: song.videoId,
        title: song.title,
        channel: song.channelTitle,
        thumbnail: song.thumbnail,
        durationSec: song.durationSec,
        clientId: clientId(),
      });
      await load();
      // Sin pantalla de "pedir otra": avisa y vuelve directo al buscador
      toast(r.status === 'PENDING' ? '¡Canción pedida! El DJ la revisará en un momento.' : '¡Canción pedida! Ya está en la cola.');
      again();
    } catch (err: any) {
      setErrorMsg(err.message);
      setStep('error');
    }
  }

  /** Vuelve al inicio de la conversacion (nueva busqueda). */
  function again() {
    setStep('ask');
    setQ('');
    setTerm('');
    setResults([]);
    setGoogleItems([]);
    setGoogleQuery('');
    setPicked(null);
    setDoneId(null);
    setErrorMsg('');
  }

  const cancel = async (id: string) => {
    try { await pub('POST', `/public/${token}/requests/${id}/cancel`); await load(); } catch (e: any) { toast(e.message, true); }
  };

  const dismissFeedback = () => { setFbDone(true); try { localStorage.setItem('karaoke_fb', today); } catch { /* */ } };
  const sendFeedback = (rating: number) => {
    pub('POST', `/public/${token}/feedback`, { rating, clientId: clientId() }).catch(() => {});
    dismissFeedback();
    toast('¡Gracias por tu opinión!');
  };
  const canRate = !fbDone && mine.some((r) => r.status === 'COMPLETED');

  return {
    token, state, invalid, toast, toastNode, accent,
    mine, holding, full, blocked, sorted, showSkeleton, done, doneText,
    step, setStep, q, setQ, kind, setKind, term, picked, errorMsg, setErrorMsg, lineIdx,
    google: { query: googleQuery, ever: googleEver, items: googleItems, setItems: setGoogleItems, setLoading: setGoogleLoading },
    runSearch, pick, confirm, again, cancel, canRate, sendFeedback, dismissFeedback,
  };
}

export type Karaoke = ReturnType<typeof useKaraoke>;
export type ExperienceProps = { k: Karaoke };
