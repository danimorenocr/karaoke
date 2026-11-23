import { useEffect, useState } from 'react';
import { fmtDuration } from '../lib/api';
import { ACCENT } from './kit';

/** Barra de progreso de la canción que suena en la TV.
    La TV reporta la posición al servidor cada 5 s (session.positionSec); entre recargas
    del panel se interpola con el reloj local para que la barra avance pareja (y se
    resincroniza sola en cada recarga). Con la sesión en pausa la barra se congela. */
export default function SongProgress({ positionSec, durationSec, paused, fetchedAt }: { positionSec: number; durationSec?: number | null; paused: boolean; fetchedAt: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [paused]);
  const pos = Math.max(0, positionSec + (paused ? 0 : (Date.now() - fetchedAt) / 1000));
  const dur = durationSec && durationSec > 0 ? durationSec : null;
  if (!dur) return null; // sin la duración no se muestra la barra
  const pct = dur ? Math.min(100, (pos / dur) * 100) : null;
  const left = dur ? Math.max(0, Math.ceil(dur - pos)) : null;
  return (
    <div className="px-5 pb-5" role="progressbar" aria-label="Progreso de la canción" aria-valuemin={0} aria-valuemax={dur} aria-valuenow={Math.floor(pos)}>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%`, background: ACCENT }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs tabular-nums text-slate-400">
        <span>{fmtDuration(Math.floor(pos)) || '0:00'}</span>
        <span>{`quedan ${fmtDuration(left) || '0:00'}`}</span>
      </div>
    </div>
  );
}
