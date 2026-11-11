import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { clientId, pub } from '../lib/api';
import { Karaoke, useKaraoke } from '../core/useKaraoke';
import { getExperience } from '../experiences';

const getVoted = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem('karaoke_votes') || '{}'); } catch { return {}; } };

const RATINGS = [
  { e: '😅', t: 'Le falta práctica' },
  { e: '🙂', t: 'Va mejorando' },
  { e: '😄', t: '¡Estuvo bien!' },
  { e: '🔥', t: '¡Muy bien!' },
  { e: '🤩', t: '¡Show total!' },
];

/** Modo competencia: pantalla comun a todas las experiencias para calificar la actuacion que acaba de terminar. */
function VoteSheet({ k }: { k: Karaoke }) {
  const v = k.state?.vote;
  const [voted, setVoted] = useState<Record<string, number>>(getVoted);
  const [preview, setPreview] = useState(0); // estrella sobre la que esta el dedo (se puede deslizar)
  const [now, setNow] = useState(0);
  const got = useRef(0); // momento (ms) en que llego el dato, para contar hacia atras sin depender del reloj del servidor
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  useEffect(() => { got.current = Date.now(); setNow(got.current); }, [v?.id, v?.leftMs]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  if (!v) return null;
  const left = Math.max(0, Math.ceil((v.leftMs - (now - got.current)) / 1000));
  if (v.leftMs !== undefined && now - got.current >= v.leftMs) return null; // la votacion ya cerró: la TV pasó a la siguiente mesa
  const mine = voted[v.id];
  const save = (next: Record<string, number>) => {
    setVoted(next);
    try { localStorage.setItem('karaoke_votes', JSON.stringify(Object.fromEntries(Object.entries(next).slice(-20)))); } catch { /* */ }
  };
  // El voto se refleja al instante; si el servidor lo rechaza, se deshace
  const send = async (rating: number) => {
    const before = voted;
    save({ ...voted, [v.id]: rating });
    try { navigator.vibrate?.(25); } catch { /* */ }
    try {
      await pub('POST', `/public/${k.token}/vote`, { requestId: v.id, rating, clientId: clientId() });
    } catch (e: any) { save(before); k.toast(e.message, true); }
  };
  const starAt = (x: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return 0;
    return Math.min(5, Math.max(1, Math.ceil(((x - r.left) / r.width) * 5)));
  };
  const shown = preview || mine || 0;
  const pct = v.sec ? Math.min(100, Math.max(0, (left / v.sec) * 100)) : 0;
  const mesa = v.tableName ? v.tableName.replace(/^mesa\s*/i, '') : '';
  const brand = /^#[0-9a-f]{6}$/i.test(k.state?.business?.primaryColor ?? '') ? k.state!.business.primaryColor : '#fbbf24';
  const logo = k.state?.business?.logoUrl;
  const cu = v.ranking?.find((x: any) => x.current);
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 overflow-y-auto p-6 text-center" role="dialog" aria-label="Votar la actuación" style={{ background: `radial-gradient(circle at 50% 25%, color-mix(in srgb, ${brand} 35%, #0b0b14) 0%, #0b0b14 72%)`, color: '#f9fafb', colorScheme: 'dark' }}>
      <style>{`@keyframes vt-pop{0%{transform:scale(.6)}60%{transform:scale(1.25)}100%{transform:scale(1)}}@keyframes vt-in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}.vt-pop{animation:vt-pop .35s ease-out}.vt-in{animation:vt-in .5s both}`}</style>
      {logo && <img src={logo} alt="" className="vt-in h-14 max-w-[50vw] object-contain" draggable={false} />}
      <div className="vt-in flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-300/10 px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.25em] text-amber-300">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Competencia · Votación abierta
      </div>
      <div className="text-sm text-slate-300">{v.mine ? '¡Tu mesa acaba de cantar!' : mesa ? `Acaba de cantar la mesa ${mesa}` : 'Acaba de sonar'}</div>
      <div className="max-w-sm text-2xl font-black leading-tight">{v.title}</div>

      {v.mine ? (
        <div className="mt-2 max-w-xs rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
          <div className="text-4xl">🎤</div>
          <div className="mt-1 font-semibold">El público está calificando tu actuación</div>
          <div className="mt-1 text-xs text-slate-400">Tu mesa no puede votar por sí misma. Mira la pantalla para ver el puntaje.</div>
          {v.count > 0 && <div className="mt-3 text-3xl font-black text-amber-300">{v.avg} ★ <span className="text-xs font-semibold text-slate-400">({v.count} voto{v.count === 1 ? '' : 's'})</span></div>}
        </div>
      ) : (
        <>
          <div key={shown} className={`mt-2 text-6xl leading-none ${shown ? 'vt-pop' : 'opacity-40'}`} aria-hidden>{shown ? RATINGS[shown - 1].e : '⭐'}</div>
          <div className="min-h-6 text-base font-bold text-slate-100">{shown ? RATINGS[shown - 1].t : '¿Cuántas estrellas se lleva?'}</div>
          <div
            ref={box}
            className="flex touch-none select-none justify-center gap-1 rounded-2xl px-2 py-1"
            onPointerDown={(e) => { dragging.current = true; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); setPreview(starAt(e.clientX)); }}
            onPointerMove={(e) => { if (dragging.current || e.pointerType === 'mouse') setPreview(starAt(e.clientX)); }}
            onPointerUp={(e) => { if (!dragging.current) return; dragging.current = false; const n = starAt(e.clientX); setPreview(0); if (n) send(n); }}
            onPointerCancel={() => { dragging.current = false; setPreview(0); }}
            onPointerLeave={(e) => { if (e.pointerType === 'mouse' && !dragging.current) setPreview(0); }}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} role="img" aria-label={`${n} estrella${n > 1 ? 's' : ''}`} className="px-1 text-[3.6rem] leading-none transition-transform duration-150" style={{ color: n <= shown ? '#fbbf24' : '#475569', transform: n <= shown ? 'scale(1.08)' : 'none', textShadow: n <= shown ? '0 0 18px #fbbf2488' : 'none' }}>★</span>
            ))}
          </div>
          <div className="text-xs text-slate-400">{mine ? `✅ Voto enviado: ${mine} ★ · desliza o toca otra estrella para cambiarlo` : 'Toca o desliza el dedo por las estrellas'}</div>
          {mine && v.count > 0 && <div className="vt-in text-sm text-slate-200">Puntaje del público en vivo: <b className="text-amber-300">{v.avg} ★</b> ({v.count} voto{v.count === 1 ? '' : 's'})</div>}
        </>
      )}

      {cu && (
        <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-xs text-amber-100">Acumulado de la mesa que cantó: <b>{cu.points} pts</b> · va en el puesto <b>{v.ranking.indexOf(cu) + 1}º</b></div>
      )}
      <div className="mt-2 w-full max-w-xs">
        <div className="mb-1.5 text-xs font-semibold text-slate-400">La votación cierra en {left}s</div>
        <div className="h-2.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full transition-[width] duration-500 ease-linear" style={{ width: `${pct}%`, background: brand }} /></div>
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
