import type { Karaoke } from './useKaraoke';

/** Dos botones sobre el buscador: solo versiones karaoke, o cualquier version (normal). */
export default function SearchKind({ k }: { k: Karaoke }) {
  const opts = [['KARAOKE', 'Karaoke'], ['ANY', 'Normal']] as const;
  return (
    <div role="radiogroup" aria-label="Tipo de búsqueda" style={{ display: 'flex', gap: 8, margin: '0 0 10px' }}>
      {opts.map(([v, label]) => {
        const on = k.kind === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => k.setKind(v)}
            style={{
              flex: 1, padding: '9px 12px', borderRadius: 999, font: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              border: `1.5px solid ${on ? k.accent : 'currentColor'}`,
              background: on ? k.accent : 'transparent',
              color: on ? '#fff' : 'inherit',
              opacity: on ? 1 : 0.65,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
