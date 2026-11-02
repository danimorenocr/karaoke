import { useEffect, useState } from 'react';
import { fmtDuration } from '../../lib/api';
import GoogleFallback from '../../core/GoogleFallback';
import { ExperienceProps, LOADING_LINES, STATUS_LABEL, WAITING } from '../../core/useKaraoke';
import './styles.css';

/** Experiencia "Golden Vinyl": un tocadiscos dorado. Una pantalla con el vinilo y tres pestañas. */
type Tab = 'pedir' | 'cola' | 'mias';

function Vinyl({ cover, spinning, size = 220 }: { cover?: string | null; spinning: boolean; size?: number }) {
  return (
    <div className="gv-vinyl-wrap" style={{ width: size, height: size }}>
      <div className={`gv-vinyl ${spinning ? 'is-spinning' : ''}`}>
        <div className="gv-label" style={cover ? { backgroundImage: `url(${cover})` } : undefined}><i /></div>
      </div>
      <div className={`gv-arm ${spinning ? 'is-on' : ''}`} />
    </div>
  );
}

export default function GoldenVinyl({ k }: ExperienceProps) {
  const { state, mine, holding, full, blocked, sorted, step, term, picked, google } = k;
  const [tab, setTab] = useState<Tab>('pedir');

  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = '#140d05';
    return () => { document.body.style.background = prev; };
  }, []);

  const current = state.current;
  const goTo = (t: Tab) => { setTab(t); window.scrollTo({ top: 0 }); };

  const pedir = (
    <section className="gv-section">
      <Vinyl cover={current?.thumbnail} spinning={!!current} />
      <p className="gv-now">
        {current ? <><span>Girando ahora</span><b>{current.title}</b><em>{current.tableName}</em></> : <><span>El disco está en pausa</span><b>Elige la próxima canción</b></>}
      </p>

      {step === 'ask' && (
        blocked || full ? (
          <p className="gv-note">{blocked || `Tu mesa ya tiene ${holding} canciones sin terminar (máximo ${state.maxPending}). Cuando termine una podrás pedir otra.`}</p>
        ) : (
          <form onSubmit={k.runSearch} className="gv-search">
            <input value={k.q} onChange={(e) => k.setQ(e.target.value)} placeholder="Canción, artista o link de YouTube" enterKeyHint="search" />
            <button disabled={k.q.trim().length < 3}>Buscar</button>
          </form>
        )
      )}

      {k.showSkeleton && <div className="gv-spin-row"><span className="gv-dot" /> Buscando en la discoteca…</div>}

      {step === 'results' && (
        <>
          <h3 className="gv-h">Resultados para «{term}»</h3>
          {sorted.length === 0 && !google.query && <p className="gv-note">No encontré nada. Prueba con otro nombre o con el artista.</p>}
          <ul className="gv-list">
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
                <button onClick={() => k.pick(g, 'google')}>
                  <img src={g.thumbnail} alt="" loading="lazy" />
                  <span><b>{g.title}</b></span>
                </button>
              </li>
            ))}
          </ul>
          <GoogleFallback k={k} />
          <button className="gv-link" onClick={() => k.setStep('ask')}>Buscar otra cosa</button>
        </>
      )}

      {step === 'confirm' && picked && (
        <div className="gv-card">
          <img src={picked.song.thumbnail} alt="" />
          <b>{picked.song.title}</b>
          <p>Se agregará a la cola de <b>{state.table.name}</b> ({holding + 1} de {state.maxPending}).</p>
          <div className="gv-actions">
            <button className="gv-gold" onClick={k.confirm}>Poner el disco</button>
            <button className="gv-ghost" onClick={() => k.setStep('results')}>Elegir otra</button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="gv-card">
          <b>¡Tu disco está en la bandeja!</b>
          <p>{k.doneText}</p>
          <div className="gv-actions">
            <button className="gv-gold" onClick={k.again}>Pedir otra</button>
            <button className="gv-ghost" onClick={() => goTo('cola')}>Ver la cola</button>
          </div>
        </div>
      )}

      {step === 'error' && (
        <div className="gv-card">
          <b>Algo salió mal</b>
          <p>{k.errorMsg || 'Inténtalo de nuevo.'}</p>
          <div className="gv-actions"><button className="gv-gold" onClick={() => k.setStep(picked ? 'results' : 'ask')}>Intentar de nuevo</button></div>
        </div>
      )}
    </section>
  );

  const cola = (
    <section className="gv-section">
      <h2 className="gv-title">La bandeja</h2>
      {current && (
        <div className="gv-playing">
          <Vinyl cover={current.thumbnail} spinning size={92} />
          <div><small>Sonando</small><b>{current.title}</b><em>{current.tableName}</em></div>
        </div>
      )}
      {state.queue.length === 0 ? <p className="gv-note">No hay discos esperando.</p> : (
        <ol className="gv-queue">
          {state.queue.map((r: any, i: number) => (
            <li key={r.id}><span>{String(i + 1).padStart(2, '0')}</span><div><b>{r.title}</b><small>{r.tableName}</small></div></li>
          ))}
        </ol>
      )}
    </section>
  );

  const mias = (
    <section className="gv-section">
      <h2 className="gv-title">Mi colección</h2>
      <p className="gv-note">{state.table.name} · {holding} de {state.maxPending} sin terminar</p>
      {mine.length === 0 ? <p className="gv-note">Aún no has pedido canciones.</p> : (
        <ul className="gv-list">
          {mine.map((r) => (
            <li key={r.id}>
              <div className="gv-row">
                <img src={r.thumbnail} alt="" loading="lazy" />
                <span>
                  <b>{r.title}</b>
                  <small>{STATUS_LABEL[r.status]}{r.status === 'REJECTED' && r.rejectionReason ? `: ${r.rejectionReason}` : ''}</small>
                </span>
                {WAITING.includes(r.status) && <button className="gv-link" onClick={() => k.cancel(r.id)}>Cancelar</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {k.canRate && (
        <div className="gv-card">
          <b>¿Cómo va tu noche?</b>
          <div className="gv-stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} aria-label={`${n} de 5`} onClick={() => k.sendFeedback(n)}>★</button>)}</div>
          <button className="gv-link" onClick={k.dismissFeedback}>Ahora no</button>
        </div>
      )}
    </section>
  );

  return (
    <div className="gv-root">
      <header className="gv-header">
        <span className="gv-brand">{state.business.name}</span>
        <span className="gv-table">{state.table.name}</span>
      </header>
      <main>{tab === 'pedir' ? pedir : tab === 'cola' ? cola : mias}</main>
      <nav className="gv-tabs">
        {([['pedir', 'Pedir', 0], ['cola', 'Cola', state.queue.length], ['mias', 'Mis discos', holding]] as const).map(([id, label, n]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => goTo(id)}>{label}{n > 0 && <i>{n}</i>}</button>
        ))}
      </nav>
      {step === 'adding' && (
        <div className="gv-overlay" role="status">
          <Vinyl cover={picked?.song.thumbnail} spinning size={180} />
          <p>{LOADING_LINES[k.lineIdx % LOADING_LINES.length]}</p>
        </div>
      )}
      {k.toastNode}
    </div>
  );
}
