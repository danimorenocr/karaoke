import { useEffect } from 'react';
import { fmtDuration } from '../../lib/api';
import GoogleFallback from '../../core/GoogleFallback';
import { ExperienceProps, LOADING_LINES, STATUS_LABEL, WAITING } from '../../core/useKaraoke';
import './styles.css';

/** Experiencia "Editorial": una página de revista, de lectura continua (sin pestañas). */
export default function Editorial({ k }: ExperienceProps) {
  const { state, mine, holding, full, blocked, sorted, step, term, picked, google } = k;

  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = '#f4efe6';
    return () => { document.body.style.background = prev; };
  }, []);

  const current = state.current;
  const date = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="ed-root">
      <header className="ed-mast">
        <div className="ed-meta"><span>{date}</span><span>{state.table.name}</span></div>
        <h1>{state.business.name}</h1>
        <div className="ed-sub">Edición Karaoke · Nº {state.queue.length + (current ? 1 : 0)} en cartel</div>
      </header>

      {/* 01 · En escena */}
      <section className="ed-sec">
        <div className="ed-kicker">En escena</div>
        {current ? (
          <div className="ed-feature">
            {current.thumbnail && <img src={current.thumbnail} alt="" />}
            <h2>{current.title}</h2>
            <p>Interpreta <i>{current.tableName}</i></p>
          </div>
        ) : <p className="ed-lede">El escenario está libre. <i>Sé el primero en subir.</i></p>}
      </section>

      {/* 02 · Pedir */}
      <section className="ed-sec">
        <div className="ed-kicker">Tu turno</div>
        <h2 className="ed-h">¿Qué vas a cantar?</h2>

        {step === 'ask' && (
          blocked || full ? (
            <p className="ed-lede">{blocked || `Tu mesa ya tiene ${holding} canciones sin terminar (máximo ${state.maxPending}). Cuando termine una podrás pedir otra.`}</p>
          ) : (
            <form onSubmit={k.runSearch} className="ed-search">
              <input value={k.q} onChange={(e) => k.setQ(e.target.value)} placeholder="Título, artista o link de YouTube" enterKeyHint="search" />
              <button disabled={k.q.trim().length < 3}>Buscar →</button>
            </form>
          )
        )}

        {k.showSkeleton && <p className="ed-lede ed-blink">Buscando en el archivo…</p>}

        {step === 'results' && (
          <>
            <div className="ed-rule">Resultados · «{term}»</div>
            {sorted.length === 0 && !google.query && <p className="ed-lede">Sin resultados. Prueba con otro título o con el artista.</p>}
            <ol className="ed-results">
              {sorted.map((s, i) => (
                <li key={s.videoId}>
                  <button onClick={() => k.pick(s, 'api')}>
                    <em>{String(i + 1).padStart(2, '0')}</em>
                    <span><b>{s.title}</b><small>{s.channelTitle} {fmtDuration(s.durationSec)}</small></span>
                    <img src={s.thumbnail} alt="" loading="lazy" />
                  </button>
                </li>
              ))}
              {google.query && google.items.map((g, i) => (
                <li key={g.videoId}>
                  <button onClick={() => k.pick(g, 'google')}>
                    <em>{String(sorted.length + i + 1).padStart(2, '0')}</em>
                    <span><b>{g.title}</b></span>
                    <img src={g.thumbnail} alt="" loading="lazy" />
                  </button>
                </li>
              ))}
            </ol>
            <GoogleFallback k={k} light />
            <button className="ed-link" onClick={() => k.setStep('ask')}>Buscar otra cosa</button>
          </>
        )}

        {step === 'confirm' && picked && (
          <div className="ed-confirm">
            <div className="ed-rule">¿La publicamos?</div>
            {picked.song.thumbnail && <img src={picked.song.thumbnail} alt="" />}
            <h3>{picked.song.title}</h3>
            <p>A nombre de {state.table.name} · {holding + 1} de {state.maxPending} permitidas.</p>
            <div className="ed-actions">
              <button className="ed-btn" onClick={k.confirm}>Sí, pedirla</button>
              <button className="ed-btn alt" onClick={() => k.setStep('results')}>Elegir otra</button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="ed-confirm">
            <div className="ed-rule">Publicado</div>
            <p className="ed-lede">{k.doneText}</p>
            <div className="ed-actions"><button className="ed-btn" onClick={k.again}>Pedir otra</button></div>
          </div>
        )}

        {step === 'error' && (
          <div className="ed-confirm">
            <div className="ed-rule">Fe de erratas</div>
            <p className="ed-lede">{k.errorMsg || 'Algo salió mal.'}</p>
            <div className="ed-actions"><button className="ed-btn" onClick={() => k.setStep(picked ? 'results' : 'ask')}>Intentar de nuevo</button></div>
          </div>
        )}
      </section>

      {/* 03 · Cola */}
      <section className="ed-sec">
        <div className="ed-kicker">Próximamente</div>
        {state.queue.length === 0 ? <p className="ed-lede">Nada en cartelera todavía.</p> : (
          <ol className="ed-toc">
            {state.queue.map((r: any, i: number) => (
              <li key={r.id}><em>{i + 1}</em><span><b>{r.title}</b><small>{r.tableName}</small></span></li>
            ))}
          </ol>
        )}
      </section>

      {/* 04 · Mis pedidos */}
      <section className="ed-sec">
        <div className="ed-kicker">Tus pedidos · {holding}/{state.maxPending}</div>
        {mine.length === 0 ? <p className="ed-lede">Aún no has pedido nada.</p> : (
          <ul className="ed-toc">
            {mine.map((r) => (
              <li key={r.id}>
                <span>
                  <b>{r.title}</b>
                  <small className={`st-${r.status}`}>{STATUS_LABEL[r.status]}{r.status === 'REJECTED' && r.rejectionReason ? `: ${r.rejectionReason}` : ''}</small>
                </span>
                {WAITING.includes(r.status) && <button className="ed-link" onClick={() => k.cancel(r.id)}>Retirar</button>}
              </li>
            ))}
          </ul>
        )}
        {k.canRate && (
          <div className="ed-confirm">
            <div className="ed-rule">Cartas al director</div>
            <p className="ed-lede">¿Cómo califica la velada?</p>
            <div className="ed-stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} aria-label={`${n} de 5`} onClick={() => k.sendFeedback(n)}>{n}</button>)}</div>
            <button className="ed-link" onClick={k.dismissFeedback}>Ahora no</button>
          </div>
        )}
      </section>

      <footer className="ed-foot">— {state.business.name} —</footer>

      {step === 'adding' && (
        <div className="ed-over" role="status">
          <div className="ed-press">En imprenta</div>
          <p>{LOADING_LINES[k.lineIdx % LOADING_LINES.length]}</p>
        </div>
      )}
      {k.toastNode}
    </div>
  );
}
