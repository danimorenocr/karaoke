import { Suspense } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useKaraoke } from '../core/useKaraoke';
import { getExperience } from '../experiences';

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
    </Suspense>
  );
}
