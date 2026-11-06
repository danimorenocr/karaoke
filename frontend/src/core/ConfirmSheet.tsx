import { useEffect } from 'react';

/**
 * Ventana de confirmacion al pedir una cancion: hoja que sube desde abajo con la miniatura,
 * la mesa y cuantas canciones lleva. Cada diseno le pasa sus colores y textos.
 */
export type SheetTheme = {
  surface: string; // fondo de la hoja
  fg: string; // texto principal
  mute: string; // texto secundario
  line: string; // bordes
  accent: string; // boton principal / puntos
  onAccent: string; // texto sobre el acento
  radius?: number; // esquinas de la hoja (px)
  btnRadius?: number; // esquinas de los botones (px)
  font?: string;
  upper?: boolean; // etiquetas en mayusculas (estilo mono / editorial)
};

type Props = {
  song: { title: string; thumbnail?: string; channelTitle?: string; durationSec?: number };
  tableName: string;
  slot: number; // cuantas tendra la mesa al pedirla
  max: number; // maximo permitido
  theme: SheetTheme;
  heading?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

const fmt = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');

export default function ConfirmSheet({ song, tableName, slot, max, theme: t, heading = '¿La pedimos?', confirmLabel = 'Sí, pedirla', cancelLabel = 'Elegir otra', onConfirm, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const r = t.radius ?? 24;
  const br = t.btnRadius ?? 999;
  const cap = t.upper ? 'uppercase' : 'none';
  const dots = Math.min(max, 8);
  const meta = [song.channelTitle, fmt(song.durationSec)].filter(Boolean).join(' · ');

  return (
    <div className="cs-back" role="dialog" aria-modal="true" aria-label={heading} onClick={onCancel}>
      <style>{`
        @keyframes cs-fade{from{opacity:0}to{opacity:1}}
        @keyframes cs-up{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}
        @keyframes cs-pop{from{transform:scale(.94);opacity:0}to{transform:none;opacity:1}}
        .cs-back{position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:cs-fade .2s both}
        .cs-sheet{width:100%;max-width:28rem;animation:cs-up .32s cubic-bezier(.2,.8,.2,1) both;padding:10px 18px calc(18px + env(safe-area-inset-bottom));box-shadow:0 -20px 60px rgba(0,0,0,.45)}
        .cs-thumb{animation:cs-pop .4s .08s cubic-bezier(.2,.8,.2,1) both}
        .cs-btn{width:100%;padding:15px 18px;font:inherit;font-size:1rem;font-weight:800;cursor:pointer;transition:transform .15s,filter .15s}
        .cs-btn:hover{filter:brightness(1.07)}.cs-btn:active{transform:scale(.97)}
        .cs-btn:focus-visible{outline:2px solid currentColor;outline-offset:3px}
        @media(min-width:600px){.cs-back{align-items:center}.cs-sheet{border-radius:var(--cs-r)!important;padding-bottom:18px}}
        @media(prefers-reduced-motion:reduce){.cs-back,.cs-sheet,.cs-thumb{animation:none}}
      `}</style>
      <div
        className="cs-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{ background: t.surface, color: t.fg, borderTop: `1px solid ${t.line}`, borderRadius: `${r}px ${r}px 0 0`, fontFamily: t.font ?? 'inherit', ['--cs-r' as any]: `${r}px` }}
      >
        <div aria-hidden style={{ width: 44, height: 4, borderRadius: 4, background: t.line, margin: '0 auto 14px' }} />
        <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: t.accent, marginBottom: 12 }}>{heading}</div>

        <div className="cs-thumb" style={{ position: 'relative', aspectRatio: '16 / 9', overflow: 'hidden', borderRadius: Math.min(r, 18), background: t.line, border: `1px solid ${t.line}` }}>
          {song.thumbnail && <img src={song.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
          <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.55), transparent 55%)' }} />
          <div aria-hidden style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 54, height: 54, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.5)', border: '2px solid rgba(255,255,255,.85)', color: '#fff' }}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
          </div>
        </div>

        <div style={{ marginTop: 14, fontSize: 18, fontWeight: 800, lineHeight: 1.25, textAlign: 'center', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{song.title}</div>
        {meta && <div style={{ marginTop: 4, textAlign: 'center', fontSize: 13, color: t.mute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</div>}

        <div style={{ margin: '14px 0 16px', padding: '12px 14px', borderRadius: Math.min(r, 16), border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: t.mute }}>A nombre de</span>
            <b style={{ display: 'block', fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: cap }}>{tableName}</b>
          </span>
          <span style={{ textAlign: 'right', flexShrink: 0 }}>
            <span aria-hidden style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
              {Array.from({ length: dots }, (_, i) => (
                <i key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: i < slot ? t.accent : 'transparent', border: `1.5px solid ${i < slot ? t.accent : t.line}` }} />
              ))}
            </span>
            <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: t.mute }}>{slot} de {max} permitidas</span>
          </span>
        </div>

        <button className="cs-btn" onClick={onConfirm} autoFocus style={{ background: t.accent, color: t.onAccent, border: 0, borderRadius: br, textTransform: cap }}>{confirmLabel}</button>
        <button className="cs-btn" onClick={onCancel} style={{ marginTop: 8, background: 'transparent', color: t.mute, border: 0, borderRadius: br, fontWeight: 700, textTransform: cap }}>{cancelLabel}</button>
      </div>
    </div>
  );
}
