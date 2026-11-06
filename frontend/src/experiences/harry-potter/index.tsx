import { useEffect, useRef, useState } from 'react';
import { fmtDuration } from '../../lib/api';
import GoogleFallback from '../../core/GoogleFallback';
import { ExperienceProps, LOADING_LINES, STATUS_LABEL, WAITING } from '../../core/useKaraoke';
import './styles.css';
import SearchKind from '../../core/SearchKind';

/**
 * Experiencia "Harry Potter": pergamino, castillo, lechuza y libros (sepia, dorado y granate).
 * Fondo: frontend/public/hp-bg.jpg (ilustracion sin texto); marca, bienvenida y subtitulo se escriben encima.
 */
type Tab = 'inicio' | 'cola' | 'mia';

export default function HarryPotter({ k }: ExperienceProps) {
  const { state, mine, holding, full, blocked, sorted, step, term, picked, google } = k;
  const [tab, setTab] = useState<Tab>('inicio');
  // Pantalla de carga con video al pedir la cancion: se muestra al menos 2,8 s para que se alcance a ver
  const [loader, setLoader] = useState<string | null>(null);
  const loaderSince = useRef(0);
  useEffect(() => {
    if (step === 'adding') { loaderSince.current = Date.now(); setLoader(picked?.song.title ?? ''); return; }
    if (loader === null) return;
    const id = setTimeout(() => setLoader(null), Math.max(0, 2800 - (Date.now() - loaderSince.current)));
    return () => clearTimeout(id);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = '#120b06';
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
      <div className="hp-stage">
        <div className="hp-brand">
          <svg className="hp-hat" viewBox="0 0 64 56" aria-hidden><path d="M8 46c10-2 14-8 17-20C27 14 33 6 44 4c-4 6-3 14 1 22 3 8 9 17 11 20-14 4-34 4-48 0z" fill="currentColor" /><path d="M6 46c18 5 42 5 52 0v4C44 56 18 55 6 50z" fill="currentColor" /><path d="M20 38c9 2 20 2 28 0" stroke="#d9a441" strokeWidth="2.4" fill="none" /></svg>
          <b className="hp-title">{state.business.name}</b>
          <span className="hp-mic"><i /><svg viewBox="0 0 24 24" aria-hidden><rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" /><path d="M5 11a7 7 0 0014 0M12 18v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg><i /></span>
          <span className="hp-kar"><i />KARAOKE<i /></span>
        </div>
        <div className="hp-hero">
          <h1>¡Bienvenido!</h1>
          <span className="hp-orn" aria-hidden><i />✦<i /></span>
          <p>Busca tu canción favorita<br />y súbela a la varita <svg className="hp-wand" viewBox="0 0 24 24" aria-hidden><path d="M4 20L15 9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><path d="M17 3l.9 2.1L20 6l-2.1.9L17 9l-.9-2.1L14 6l2.1-.9zM21 11l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" fill="currentColor" /></svg></p>
        </div>
      </div>

      {(step === 'ask' || step === 'searching' || step === 'results') && (
        blocked || full ? (
          <div className="hp-card hp-center">{blocked || `Tu mesa ya tiene ${holding} canciones sin terminar (máximo ${state.maxPending}). Cuando termine una podrás pedir otra.`}</div>
        ) : (
          <><SearchKind k={k} /><form onSubmit={k.runSearch} className="hp-search">
            <svg viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2.4" /><path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
            <input value={k.q} onChange={(e) => k.setQ(e.target.value)} placeholder="Buscar canción o pegar link de YouTube" enterKeyHint="search" />
            <svg className="hp-wand" viewBox="0 0 24 24" aria-hidden><path d="M4 20L15 9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><path d="M17 3l.9 2.1L20 6l-2.1.9L17 9l-.9-2.1L14 6l2.1-.9zM21 11l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" fill="currentColor" /></svg>
          </form></>
        )
      )}

      {step === 'ask' && !blocked && (
        <div className="hp-banner"><span>Tu mesa: {holding}/{state.maxPending} canciones sin terminar</span></div>
      )}

      {k.showSkeleton && <div className="hp-card hp-center hp-pulse">Buscando tu canción…</div>}

      {step === 'results' && (
        <>
          <div className="hp-banner"><span>Resultados · {term}</span></div>
          {sorted.length === 0 && !google.query && <div className="hp-card hp-center">No encontré nada. Prueba con otro nombre o con el artista.</div>}
          <ul className="hp-list">
            {sorted.map((s) => (
              <li key={s.videoId}>
                <button className="hp-card" onClick={() => k.pick(s, 'api')}>
                  <img src={s.thumbnail} alt="" loading="lazy" />
                  <span><b>{s.title}</b><small>{s.channelTitle} {fmtDuration(s.durationSec)}</small></span>
                </button>
              </li>
            ))}
            {google.query && google.items.map((g) => (
              <li key={g.videoId}>
                <button className="hp-card" onClick={() => k.pick(g, 'google')}><img src={g.thumbnail} alt="" loading="lazy" /><span><b>{g.title}</b></span></button>
              </li>
            ))}
          </ul>
          <GoogleFallback k={k} light />
          <button className="hp-link" onClick={() => k.setStep('ask')}>Buscar otra cosa</button>
        </>
      )}

      {step === 'error' && (
        <div className="hp-card hp-stack hp-center">
          <p>{k.errorMsg || 'Algo salió mal.'}</p>
          <button className="hp-btn" onClick={() => k.setStep(picked ? 'results' : 'ask')}>Intentar de nuevo</button>
        </div>
      )}

      {current && (
        <div className="hp-card hp-now">
          <img src={current.thumbnail} alt="" />
          <span><small>SONANDO AHORA · {current.tableName.toUpperCase()}</small><b>{current.title}</b></span>
          <div className="hp-eq" aria-hidden><i /><i /><i /><i /><i /></div>
        </div>
      )}
    </>
  );

  const cola = (
    <>
      <div className="hp-hero small"><h1>La cola</h1><i className="hp-stroke" /></div>
      {current && (
        <div className="hp-card hp-now">
          <img src={current.thumbnail} alt="" />
          <span><small>SONANDO AHORA · {current.tableName.toUpperCase()}</small><b>{current.title}</b></span>
          <div className="hp-eq" aria-hidden><i /><i /><i /><i /><i /></div>
        </div>
      )}
      {state.queue.length === 0 ? <div className="hp-card hp-center">La cola está vacía. ¡Sé el primero!</div> : (
        <ol className="hp-list">
          {state.queue.map((r: any, i: number) => (
            <li key={r.id} className="hp-card hp-qrow"><em>{i + 1}</em><img src={r.thumbnail} alt="" loading="lazy" /><span><b>{r.title}</b><small>{r.tableName}</small></span></li>
          ))}
        </ol>
      )}
    </>
  );

  const mia = (
    <>
      <div className="hp-hero small"><h1>Mi solicitud</h1><i className="hp-stroke" /></div>
      <div className="hp-banner"><span>{state.table.name}: {holding}/{state.maxPending} sin terminar</span></div>
      {mine.length === 0 ? <div className="hp-card hp-center">Aún no has pedido canciones.</div> : (
        <ul className="hp-list">
          {mine.map((r) => (
            <li key={r.id} className="hp-card hp-qrow">
              <img src={r.thumbnail} alt="" loading="lazy" />
              <span><b>{r.title}</b><small className={`st-${r.status}`}>{STATUS_LABEL[r.status]}{r.status === 'REJECTED' && r.rejectionReason ? `: ${r.rejectionReason}` : ''}</small></span>
              {WAITING.includes(r.status) && <button className="hp-link" onClick={() => k.cancel(r.id)}>Cancelar</button>}
            </li>
          ))}
        </ul>
      )}
      {k.canRate && (
        <div className="hp-card hp-stack hp-center">
          <b className="hp-script">¿Cómo va la velada?</b>
          <div className="hp-stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} aria-label={`${n} de 5`} onClick={() => k.sendFeedback(n)}>★</button>)}</div>
          <button className="hp-link" onClick={k.dismissFeedback}>Ahora no</button>
        </div>
      )}
    </>
  );

  return (
    <div className="hp-root">
      <div className="hp-bg" aria-hidden />
      <header className="hp-top">
        <span className="hp-table"><svg viewBox="0 0 24 24" aria-hidden><path d="M4 8h16M6 8v12M18 8v12M3 8l1-3h16l1 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>{state.table.name}</span>
      </header>

      <main className={`hp-main ${tab === 'inicio' ? 'home' : ''}`} key={tab}>{tab === 'inicio' ? inicio : tab === 'cola' ? cola : mia}</main>

      <nav className="hp-nav">
        {([['inicio', 'Inicio', 0, 'M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z'], ['cola', 'Cola', state.queue.length, 'M4 6h16M4 12h16M4 18h10'], ['mia', 'Mi solicitud', holding, 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z']] as const).map(([id, label, n, d]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => go(id)}>
            <span className="hp-ico"><svg viewBox="0 0 24 24" aria-hidden><path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>{n > 0 && <i>{n}</i>}</span>
            {label}
          </button>
        ))}
      </nav>

      {step === 'confirm' && picked && (
        <div className="hp-modal" role="dialog" aria-modal="true" aria-labelledby="hp-confirm-title" onClick={() => k.setStep('results')}>
          <div className="hp-dialog" onClick={(e) => e.stopPropagation()}>
            <span className="hp-script" id="hp-confirm-title">¿Lanzamos el hechizo?</span>
            {picked.song.thumbnail && <img className="hp-thumb" src={picked.song.thumbnail} alt="" />}
            <b>{picked.song.title}</b>
            <p>Se agregará a la cola a nombre de <b>{state.table.name}</b> ({holding + 1} de {state.maxPending} permitidas).</p>
            <div className="hp-actions">
              <button className="hp-btn" onClick={k.confirm}>¡Pedirla!</button>
              <button className="hp-btn alt" onClick={() => k.setStep('results')}>Elegir otra</button>
            </div>
          </div>
        </div>
      )}

      {/* El video se descarga al abrir la confirmacion (oculto) para que ya este listo al pedir */}
      {(step === 'confirm' || loader !== null) && (
        <div className={`hp-over ${loader !== null ? 'on' : ''}`} role="status" aria-hidden={loader === null}>
          <video className="hp-vid" src="/hp-loading.mp4" poster="/hp-loading-poster.jpg" autoPlay muted loop playsInline preload="auto" />
          <div className="hp-over-text">
            <p>{LOADING_LINES[k.lineIdx % LOADING_LINES.length]}</p>
            {loader && <small>{loader}</small>}
          </div>
        </div>
      )}
      {k.toastNode}
    </div>
  );
}
