import { Suspense, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { clientId, pub } from '../lib/api';
import { Karaoke, useKaraoke } from '../core/useKaraoke';
import { getExperience } from '../experiences';

const getVoted = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem('karaoke_votes') || '{}'); } catch { return {}; } };

/** Modo votacion: hoja inferior comun a todas las experiencias para calificar la cancion que acaba de sonar. */
function VoteSheet({ k }: { k: Karaoke }) {
  const v = k.state?.vote;
  const [voted, setVoted] = useState<Record<string, number>>(getVoted);
  const [hover, setHover] = useState(0);
  const [busy, setBusy] = useState(false);
  if (!v) return null;
  const mine = voted[v.id];
  const send = async (rating: number) => {
    if (busy) return;
    setBusy(true);
    try {
      await pub('POST', `/public/${k.token}/vote`, { requestId: v.id, rating, clientId: clientId() });
      const next = { ...voted, [v.id]: rating };
      setVoted(next);
      try { localStorage.setItem('karaoke_votes', JSON.stringify(Object.fromEntries(Object.entries(next).slice(-20)))); } catch { /* */ }
    } catch (e: any) { k.toast(e.message, true); } finally { setBusy(false); }
  };
  const shown = hover || mine || 0;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-3" role="dialog" aria-label="Votar la canción">
      <div className="mx-auto max-w-md rounded-2xl p-4 text-center shadow-2xl" style={{ background: '#111827', color: '#f9fafb', border: '1px solid rgba(255,255,255,.12)', colorScheme: 'dark' }}>
        <div className="text-[11px] font-bold uppercase tracking-widest text-amber-300">{v.mine ? 'Tu canción acaba de sonar' : '¿Qué tal estuvo?'}</div>
        <div className="mt-1 truncate text-base font-bold">{v.title}</div>
        {v.tableName && <div className="text-xs text-slate-400">{v.mine ? 'Los demás la están calificando' : `Mesa ${v.tableName.replace(/^mesa\s*/i, '')}`}</div>}
        {!v.mine && (
          <div className="mt-3 flex justify-center gap-1.5" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} disabled={busy} onMouseEnter={() => setHover(n)} onClick={() => send(n)} aria-label={`${n} estrella${n > 1 ? 's' : ''}`} className="text-4xl leading-none transition active:scale-90" style={{ color: n <= shown ? '#fbbf24' : '#475569' }}>★</button>
            ))}
          </div>
        )}
        <div className="mt-2 text-xs text-slate-300">
          {mine ? `¡Gracias! Votaste ${mine} ★ · ` : ''}{v.count ? `Promedio ${v.avg} ★ (${v.count} voto${v.count === 1 ? '' : 's'})` : v.mine ? 'Aún sin votos' : 'Sé la primera persona en votar'}
        </div>
      </div>
    </div>
  );
}

/**
 * Pantalla del comensal. El backend dice que experiencia (diseno) tiene asignada la mesa
 * del QR; aqui se carga solo esa. El motor de karaoke (core/useKaraoke) es comun a todas.
 */
export default function Customer() {
  const { token } = useParams();
  const k = useKaraoke(token);
  const [params] = useSearchParams();

  if (k.invalid) return <div className="grid min-h-dvh place-items-center bg-white p-8 text-center text-neutral-600" style={{ colorScheme: 'light' }}>Este código QR no es válido o fue desactivado.<br />Pide ayuda al personal.</div>;
  if (!k.state) return <div className="grid min-h-dvh place-items-center bg-white text-neutral-400" style={{ colorScheme: 'light' }}>Cargando…</div>;

  const Experience = getExperience(params.get('preview') || k.state.table.experienceId);
  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center bg-white text-neutral-400" style={{ colorScheme: 'light' }}>Cargando…</div>}>
      <Experience k={k} />
      <VoteSheet k={k} />
      {/* Aviso de privacidad visible desde la primera pantalla (Ley 1581 de 2012) */}
      <p className="px-4 pb-36 pt-3 text-center text-[11px]" style={{ color: '#a39a8c', textShadow: '0 0 4px rgba(0,0,0,.45)' }}>
        Al usar el servicio aceptas los <Link to="/terminos" className="underline">Términos</Link> y la <Link to="/privacidad" className="underline">Política de privacidad</Link>.
      </p>
    </Suspense>
  );
}
