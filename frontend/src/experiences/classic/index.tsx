import { CSSProperties, ReactNode, useEffect, useState } from 'react';
import { fmtDuration } from '../../lib/api';
import { Thumb } from '../../components/ui';
import GoogleFallback from '../../core/GoogleFallback';
import { ExperienceProps, HOLDING, LOADING_LINES, STATUS_LABEL, WAITING } from '../../core/useKaraoke';
import SearchKind from '../../core/SearchKind';
import ConfirmSheet from '../../core/ConfirmSheet';

/**
 * Experiencia "Clásica": conversacion minimalista con la identidad de la landing de Tono
 * (fondo noche, acento lavanda, Nunito, tarjetas redondeadas y botones en pastilla).
 * "Que cancion quieres cantar?" -> buscar -> elegir video -> confirmar -> cargando -> listo.
 */

type View = 'chat' | 'now' | 'mine';

// Paleta de la landing
const C = { bg: '#05060a', card: '#0d1017', card2: '#121722', line: 'rgba(255,255,255,.09)', cream: '#f5ecdc', mute: '#9aa3b2', ac: '#a9b8ff', ink: '#0b1030' };
const STATUS_COLOR: Record<string, string> = {
  PENDING: 'text-amber-300', APPROVED: 'text-sky-300', PLAYING: 'text-emerald-300', COMPLETED: 'text-zinc-500',
  REJECTED: 'text-red-400', CANCELLED: 'text-zinc-500', FAILED: 'text-red-400',
};
/** Texto legible sobre el color de acento (oscuro sobre colores claros, claro sobre oscuros). */
function onColor(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return C.ink;
  const n = parseInt(m[1], 16);
  const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.6 ? C.ink : '#ffffff';
}
const CSS = `
.cl{font-family:'Nunito',system-ui,sans-serif}
.cl-card{transition:border-color .25s,background .25s,transform .25s}
.cl-card:active{background:${C.card2}}
@media (hover:hover){.cl-card:hover{border-color:var(--ac)}}
.cl-btn{transition:transform .2s,filter .2s,box-shadow .3s}
@media (hover:hover){.cl-btn:hover{filter:brightness(1.08);box-shadow:0 10px 30px -10px var(--ac)}}
.cl-dot{animation:cl-pulse 2s infinite}
@keyframes cl-pulse{0%,100%{box-shadow:0 0 0 0 var(--ac)}50%{box-shadow:0 0 0 6px transparent}}
@keyframes cl-glow{0%,100%{opacity:.55}50%{opacity:1}}
.cl-glow{animation:cl-glow 5s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.cl *{animation:none!important;transition:none!important}}
`;
const compact = new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 });

const Assistant = ({ children }: { children: ReactNode }) => (
  <div className="msg-in max-w-[85%] self-start rounded-2xl rounded-tl-md border px-4 py-3 text-[15px] leading-snug" style={{ background: C.card, borderColor: C.line, color: C.cream }}>{children}</div>
);
const User = ({ children }: { children: ReactNode }) => (
  <div className="msg-in max-w-[85%] self-end rounded-2xl rounded-tr-md px-4 py-3 text-[15px] font-bold leading-snug" style={{ background: 'var(--ac)', color: 'var(--on)' }}>{children}</div>
);

function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Buscando">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 rounded-2xl border p-2.5" style={{ background: C.card, borderColor: C.line }}>
          <div className="h-14 w-14 shrink-0 rounded-xl bg-white/10" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-4/5 rounded bg-white/10" />
            <div className="h-3 w-2/5 rounded bg-white/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Classic({ k }: ExperienceProps) {
  const { state, accent: rawAccent, mine, holding, full, blocked, sorted, step, term, picked, google } = k;
  const [view, setView] = useState<View>('chat');

  // Sin color de marca propio se usa el lavanda de Tono
  const accent = rawAccent === '#111827' ? C.ac : rawAccent;
  const on = onColor(accent);

  // Mismo fondo noche detras de la pagina (overscroll en el celular)
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = C.bg;
    return () => { document.body.style.background = prev; };
  }, []);

  const q = k.q, setQ = k.setQ, runSearch = k.runSearch, pick = k.pick, confirm = k.confirm, cancel = k.cancel;
  const again = () => { k.again(); setView('chat'); };
  const googleItems = google.items, googleQuery = google.query;
  const doneText = k.doneText, showSkeleton = k.showSkeleton, errorMsg = k.errorMsg, lineIdx = k.lineIdx;
  const setStep = k.setStep, node = k.toastNode;

  const btn = 'cl-btn rounded-full px-5 py-2.5 text-sm font-bold transition active:scale-[.97]';
  const primary = { background: accent, color: on };
  const ghost = { border: `1.5px solid ${C.cream}44`, color: C.cream };

  const chat = (
    <div className="flex flex-1 flex-col gap-3">
      <Assistant>¡Hola! ¿Qué canción quieres cantar?</Assistant>

      {step === 'ask' && (
        blocked || full ? (
          <Assistant>
            {blocked || <>Tu mesa ya tiene <b>{holding}</b> canciones sin terminar (máximo {state.maxPending}). Cuando termine una podrás pedir otra.</>}
          </Assistant>
        ) : (
          <><SearchKind k={k} /><form onSubmit={runSearch} className="msg-in mt-1 flex items-center gap-2 rounded-full border py-1.5 pl-5 pr-1.5" style={{ background: C.card, borderColor: C.line }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Canción, artista o link de YouTube"
              enterKeyHint="search"
              autoFocus
              className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-zinc-500" style={{ color: C.cream }}
            />
            <button disabled={q.trim().length < 3} className="cl-btn grid h-10 w-10 shrink-0 place-items-center rounded-full disabled:opacity-25" style={{ background: accent, color: on }} aria-label="Buscar">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </form></>
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
          <button type="button" className={`${btn} self-start`} style={ghost} onClick={() => setStep('ask')}>← Buscar otra canción</button>
          {sorted.length === 0 && !googleQuery && <Assistant>No encontré nada con «{term}». Prueba con otro nombre o con el artista.</Assistant>}
          <div className="space-y-2">
            {sorted.map((s) => (
              <button key={s.videoId} onClick={() => pick(s, 'api')} className="msg-in cl-card flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left" style={{ background: C.card, borderColor: C.line }}>
                <Thumb src={s.thumbnail} className="h-14 w-14 !rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[15px] font-bold leading-tight">{s.title}</span>
                  <span className="mt-0.5 block truncate text-xs" style={{ color: C.mute }}>{s.channelTitle} {fmtDuration(s.durationSec)}{s.viewCount ? ` · ${compact.format(s.viewCount)} vistas` : ''}</span>
                </span>
              </button>
            ))}
            {googleQuery && googleItems.map((g) => (
              <button key={g.videoId} onClick={() => pick(g, 'google')} className="msg-in cl-card flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left" style={{ background: C.card, borderColor: C.line }}>
                <Thumb src={g.thumbnail} className="h-14 w-14 !rounded-xl" />
                <span className="line-clamp-2 min-w-0 flex-1 text-[15px] font-bold leading-tight">{g.title}</span>
              </button>
            ))}
          </div>
          <GoogleFallback k={k} />
          <button onClick={() => { setStep('ask'); }} className="self-start text-sm underline underline-offset-4" style={{ color: C.mute }}>Buscar otra cosa</button>
        </>
      )}

      {(step === 'confirm' || step === 'adding' || step === 'done') && picked && <User>{picked.song.title}</User>}

      {step === 'confirm' && picked && (
        <ConfirmSheet
          song={picked.song} tableName={state.table.name} slot={holding + 1} max={state.maxPending}
          theme={{ surface: C.card, fg: C.cream, mute: C.mute, line: 'rgba(255,255,255,.12)', accent, onAccent: on, radius: 26, font: "'Nunito', system-ui, sans-serif" }}
          onConfirm={confirm} onCancel={() => setStep('results')}
        />
      )}

      {step === 'done' && (
        <>
          <Assistant>¡Listo! {doneText}</Assistant>
          <div className="msg-in flex gap-2">
            <button className={btn} style={primary} onClick={again}>Pedir otra</button>
            <button className={btn} style={ghost} onClick={() => setView('now')}>Ver la cola</button>
          </div>
        </>
      )}

      {step === 'error' && (
        <>
          <Assistant>{errorMsg || 'Algo salió mal.'}</Assistant>
          <div className="msg-in flex gap-2">
            <button className={btn} style={primary} onClick={() => setStep(picked ? 'results' : 'ask')}>Intentar de nuevo</button>
          </div>
        </>
      )}
    </div>
  );

  const now = (
    <div className="flex-1">
      <button onClick={() => setView('chat')} className="mb-5 text-sm underline underline-offset-4" style={{ color: C.mute }}>← Pedir una canción</button>
      <h2 className="text-2xl font-black tracking-tight">Sonando</h2>
      {state.current ? (
        <div className="mt-3 flex items-center gap-3 rounded-2xl border p-3" style={{ background: 'linear-gradient(135deg,#101a33,#0a0f1c)', borderColor: `${accent}55`, boxShadow: `0 20px 50px -30px ${accent}88` }}>
          <Thumb src={state.current.thumbnail} className="h-14 w-14 !rounded-xl" />
          <div className="min-w-0">
            <span className="cl-dot mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: '#1d2a4f', color: accent }}>Sonando · {state.current.tableName}</span>
            <div className="truncate font-black">{state.current.title}</div>
          </div>
        </div>
      ) : (
        <p className="mt-3" style={{ color: C.mute }}>No suena nada en este momento.</p>
      )}
      <h3 className="mb-2 mt-8 text-[11px] font-extrabold uppercase tracking-[.22em]" style={{ color: accent }}>Siguientes</h3>
      {state.queue.length === 0 ? (
        <p style={{ color: C.mute }}>La cola está vacía.</p>
      ) : (
        <ol className="space-y-2">
          {state.queue.map((r: any, i: number) => (
            <li key={r.id} className="flex items-center gap-3 rounded-xl p-2.5" style={{ background: C.card2 }}>
              <span className="w-5 text-center text-sm font-bold" style={{ color: C.mute }}>{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold">{r.title}</span>
                <span className="text-xs" style={{ color: C.mute }}>{r.tableName}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );

  const mineView = (
    <div className="flex-1">
      <button onClick={() => setView('chat')} className="mb-5 text-sm underline underline-offset-4" style={{ color: C.mute }}>← Pedir una canción</button>
      <h2 className="text-2xl font-black tracking-tight">Mi música</h2>
      <p className="mt-1 text-sm" style={{ color: C.mute }}>{state.table.name} · {holding} de {state.maxPending} sin terminar</p>
      {mine.length === 0 ? (
        <p className="mt-6" style={{ color: C.mute }}>Aún no has pedido canciones.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {mine.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-2xl border p-2.5" style={{ background: C.card, borderColor: C.line }}>
              <Thumb src={r.thumbnail} className="h-11 w-11 !rounded-lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold">{r.title}</span>
                <span className={`text-xs font-semibold ${STATUS_COLOR[r.status]}`}>
                  {STATUS_LABEL[r.status]}{r.status === 'REJECTED' && r.rejectionReason ? `: ${r.rejectionReason}` : ''}
                </span>
              </span>
              {WAITING.includes(r.status) && <button className="text-xs underline underline-offset-2" style={{ color: C.mute }} onClick={() => cancel(r.id)}>Cancelar</button>}
            </li>
          ))}
        </ul>
      )}
      {k.canRate && (
        <div className="mt-8 rounded-2xl border p-4 text-center" style={{ background: C.card, borderColor: C.line }}>
          <div className="text-sm font-bold">¿Cómo va tu experiencia?</div>
          <div className="mt-2 flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} aria-label={`${n} de 5`} className="text-3xl transition active:scale-90" onClick={() => k.sendFeedback(n)}>⭐</button>
            ))}
          </div>
          <button className="mt-2 text-xs" style={{ color: C.mute }} onClick={k.dismissFeedback}>Ahora no</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="cl relative min-h-dvh overflow-x-clip" style={{ background: C.bg, color: C.cream, colorScheme: 'dark', '--ac': accent, '--on': on } as CSSProperties}>
      <style>{CSS}</style>
      <div className="cl-glow pointer-events-none absolute right-0 top-0 h-[26rem] w-[26rem] rounded-full blur-3xl" style={{ background: `radial-gradient(circle,${accent}2e,transparent 65%)` }} aria-hidden />
      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-24 pt-5">
        <header className="mb-6 flex items-center justify-between gap-3">
          <img src="/logo.png" alt="TONO" className="h-9 w-auto" />
          <div className="min-w-0 text-right text-xs leading-tight">
            <div className="truncate font-extrabold" style={{ color: C.cream }}>{state.business.name}</div>
            <div className="mt-0.5 font-bold" style={{ color: accent }}>{state.table.name}</div>
          </div>
        </header>
        {view === 'chat' ? chat : view === 'now' ? now : mineView}
      </div>

      {/* Navegacion minima */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-xl" style={{ borderColor: C.line, background: 'rgba(5,6,10,.85)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-md">
          {([['now', 'Sonando', state.queue.length], ['mine', 'Mi música', holding]] as const).map(([key, label, n]) => (
            <button key={key} onClick={() => setView(view === key ? 'chat' : key)} className="flex-1 py-4 text-sm font-extrabold transition" style={{ color: view === key ? accent : C.mute }}>
              {label}{n > 0 && <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold" style={{ background: accent, color: on }}>{n}</span>}
            </button>
          ))}
        </div>
      </nav>

      {/* Pantalla de carga al agregar la cancion */}
      {step === 'adding' && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6" style={{ background: C.bg }} role="status">
          <svg className="h-12 w-12 animate-spin" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="16" stroke="rgba(255,255,255,.12)" strokeWidth="4" />
            <path d="M20 4a16 16 0 0116 16" stroke={accent} strokeWidth="4" strokeLinecap="round" />
          </svg>
          <div className="px-8 text-center">
            <div className="text-lg font-black">{LOADING_LINES[lineIdx % LOADING_LINES.length]}</div>
            {picked && <div className="mt-2 line-clamp-2 text-sm" style={{ color: C.mute }}>{picked.song.title}</div>}
          </div>
        </div>
      )}
      {node}
    </div>
  );
}
