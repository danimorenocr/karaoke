import GoogleSearch from '../components/GoogleSearch';
import type { Karaoke } from './useKaraoke';

/**
 * Respaldo de busqueda con Google. Una vez usado queda montado y solo se oculta
 * (Google no tolera que se destruya su contenedor).
 */
export default function GoogleFallback({ k, light = false }: { k: Karaoke; light?: boolean }) {
  const g = k.google;
  if (!g.ever) return null;
  return (
    <div className={g.query && k.step === 'results' ? '' : 'hidden'}>
      <GoogleSearch
        light={light}
        query={g.query}
        mode={k.kind}
        onResults={g.setItems}
        onError={k.setErrorMsg}
        onLoading={g.setLoading}
        onPick={(it) => k.pick(it, 'google')}
      />
    </div>
  );
}
