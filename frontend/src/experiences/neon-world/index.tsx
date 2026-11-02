import { useEffect, useState } from 'react';
import { fmtDuration } from '../../lib/api';
import GoogleFallback from '../../core/GoogleFallback';
import { ExperienceProps, LOADING_LINES, STATUS_LABEL, WAITING } from '../../core/useKaraoke';
import './styles.css';

/** Experiencia "Neon World": consola futurista (HUD) con módulos de neón. Navegación por módulos laterales. */
type Mod = 'request' | 'queue' | 'mine';

export default function NeonWorld({ k }: ExperienceProps) {
  const { state, mine, holding, full, blocked, sorted, step, term, picked, google } = k;
  const [mod, setMod] = useState<Mod>('request');

  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = '#05051a';
    return () => { document.body.style.background = prev; };
  }, []);

  const current = state.current;

  return (
    <div className="nw-root">
      <div className="nw-grid" aria-hidden />
      <header className="nw-top">
        <div><small>// SISTEMA</small><b>{state.business.name}</b></div>
        <div className="nw-chip">{state.table.name}</div>
      </header>

      <div className={`nw-deck ${current ? 'live' : ''}`}>
        <div className="nw-eq" aria-hidden>{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ animationDelay: `${i * 90}ms` }} />)}</div>
        <small>{current ? '▶ TRANSMITIENDO' : '■ EN ESPERA'}</small>
        <b>{current ? current.title : 'Escenario libre'}</b>
        <span>{current ? current.tableName : 'Lanza la próxima señal'}</span>
      </div>

      <nav className="nw-mods">
        {([['request', 'Solicitar', 0], ['queue', 'Cola', state.queue.length], ['mine', 'Mis señales', holding]] as const).map(([id, label, n]) => (
          <button key={id} className={mod === id ? 'on' : ''} onClick={() => setMod(id)}>{label}{n > 0 && <i>{n}</i>}</button>
        ))}
      </nav>

      <main className="nw-main">
        {mod === 'request' && (
          <>
            {step === 'ask' && (
              blocked || full ? (
                <div className="nw-panel warn">{blocked || `LÍMITE ALCANZADO: ${holding}/${state.maxPending} señales activas. Espera a que termine una.`}</div>
              ) : (
                <form onSubmit={k.runSearch} className="nw-search">
                  <span>&gt;_</span>
                  <input value={k.q} onChange={(e) => k.setQ(e.target.value)} placeholder="canción, artista o link" enterKeyHint="search" />
                  <button disabled={k.q.trim().length < 3}>BUSCAR</button>
                </form>
              )
            )}

            {k.showSkeleton && <div className="nw-scan">ESCANEANDO LA RED<i /></div>}

            {step === 'results' && (
              <>
                <div className="nw-label">RESULTADOS · {term}</div>
                {sorted.length === 0 && !google.query && <div className="nw-panel">Sin coincidencias. Reintenta con otro término.</div>}
                <ul className="nw-list">
                  {sorted.map((s) => (
                    <li key={s.videoId}>
                      <button onClick={() => k.pick(s, 'api')}>
                        <img src={s.thumbnail} alt="" loading="lazy" />
                        <span><b>{s.title}</b><small>{s.channelTitle} {fmtDuration(s.durationSec)}</small></span>
                      </button>
                    </li>
                  ))}
                  {google.query && google.items.map((g) => (
                    <li key={g.videoId}>
                      <button onClick={() => k.pick(g, 'google')}><img src={g.thumbnail} alt="" loading="lazy" /><span><b>{g.title}</b></span></button>
                    </li>
                  ))}
                </ul>
                <GoogleFallback k={k} />
                <button className="nw-ghost" onClick={() => k.setStep('ask')}>← NUEVA BÚSQUEDA</button>
              </>
            )}

            {step === 'confirm' && picked && (
              <div className="nw-panel">
                <div className="nw-label">CONFIRMAR TRANSMISIÓN</div>
                <img className="nw-cover" src={picked.song.thumbnail} alt="" />
                <b>{picked.song.title}</b>
                <p>Mesa {state.table.name} · {holding + 1}/{state.maxPending} señales</p>
                <div className="nw-actions">
                  <button className="nw-go" onClick={k.confirm}>ENVIAR</button>
                  <button className="nw-ghost" onClick={() => k.setStep('results')}>CAMBIAR</button>
                </div>
              </div>
            )}

            {step === 'done' && (
              <div className="nw-panel ok">
                <div className="nw-label">SEÑAL ENVIADA ✓</div>
                <p>{k.doneText}</p>
                <div className="nw-actions">
                  <button className="nw-go" onClick={k.again}>OTRA</button>
                  <button className="nw-ghost" onClick={() => setMod('queue')}>VER COLA</button>
                </div>
              </div>
            )}

            {step === 'error' && (
              <div className="nw-panel warn">
                <div className="nw-label">ERROR</div>
                <p>{k.errorMsg || 'Algo falló.'}</p>
                <button className="nw-go" onClick={() => k.setStep(picked ? 'results' : 'ask')}>REINTENTAR</button>
              </div>
            )}
          </>
        )}

        {mod === 'queue' && (
          <>
            <div className="nw-label">COLA DE TRANSMISIÓN</div>
            {state.queue.length === 0 ? <div className="nw-panel">Cola vacía.</div> : (
              <ol className="nw-queue">
                {state.queue.map((r: any, i: number) => (
                  <li key={r.id}><em>{String(i + 1).padStart(2, '0')}</em><span><b>{r.title}</b><small>{r.tableName}</small></span></li>
                ))}
              </ol>
            )}
          </>
        )}

        {mod === 'mine' && (
          <>
            <div className="nw-label">MIS SEÑALES · {holding}/{state.maxPending}</div>
            {mine.length === 0 ? <div className="nw-panel">Aún no has enviado nada.</div> : (
              <ul className="nw-list">
                {mine.map((r) => (
                  <li key={r.id}>
                    <div className="nw-row">
                      <img src={r.thumbnail} alt="" loading="lazy" />
                      <span><b>{r.title}</b><small className={`st-${r.status}`}>{STATUS_LABEL[r.status]}{r.status === 'REJECTED' && r.rejectionReason ? `: ${r.rejectionReason}` : ''}</small></span>
                      {WAITING.includes(r.status) && <button className="nw-x" onClick={() => k.cancel(r.id)}>✕</button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {k.canRate && (
              <div className="nw-panel">
                <div className="nw-label">EVALUAR EXPERIENCIA</div>
                <div className="nw-stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} aria-label={`${n} de 5`} onClick={() => k.sendFeedback(n)}>◆</button>)}</div>
                <button className="nw-ghost" onClick={k.dismissFeedback}>OMITIR</button>
              </div>
            )}
          </>
        )}
      </main>

      {step === 'adding' && (
        <div className="nw-over" role="status">
          <div className="nw-ring" />
          <p>{LOADING_LINES[k.lineIdx % LOADING_LINES.length]}</p>
        </div>
      )}
      {k.toastNode}
    </div>
  );
}
