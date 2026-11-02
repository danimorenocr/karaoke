import { useEffect, useState } from 'react';
import { fmtDuration } from '../../lib/api';
import GoogleFallback from '../../core/GoogleFallback';
import { ExperienceProps, LOADING_LINES, STATUS_LABEL, WAITING } from '../../core/useKaraoke';
import './styles.css';

/**
 * Experiencia "Latin Collage": collage latino de papel y pintura (turquesa, naranja, crema).
 * Fondo: frontend/public/latin-collage-bg.jpg (ilustracion sin texto).
 */
type Tab = 'inicio' | 'cola' | 'mia';

export default function LatinCollage({ k }: ExperienceProps) {
  const { state, mine, holding, full, blocked, sorted, step, term, picked, google } = k;
  const [tab, setTab] = useState<Tab>('inicio');

  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = '#1f4e5f';
    return () => { document.body.style.background = prev; };
  }, []);

  // Busca sola mientras escribe (sin pulsar "Ir"): espera a que deje de teclear
  const typed = k.q.trim();
  useEffect(() => {
    if (typed.length < 3 || typed === term || blocked || full) return;
    if (step !== 'ask' && step !== 'results') return;
    const id = setTimeout(() => k.runSearch(), 800);
    return () => clearTimeout(id);
  }, [typed, term, step, blocked, full]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al pedir la cancion no se muestra pantalla de "listo": solo un aviso y se vuelve al buscador
  useEffect(() => {
    if (step !== 'done') return;
    k.toast(`¡Pedida! ${k.doneText}`);
    k.again();
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = state.current;
  const go = (t: Tab) => { setTab(t); window.scrollTo({ top: 0 }); };

  const inicio = (
    <>
      <div className="lc-hero">
        <h1>¡Bienvenido!</h1>
        <i className="lc-stroke" />
        <p>Busca tu canción favorita y<br />súbela a la cola 🎤</p>
      </div>

      {(step === 'ask' || step === 'searching' || step === 'results') && (
        blocked || full ? (
          <div className="lc-card lc-center">{blocked || `Tu mesa ya tiene ${holding} canciones sin terminar (máximo ${state.maxPending}). Cuando termine una podrás pedir otra.`}</div>
        ) : (
          <form onSubmit={k.runSearch} className="lc-search">
            <svg viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2.4" /><path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
            <input value={k.q} onChange={(e) => k.setQ(e.target.value)} placeholder="Buscar canción o pegar link de YouTube" enterKeyHint="search" />
          </form>
        )
      )}

      {step === 'ask' && !blocked && (
        <div className="lc-banner"><span>Tu mesa: {holding}/{state.maxPending} canciones sin terminar</span></div>
      )}

      {k.showSkeleton && <div className="lc-card lc-center lc-pulse">Buscando tu canción…</div>}

      {step === 'results' && (
        <>
          <div className="lc-banner"><span>Resultados · {term}</span></div>
          {sorted.length === 0 && !google.query && <div className="lc-card lc-center">No encontré nada. Prueba con otro nombre o con el artista.</div>}
          <ul className="lc-list">
            {sorted.map((s) => (
              <li key={s.videoId}>
                <button className="lc-card" onClick={() => k.pick(s, 'api')}>
                  <img src={s.thumbnail} alt="" loading="lazy" />
                  <span><b>{s.title}</b><small>{s.channelTitle} {fmtDuration(s.durationSec)}</small></span>
                </button>
              </li>
            ))}
            {google.query && google.items.map((g) => (
              <li key={g.videoId}>
                <button className="lc-card" onClick={() => k.pick(g, 'google')}><img src={g.thumbnail} alt="" loading="lazy" /><span><b>{g.title}</b></span></button>
              </li>
            ))}
          </ul>
          <GoogleFallback k={k} light />
          <button className="lc-link" onClick={() => k.setStep('ask')}>Buscar otra cosa</button>
        </>
      )}

      {step === 'error' && (
        <div className="lc-card lc-stack lc-center">
          <p>{k.errorMsg || 'Algo salió mal.'}</p>
          <button className="lc-btn" onClick={() => k.setStep(picked ? 'results' : 'ask')}>Intentar de nuevo</button>
        </div>
      )}

      {current && (
        <div className="lc-card lc-now">
          <img src={current.thumbnail} alt="" />
          <span><small>SONANDO AHORA · {current.tableName.toUpperCase()}</small><b>{current.title}</b></span>
          <div className="lc-eq" aria-hidden><i /><i /><i /><i /><i /></div>
        </div>
      )}
    </>
  );

  const cola = (
    <>
      <div className="lc-hero small"><h1>La cola</h1><i className="lc-stroke" /></div>
      {current && (
        <div className="lc-card lc-now">
          <img src={current.thumbnail} alt="" />
          <span><small>SONANDO AHORA · {current.tableName.toUpperCase()}</small><b>{current.title}</b></span>
          <div className="lc-eq" aria-hidden><i /><i /><i /><i /><i /></div>
        </div>
      )}
      {state.queue.length === 0 ? <div className="lc-card lc-center">La cola está vacía. ¡Sé el primero!</div> : (
        <ol className="lc-list">
          {state.queue.map((r: any, i: number) => (
            <li key={r.id} className="lc-card lc-qrow"><em>{i + 1}</em><span><b>{r.title}</b><small>{r.tableName}</small></span></li>
          ))}
        </ol>
      )}
    </>
  );

  const mia = (
    <>
      <div className="lc-hero small"><h1>Mi solicitud</h1><i className="lc-stroke" /></div>
      <div className="lc-banner"><span>{state.table.name}: {holding}/{state.maxPending} sin terminar</span></div>
      {mine.length === 0 ? <div className="lc-card lc-center">Aún no has pedido canciones.</div> : (
        <ul className="lc-list">
          {mine.map((r) => (
            <li key={r.id} className="lc-card lc-qrow">
              <img src={r.thumbnail} alt="" loading="lazy" />
              <span><b>{r.title}</b><small className={`st-${r.status}`}>{STATUS_LABEL[r.status]}{r.status === 'REJECTED' && r.rejectionReason ? `: ${r.rejectionReason}` : ''}</small></span>
              {WAITING.includes(r.status) && <button className="lc-link" onClick={() => k.cancel(r.id)}>Cancelar</button>}
            </li>
          ))}
        </ul>
      )}
      {k.canRate && (
        <div className="lc-card lc-stack lc-center">
          <b className="lc-script">¿Cómo va la fiesta?</b>
          <div className="lc-stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} aria-label={`${n} de 5`} onClick={() => k.sendFeedback(n)}>★</button>)}</div>
          <button className="lc-link" onClick={k.dismissFeedback}>Ahora no</button>
        </div>
      )}
    </>
  );

  return (
    <div className="lc-root">
      <div className="lc-bg" aria-hidden />
      <header className="lc-top">
        <div className="lc-brand">
          <span className="lc-mic"><svg viewBox="0 0 24 24" aria-hidden><rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" /><path d="M5 11a7 7 0 0014 0M12 18v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
          <span className="lc-name">{state.business.name}</span>
        </div>
        <span className="lc-table"><svg viewBox="0 0 24 24" aria-hidden><path d="M4 8h16M6 8v12M18 8v12M3 8l1-3h16l1 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>{state.table.name}</span>
      </header>

      <main className="lc-main" key={tab}>{tab === 'inicio' ? inicio : tab === 'cola' ? cola : mia}</main>

      <nav className="lc-nav">
        {([['inicio', 'Inicio', 0, 'M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z'], ['cola', 'Cola', state.queue.length, 'M4 6h16M4 12h16M4 18h10'], ['mia', 'Mi solicitud', holding, 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z']] as const).map(([id, label, n, d]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => go(id)}>
            <span className="lc-ico"><svg viewBox="0 0 24 24" aria-hidden><path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>{n > 0 && <i>{n}</i>}</span>
            {label}
          </button>
        ))}
      </nav>

      {step === 'confirm' && picked && (
        <div className="lc-modal" role="dialog" aria-modal="true" aria-labelledby="lc-confirm-title" onClick={() => k.setStep('results')}>
          <div className="lc-dialog" onClick={(e) => e.stopPropagation()}>
            <span className="lc-script" id="lc-confirm-title">¿La pedimos?</span>
            <b>{picked.song.title}</b>
            <p>Se agregará a la cola a nombre de <b>{state.table.name}</b> ({holding + 1} de {state.maxPending} permitidas).</p>
            <div className="lc-actions">
              <button className="lc-btn" onClick={k.confirm}>¡Pedirla!</button>
              <button className="lc-btn alt" onClick={() => k.setStep('results')}>Elegir otra</button>
            </div>
          </div>
        </div>
      )}

      {step === 'adding' && (
        <div className="lc-over" role="status">
          <div className="lc-vinyl" />
          <p>{LOADING_LINES[k.lineIdx % LOADING_LINES.length]}</p>
          {picked && <small>{picked.song.title}</small>}
        </div>
      )}
      {k.toastNode}
    </div>
  );
}
