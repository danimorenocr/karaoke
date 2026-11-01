import { useEffect, useRef, useState } from 'react';
import { api, fmtDuration, pub } from '../lib/api';
import { SkeletonList, Thumb } from './ui';
import { ACCENT, Btn, Card } from './kit';
import GoogleSearch, { GOOGLE_CSE_ID, GoogleItem } from './GoogleSearch';

const compact = new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 });

interface Props {
  tables: { id: string; name: string }[];
  mode: 'KARAOKE' | 'ANY';
  onAdded: () => void;
  toast: (text: string, error?: boolean) => void;
}

/** Buscador del DJ: agrega canciones directo a la cola (aprobadas, sin limite por mesa). */
export default function DjSearch({ tables, mode, onAdded, toast }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<'views' | 'relevance'>('views');
  const [tableId, setTableId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null); // titulo de la cancion que se esta agregando
  const [googleQuery, setGoogleQuery] = useState('');
  const [googleEver, setGoogleEver] = useState(false);
  const [googleItems, setGoogleItems] = useState<GoogleItem[]>([]);
  const last = useRef('');

  // Mesa a nombre de la cual se registra (recuerda la ultima usada)
  useEffect(() => {
    if (tables.some((t) => t.id === tableId)) return;
    const saved = localStorage.getItem('dj_table');
    setTableId(tables.find((t) => t.id === saved)?.id ?? tables[0]?.id ?? '');
  }, [tables, tableId]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) {
      setResults([]); setGoogleItems([]); setGoogleQuery(''); setError(''); last.current = '';
      return;
    }
    if (term !== last.current) { setResults([]); setGoogleItems([]); setGoogleQuery(''); setError(''); }
    const t = setTimeout(async () => {
      if (last.current === term) return;
      last.current = term;
      setSearching(true);
      try {
        setResults(await api('GET', `/dj/search?q=${encodeURIComponent(term)}`));
        setGoogleQuery('');
      } catch (e: any) {
        setResults([]);
        last.current = '';
        // Cuota agotada o busqueda no configurada: respaldo con Google si esta configurado
        if (GOOGLE_CSE_ID && (e.status === 429 || e.status === 503)) {
          setGoogleEver(true);
          setGoogleQuery(term);
        } else {
          setError(e.message);
        }
      } finally {
        setSearching(false);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [q]);

  const add = async (s: { videoId: string; title: string; channelTitle?: string; thumbnail?: string; durationSec?: number }) => {
    if (!tableId) return toast('Crea al menos una mesa para poder agregar canciones', true);
    setBusy(s.videoId);
    setAdding(s.title);
    try {
      await api('POST', '/dj/requests', {
        tableId, videoId: s.videoId, title: s.title, channel: s.channelTitle || undefined, thumbnail: s.thumbnail || undefined, durationSec: s.durationSec,
      });
      toast(`Agregada a la cola: ${s.title}`);
      // Buscador limpio para la siguiente
      setQ('');
      setResults([]);
      setGoogleItems([]);
      setGoogleQuery('');
      last.current = '';
      onAdded();
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(null);
      setAdding(null);
    }
  };

  /** Un video de Google: se valida que se pueda reproducir antes de agregarlo. */
  const addGoogle = async (g: GoogleItem) => {
    setBusy(g.videoId);
    setAdding(g.title);
    try {
      const [v] = await pub('GET', `/youtube/search?q=${encodeURIComponent('https://www.youtube.com/watch?v=' + g.videoId)}`);
      await add(v ?? { videoId: g.videoId, title: g.title, thumbnail: g.thumbnail });
    } catch {
      toast('Ese video no se puede reproducir en la TV. Prueba con otro.', true);
      setBusy(null);
      setAdding(null);
    }
  };

  const shown = sort === 'views' ? [...results].sort((a, b) => (b.viewCount ?? -1) - (a.viewCount ?? -1)) : results;

  return (
    <Card
      title="Agregar canción"
      right={
        <select
          value={tableId}
          onChange={(e) => { setTableId(e.target.value); localStorage.setItem('dj_table', e.target.value); }}
          className="rounded-lg border border-white/10 bg-[#0b1624] px-2 py-1 text-xs normal-case text-slate-200 outline-none"
          title="Mesa a nombre de la cual se registra"
        >
          {tables.length === 0 && <option value="">Sin mesas</option>}
          {tables.map((t) => <option key={t.id} value={t.id}>A nombre de: {t.name}</option>)}
        </select>
      }
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Busca una canción, un artista o pega un link de YouTube"
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-slate-100 outline-none placeholder:text-slate-500 focus:border-white/30"
      />
      {adding && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border p-3 text-sm" style={{ borderColor: ACCENT + '66', background: ACCENT + '14' }} role="status">
          <svg className="h-5 w-5 shrink-0 animate-spin" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="16" stroke={ACCENT + '33'} strokeWidth="5" />
            <path d="M20 4a16 16 0 0116 16" stroke={ACCENT} strokeWidth="5" strokeLinecap="round" />
          </svg>
          <span className="min-w-0">
            <b>Agregando a la cola…</b>
            <span className="block truncate text-slate-300">{adding}</span>
          </span>
        </div>
      )}
      {searching && <div className="mt-3"><SkeletonList /></div>}
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {results.length > 1 && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="text-slate-500">Ordenar:</span>
          {([['views', '🔥 Más vistos'], ['relevance', 'Relevancia']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setSort(k)} className="rounded-full border px-3 py-1 font-medium"
              style={sort === k ? { background: ACCENT, borderColor: ACCENT, color: '#04202a' } : { borderColor: 'rgba(255,255,255,.15)', color: '#cbd5e1' }}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-2">
        {shown.map((s) => (
          <div key={s.videoId} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
            <Thumb src={s.thumbnail} className="h-12 w-20 !rounded-lg" />
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-sm font-medium leading-tight">{s.title}</div>
              <div className="mt-0.5 truncate text-xs text-slate-500">
                {s.channelTitle} {fmtDuration(s.durationSec)}{s.viewCount ? ` · ${compact.format(s.viewCount)} vistas` : ''}
              </div>
            </div>
            <Btn kind="accent" className="!px-3 !py-1.5" disabled={busy === s.videoId} onClick={() => add(s)}>{busy === s.videoId ? 'Agregando…' : 'Agregar'}</Btn>
          </div>
        ))}

        {googleQuery &&
          googleItems.map((g) => (
            <div key={g.videoId} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
              <Thumb src={g.thumbnail} className="h-12 w-20 !rounded-lg" />
              <div className="line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-tight">{g.title}</div>
              <Btn kind="accent" className="!px-3 !py-1.5" disabled={busy === g.videoId} onClick={() => addGoogle(g)}>{busy === g.videoId ? 'Agregando…' : 'Agregar'}</Btn>
            </div>
          ))}

        {/* Una vez usado, el bloque de Google queda montado y solo se oculta (Google no tolera que se destruya su contenedor) */}
        {googleEver && (
          <div className={googleQuery && q.trim() ? '' : 'hidden'}>
            <GoogleSearch query={googleQuery} mode={mode} onResults={setGoogleItems} onError={setError} onPick={addGoogle} />
          </div>
        )}
      </div>
    </Card>
  );
}
