import { ReactNode } from 'react';

/** Ilustraciones vectoriales del panel (audifonos, vinilo, nota neon, hojas). Solo decorativas. */

export function Headphones({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 200" className={className} aria-hidden fill="none">
      <defs>
        <linearGradient id="hp-body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1a1c2e" /><stop offset="1" stopColor="#08090e" /></linearGradient>
        <linearGradient id="hp-glow" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#a9b8ff" /><stop offset="1" stopColor="#c9b8ff" /></linearGradient>
        <filter id="hp-blur"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>
      <path d="M60 150 C40 60 110 10 170 10 C230 10 290 60 270 150" stroke="url(#hp-glow)" strokeWidth="7" strokeLinecap="round" filter="url(#hp-blur)" opacity=".7" />
      <path d="M60 150 C40 60 110 10 170 10 C230 10 290 60 270 150" stroke="url(#hp-body)" strokeWidth="16" strokeLinecap="round" />
      <path d="M72 120 C64 70 112 24 170 24" stroke="url(#hp-glow)" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="28" y="92" width="62" height="100" rx="30" fill="url(#hp-body)" stroke="#a9b8ff" strokeOpacity=".55" strokeWidth="2" />
      <rect x="40" y="108" width="34" height="68" rx="17" fill="#0a0b12" stroke="#a9b8ff" strokeOpacity=".35" />
      <rect x="240" y="92" width="62" height="100" rx="30" fill="url(#hp-body)" stroke="#a9b8ff" strokeOpacity=".55" strokeWidth="2" />
      <rect x="256" y="108" width="34" height="68" rx="17" fill="#0a0b12" stroke="#a9b8ff" strokeOpacity=".35" />
    </svg>
  );
}

export function Vinyl({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 180" className={className} aria-hidden>
      <defs>
        <radialGradient id="vn-d" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#2a2a2a" /><stop offset="1" stopColor="#0b0b0b" /></radialGradient>
      </defs>
      <circle cx="100" cy="98" r="78" fill="url(#vn-d)" />
      {[70, 60, 50, 40].map((r) => <circle key={r} cx="100" cy="98" r={r} fill="none" stroke="#fff" strokeOpacity=".07" />)}
      <path d="M100 98 L100 20 A78 78 0 0 1 160 48 Z" fill="#fff" opacity=".05" />
      <circle cx="100" cy="98" r="24" fill="#e6d4ae" />
      <circle cx="100" cy="98" r="4" fill="#0b0b0b" />
      <path d="M184 18 L132 108" stroke="#c9ccd2" strokeWidth="6" strokeLinecap="round" />
      <circle cx="186" cy="16" r="9" fill="#9aa0aa" />
      <rect x="120" y="104" width="22" height="12" rx="3" transform="rotate(-28 131 110)" fill="#2c2f36" />
    </svg>
  );
}

export function NeonNote({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 170" className={className} aria-hidden fill="none">
      <defs>
        <linearGradient id="nn-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8be8ff" /><stop offset=".55" stopColor="#a78bfa" /><stop offset="1" stopColor="#f472b6" /></linearGradient>
        <filter id="nn-b"><feGaussianBlur stdDeviation="5" /></filter>
      </defs>
      <g stroke="url(#nn-g)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M62 128 V30 L128 16 V112" filter="url(#nn-b)" opacity=".8" />
        <ellipse cx="46" cy="128" rx="20" ry="16" filter="url(#nn-b)" opacity=".8" />
        <ellipse cx="112" cy="112" rx="20" ry="16" filter="url(#nn-b)" opacity=".8" />
        <path d="M62 128 V30 L128 16 V112" />
        <ellipse cx="46" cy="128" rx="20" ry="16" />
        <ellipse cx="112" cy="112" rx="20" ry="16" />
      </g>
    </svg>
  );
}

export function Leaves({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden>
      <circle cx="70" cy="130" r="50" fill="#d9c7a3" opacity=".8" />
      <path d="M190 -10 C150 40 140 100 150 170" stroke="#566a4c" strokeWidth="3" fill="none" />
      {[[40, 100, -35], [150, 20, 50], [60, 70, -50], [168, 62, 40], [120, 98, -40], [190, 108, 50]].map(([x, y, r], i) => (
        <path key={i} d="M0 0 C-12 -26 -10 -56 0 -84 C10 -56 12 -26 0 0Z" transform={`translate(${130 + (x as number) * 0.3} ${(y as number) + 70}) rotate(${r})`} fill={i % 2 ? '#7d9272' : '#5a6e50'} opacity=".9" />
      ))}
    </svg>
  );
}

export function Sparkle({ className = '' }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor"><path d="M12 2l1.8 5.7L19.5 9.5l-5.7 1.8L12 17l-1.8-5.7L4.5 9.5l5.7-1.8zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z" /></svg>;
}

/** Tema visual de la tarjeta de mesa segun su experiencia. */
export interface TableTheme { bg: string; dark: boolean; art: ReactNode }
export function tableTheme(id: string): TableTheme {
  switch (id) {
    case 'golden-vinyl':
      return { bg: 'linear-gradient(135deg,#f4ead6,#e6d6b5)', dark: false, art: <Vinyl className="absolute -right-4 top-6 h-48 w-52 sm:h-56 sm:w-60" /> };
    case 'neon-world':
      return { bg: 'radial-gradient(90% 90% at 80% 20%,#6d28d9aa,transparent 60%),linear-gradient(135deg,#150b2b,#0a0818)', dark: true, art: <NeonNote className="absolute right-2 top-8 h-40 w-40 drop-shadow-[0_0_24px_#a78bfa]" /> };
    case 'latin-collage':
      return { bg: "linear-gradient(90deg,#0b2a35f2 20%,#0b2a3566),url('/latin-collage-bg.jpg') center 30% / cover", dark: true, art: null };
    case 'harry-potter':
      return { bg: "linear-gradient(90deg,#1a0f07f2 25%,#1a0f0744),url('/hp-bg.jpg') 70% 36% / cover", dark: true, art: null };
    case 'editorial':
      return { bg: 'linear-gradient(135deg,#ebe3d1,#c9d1bd)', dark: false, art: <Leaves className="absolute -right-2 -top-2 h-60 w-60" /> };
    default:
      return { bg: 'linear-gradient(135deg,#f5f5f4,#dcdcd6)', dark: false, art: null };
  }
}
