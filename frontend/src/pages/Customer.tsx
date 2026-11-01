import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { connectSocket, fmtDuration, pub } from '../lib/api';
import { Thumb, useAction, useToast } from '../components/ui';

const STATUS: Record<string, [string, string]> = {
  PENDING: ['Esperando al DJ', 'text-amber-400'],
  APPROVED: ['En cola', 'text-sky-400'],
  PLAYING: ['Sonando ahora', 'text-pink-400'],
  COMPLETED: ['Completada', 'text-zinc-500'],
  REJECTED: ['Rechazada', 'text-red-400'],
  CANCELLED: ['Cancelada', 'text-zinc-500'],
  FAILED: ['No se pudo reproducir', 'text-red-400'],
};
const CAN_CANCEL = ['PENDING', 'APPROVED'];

export default function Customer() {
  const { token } = useParams();
  const [state, setState] = useState<any>(null);
  const [invalid, setInvalid] = useState(false);
  const [tab, setTab] = useState<'search' | 'queue' | 'mine'>('search');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
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
      return;
    }
    const t = setTimeout(async () => {
      if (lastQuery.current === term) return;
      lastQuery.current = term;
      setSearching(true);
      setSearchError('');
      try {
        setResults(await pub('GET', `/youtube/search?q=${encodeURIComponent(term)}`));
      } catch (e: any) {
        setResults([]);
        setSearchError(e.message);
        lastQuery.current = '';
      } finally {
        setSearching(false);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [q]);

  if (invalid) return <div className="p-8 text-center text-zinc-300">Este codigo QR no es valido o fue desactivado.<br />Pide ayuda al personal.</div>;
  if (!state) return <div className="p-8 text-center text-zinc-500">Cargando...</div>;

  const color = state.business.primaryColor ?? '#ec4899';
  const closed = !state.session ? 'El karaoke aun no ha comenzado' : !state.session.open ? 'Las solicitudes estan pausadas por ahora' : '';
  const waiting = state.mine.filter((r: any) => CAN_CANCEL.includes(r.status)).length;

  const request = (s: any) =>
    run(async () => {
      await pub('POST', `/public/${token}/requests`, {
        videoId: s.videoId,
        title: s.title,
        channel: s.channelTitle,
        thumbnail: s.thumbnail,
        durationSec: s.durationSec,
      });
      toast('Cancion solicitada');
      setTab('mine');
      load();
    });

  return (
    <div className="mx-auto min-h-screen max-w-lg pb-20">
      <header className="flex items-center gap-3 border-b border-zinc-800 p-4" style={{ borderColor: color }}>
        {state.business.logoUrl && <img src={state.business.logoUrl} className="h-10 w-10 rounded-full object-cover" />}
        <div>
          <div className="text-lg font-bold">{state.business.name}</div>
          <div className="text-sm text-zinc-400">{state.table.name}</div>
        </div>
        <div className="ml-auto text-right text-xs text-zinc-400">
          {waiting}/{state.maxPending}
          <br />
          en espera
        </div>
      </header>

      {state.current && (
        <div className="m-4 flex items-center gap-3 rounded-xl p-3" style={{ background: color + '22' }}>
          <Thumb src={state.current.thumbnail} />
          <div className="min-w-0">
            <div className="text-xs uppercase text-zinc-400">Sonando ahora · {state.current.tableName}</div>
            <div className="truncate font-semibold">{state.current.title}</div>
          </div>
        </div>
      )}
      {closed && <div className="mx-4 mt-3 rounded-lg bg-amber-900/40 p-3 text-sm text-amber-200">{closed}</div>}

      <nav className="sticky top-0 z-10 flex gap-1 bg-zinc-950 p-3">
        {([['search', 'Buscar'], ['queue', `Cola (${state.queue.length})`], ['mine', `Mis canciones (${state.mine.length})`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`btn flex-1 !px-2 ${tab === k ? 'btn-primary' : ''}`} style={tab === k ? { background: color } : undefined}>
            {label}
          </button>
        ))}
      </nav>

      <main className="space-y-2 px-3">
        {tab === 'search' && (
          <>
            <input className="input" placeholder="Cancion, artista o link de YouTube" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            {searching && <p className="text-sm text-zinc-500">Buscando...</p>}
            {searchError && <p className="text-sm text-red-400">{searchError}</p>}
            {results.map((s) => (
              <div key={s.videoId} className="card flex items-center gap-3 !p-2">
                <Thumb src={s.thumbnail} />
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-sm font-medium">{s.title}</div>
                  <div className="truncate text-xs text-zinc-500">{s.channelTitle} {fmtDuration(s.durationSec)}</div>
                </div>
                <button className="btn btn-primary" style={{ background: color }} disabled={!!closed} onClick={() => request(s)}>Pedir</button>
              </div>
            ))}
          </>
        )}

        {tab === 'queue' && (
          state.queue.length === 0 ? <p className="p-6 text-center text-zinc-500">La cola esta vacia. Se el primero.</p> :
          state.queue.map((r: any, i: number) => (
            <div key={r.id} className="card flex items-center gap-3 !p-2">
              <div className="w-6 text-center text-zinc-500">{i + 1}</div>
              <Thumb src={r.thumbnail} className="h-10 w-16" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{r.title}</div>
                <div className="text-xs text-zinc-500">{r.tableName}</div>
              </div>
            </div>
          ))
        )}

        {tab === 'mine' && (
          state.mine.length === 0 ? <p className="p-6 text-center text-zinc-500">Aun no has pedido canciones.</p> :
          state.mine.map((r: any) => (
            <div key={r.id} className="card flex items-center gap-3 !p-2">
              <Thumb src={r.thumbnail} className="h-10 w-16" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{r.title}</div>
                <div className={`text-xs ${STATUS[r.status][1]}`}>
                  {STATUS[r.status][0]}{r.status === 'REJECTED' && r.rejectionReason ? `: ${r.rejectionReason}` : ''}
                </div>
              </div>
              {CAN_CANCEL.includes(r.status) && (
                <button className="btn !px-2 !py-1 text-xs" onClick={() => run(async () => { await pub('POST', `/public/${token}/requests/${r.id}/cancel`); load(); })}>
                  Cancelar
                </button>
              )}
            </div>
          ))
        )}
      </main>
      {node}
    </div>
  );
}
