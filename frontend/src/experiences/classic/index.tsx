import { ReactNode, useEffect, useState } from 'react';
import { fmtDuration } from '../../lib/api';
import { Thumb } from '../../components/ui';
import GoogleFallback from '../../core/GoogleFallback';
import { ExperienceProps, HOLDING, LOADING_LINES, STATUS_LABEL, WAITING } from '../../core/useKaraoke';

/**
 * Experiencia "Clásica": una conversacion minimalista, en modo claro.
 * "Que cancion quieres cantar?" -> buscar -> elegir video -> confirmar -> cargando -> listo.
 */

type View = 'chat' | 'now' | 'mine';

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'text-amber-600', APPROVED: 'text-sky-700', PLAYING: 'text-emerald-700', COMPLETED: 'text-neutral-400',
  REJECTED: 'text-red-600', CANCELLED: 'text-neutral-400', FAILED: 'text-red-600',
};
const compact = new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 });

const Assistant = ({ children }: { children: ReactNode }) => (
  <div className="msg-in max-w-[85%] self-start rounded-2xl rounded-tl-md bg-neutral-100 px-4 py-3 text-[15px] leading-snug text-neutral-800">{children}</div>
);
const User = ({ children }: { children: ReactNode }) => (
  <div className="msg-in max-w-[85%] self-end rounded-2xl rounded-tr-md bg-neutral-900 px-4 py-3 text-[15px] leading-snug text-white">{children}</div>
);

function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Buscando">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 rounded-2xl border border-neutral-200 p-2.5">
          <div className="h-14 w-14 shrink-0 rounded-xl bg-neutral-200" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-4/5 rounded bg-neutral-200" />
            <div className="h-3 w-2/5 rounded bg-neutral-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Classic({ k }: ExperienceProps) {
  const { state, accent, mine, holding, full, blocked, sorted, step, term, picked, google } = k;
  const [view, setView] = useState<View>('chat');

  // Fondo claro tambien detras de la pagina (el resto de la app es oscura)
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = '#ffffff';
    return () => { document.body.style.background = prev; };
  }, []);

  const q = k.q, setQ = k.setQ, runSearch = k.runSearch, pick = k.pick, confirm = k.confirm, cancel = k.cancel;
  const again = () => { k.again(); setView('chat'); };
  const googleItems = google.items, googleQuery = google.query;
  const doneText = k.doneText, showSkeleton = k.showSkeleton, errorMsg = k.errorMsg, lineIdx = k.lineIdx;
  const setStep = k.setStep, node = k.toastNode;

  const btn = 'rounded-xl px-5 py-3 text-[15px] font-semibold transition active:scale-[.98]';

  const chat = (
    <div className="flex flex-1 flex-col gap-3">
      <Assistant>¡Hola! ¿Qué canción quieres cantar?</Assistant>

      {step === 'ask' && (
        blocked || full ? (
          <Assistant>
            {blocked || <>Tu mesa ya tiene <b>{holding}</b> canciones sin terminar (máximo {state.maxPending}). Cuando termine una podrás pedir otra.</>}
          </Assistant>
        ) : (
          <form onSubmit={runSearch} className="msg-in mt-1 flex items-center gap-2 border-b-2 border-neutral-900 pb-1">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Canción, artista o link de YouTube"
              enterKeyHint="search"
              autoFocus
              className="min-w-0 flex-1 bg-transparent py-2 text-lg text-neutral-900 outline-none placeholder:text-neutral-400"
            />
            <button disabled={q.trim().length < 3} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white disabled:opacity-25" style={{ background: accent }} aria-label="Buscar">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </form>
        )
      )}

      {step !== 'ask' && term && <User>{term}</User>}

      {showSkeleton && (
        <>
          <Assistant>Buscando…</Assistant>
          <Skeleton />
        </>
      )}

      {step === 'results' && (
        <>
          {(sorted.length > 0 || googleItems.length > 0) && <Assistant>Elige un video</Assistant>}
          {sorted.length === 0 && !googleQuery && <Assistant>No encontré nada con «{term}». Prueba con otro nombre o con el artista.</Assistant>}
          <div className="space-y-2">
            {sorted.map((s) => (
              <button key={s.videoId} onClick={() => pick(s, 'api')} className="msg-in flex w-full items-center gap-3 rounded-2xl border border-neutral-200 p-2.5 text-left transition active:bg-neutral-100">
                <Thumb src={s.thumbnail} className="h-14 w-14 !rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[15px] font-medium leading-tight text-neutral-900">{s.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-neutral-500">{s.channelTitle} {fmtDuration(s.durationSec)}{s.viewCount ? ` · ${compact.format(s.viewCount)} vistas` : ''}</span>
                </span>
              </button>
            ))}
            {googleQuery && googleItems.map((g) => (
              <button key={g.videoId} onClick={() => pick(g, 'google')} className="msg-in flex w-full items-center gap-3 rounded-2xl border border-neutral-200 p-2.5 text-left transition active:bg-neutral-100">
                <Thumb src={g.thumbnail} className="h-14 w-14 !rounded-xl" />
                <span className="line-clamp-2 min-w-0 flex-1 text-[15px] font-medium leading-tight text-neutral-900">{g.title}</span>
              </button>
            ))}
          </div>
          <GoogleFallback k={k} light />
          <button onClick={() => { setStep('ask'); }} className="self-start text-sm text-neutral-500 underline underline-offset-4">Buscar otra cosa</button>
        </>
      )}

      {(step === 'confirm' || step === 'adding' || step === 'done') && picked && <User>{picked.song.title}</User>}

      {step === 'confirm' && picked && (
        <>
          <Assistant>
            ¿La pedimos? Se agregará a la cola a nombre de <b>{state.table.name}</b> ({holding + 1} de {state.maxPending} permitidas).
          </Assistant>
          <div className="msg-in flex gap-2">
            <button className={`${btn} text-white`} style={{ background: accent }} onClick={confirm}>Sí, pedirla</button>
            <button className={`${btn} bg-neutral-100 text-neutral-800`} onClick={() => setStep('results')}>Elegir otra</button>
          </div>
        </>
      )}

      {step === 'done' && (
        <>
          <Assistant>¡Listo! {doneText}</Assistant>
          <div className="msg-in flex gap-2">
            <button className={`${btn} text-white`} style={{ background: accent }} onClick={again}>Pedir otra</button>
            <button className={`${btn} bg-neutral-100 text-neutral-800`} onClick={() => setView('now')}>Ver la cola</button>
          </div>
        </>
      )}

      {step === 'error' && (
        <>
          <Assistant>{errorMsg || 'Algo salió mal.'}</Assistant>
          <div className="msg-in flex gap-2">
            <button className={`${btn} text-white`} style={{ background: accent }} onClick={() => setStep(picked ? 'results' : 'ask')}>Intentar de nuevo</button>
          </div>
        </>
      )}
    </div>
  );

  const now = (
    <div className="flex-1">
      <button onClick={() => setView('chat')} className="mb-5 text-sm text-neutral-500 underline underline-offset-4">← Pedir una canción</button>
      <h2 className="text-xl font-bold">Sonando</h2>
      {state.current ? (
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-neutral-100 p-3">
          <Thumb src={state.current.thumbnail} className="h-14 w-14 !rounded-xl" />
          <div className="min-w-0">
            <div className="truncate font-semibold">{state.current.title}</div>
            <div className="text-xs text-neutral-500">{state.current.tableName}</div>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-neutral-500">No suena nada en este momento.</p>
      )}
      <h3 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wider text-neutral-400">Siguientes</h3>
      {state.queue.length === 0 ? (
        <p className="text-neutral-500">La cola está vacía.</p>
      ) : (
        <ol className="space-y-1">
          {state.queue.map((r: any, i: number) => (
            <li key={r.id} className="flex items-center gap-3 border-b border-neutral-100 py-2.5">
              <span className="w-5 text-center text-sm text-neutral-400">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">{r.title}</span>
                <span className="text-xs text-neutral-500">{r.tableName}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );

  const mineView = (
    <div className="flex-1">
      <button onClick={() => setView('chat')} className="mb-5 text-sm text-neutral-500 underline underline-offset-4">← Pedir una canción</button>
      <h2 className="text-xl font-bold">Mi música</h2>
      <p className="mt-1 text-sm text-neutral-500">{state.table.name} · {holding} de {state.maxPending} sin terminar</p>
      {mine.length === 0 ? (
        <p className="mt-6 text-neutral-500">Aún no has pedido canciones.</p>
      ) : (
        <ul className="mt-4 space-y-1">
          {mine.map((r) => (
            <li key={r.id} className="flex items-center gap-3 border-b border-neutral-100 py-3">
              <Thumb src={r.thumbnail} className="h-11 w-11 !rounded-lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">{r.title}</span>
                <span className={`text-xs ${STATUS_COLOR[r.status]}`}>
                  {STATUS_LABEL[r.status]}{r.status === 'REJECTED' && r.rejectionReason ? `: ${r.rejectionReason}` : ''}
                </span>
              </span>
              {WAITING.includes(r.status) && <button className="text-xs text-neutral-500 underline underline-offset-2" onClick={() => cancel(r.id)}>Cancelar</button>}
            </li>
          ))}
        </ul>
      )}
      {k.canRate && (
        <div className="mt-8 rounded-2xl bg-neutral-100 p-4 text-center">
          <div className="text-sm font-medium">¿Cómo va tu experiencia?</div>
          <div className="mt-2 flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} aria-label={`${n} de 5`} className="text-3xl transition active:scale-90" onClick={() => k.sendFeedback(n)}>⭐</button>
            ))}
          </div>
          <button className="mt-2 text-xs text-neutral-400" onClick={k.dismissFeedback}>Ahora no</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-dvh bg-white text-neutral-900" style={{ colorScheme: 'light' }}>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-24 pt-5">
        <header className="mb-6 flex items-baseline justify-between gap-3 text-sm">
          <span className="truncate font-semibold">{state.business.name}</span>
          <span className="shrink-0 text-neutral-400">{state.table.name}</span>
        </header>
        {view === 'chat' ? chat : view === 'now' ? now : mineView}
      </div>

      {/* Navegacion minima */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-md">
          {([['now', 'Sonando', state.queue.length], ['mine', 'Mi música', holding]] as const).map(([k, label, n]) => (
            <button key={k} onClick={() => setView(view === k ? 'chat' : k)} className={`flex-1 py-4 text-sm font-medium transition ${view === k ? 'text-neutral-900' : 'text-neutral-400'}`}>
              {label}{n > 0 && <span className="ml-1.5 rounded-full bg-neutral-900 px-1.5 py-0.5 text-[10px] font-bold text-white">{n}</span>}
            </button>
          ))}
        </div>
      </nav>

      {/* Pantalla de carga al agregar la cancion */}
      {step === 'adding' && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-white" role="status">
          <svg className="h-12 w-12 animate-spin" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="16" stroke="#e5e5e5" strokeWidth="4" />
            <path d="M20 4a16 16 0 0116 16" stroke={accent} strokeWidth="4" strokeLinecap="round" />
          </svg>
          <div className="px-8 text-center">
            <div className="text-lg font-semibold">{LOADING_LINES[lineIdx % LOADING_LINES.length]}</div>
            {picked && <div className="mt-2 line-clamp-2 text-sm text-neutral-500">{picked.song.title}</div>}
          </div>
        </div>
      )}
      {node}
    </div>
  );
}
