import { CSSProperties, ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { cop, usePlans, WA_CONTACT, waLink } from '../landing/config';

const C = { bg: '#05060a', card: '#0d1017', line: 'rgba(255,255,255,.09)', cream: '#f5ecdc', mute: '#9aa3b2', ac: '#a9b8ff', ink: '#0b1030' };

const CSS = `
.ld{--ac:${C.ac}}
.ld html{scroll-behavior:smooth}
.ld-rv{opacity:0;transform:translateY(28px);transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1);transition-delay:var(--d,0s)}
.ld-rv.in{opacity:1;transform:none}
.ld-lift{transition:transform .3s cubic-bezier(.2,.7,.2,1),border-color .3s,box-shadow .3s,background .3s}
.ld-lift:hover{transform:translateY(-5px);border-color:${C.ac}66!important;box-shadow:0 18px 50px -20px ${C.ac}55}
.ld-btn{transition:transform .2s,filter .2s,box-shadow .3s,background .2s,border-color .2s}
.ld-btn:hover{transform:translateY(-2px);filter:brightness(1.08);box-shadow:0 10px 30px -8px ${C.ac}88}
.ld-btn:active{transform:scale(.97)}
.ld-link{position:relative;transition:color .2s}
.ld-link:hover{color:#fff}
.ld-link::after{content:'';position:absolute;left:0;right:0;bottom:-4px;height:2px;background:${C.ac};transform:scaleX(0);transform-origin:left;transition:transform .3s}
.ld-link:hover::after{transform:scaleX(1)}
@keyframes ld-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes ld-marq{to{transform:translateX(-50%)}}
@keyframes ld-bar{from{width:8%}to{width:92%}}
@keyframes ld-pulse{0%,100%{box-shadow:0 0 0 0 ${C.ac}66}50%{box-shadow:0 0 0 7px transparent}}
@keyframes ld-glow{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes ld-draw{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.ld-float{animation:ld-float 6s ease-in-out infinite}
.ld-float2{animation:ld-float 7s ease-in-out -2s infinite}
.ld-marq{display:flex;width:max-content;animation:ld-marq 28s linear infinite}
.ld-marq:hover{animation-play-state:paused}
.ld-bar{animation:ld-bar 14s linear infinite alternate}
.ld-dot{animation:ld-pulse 2s infinite}
.ld-glow{animation:ld-glow 5s ease-in-out infinite}
.ld-under{display:inline-block;position:relative;color:${C.ac}}
.ld-under::after{content:'';position:absolute;left:0;right:0;bottom:-.08em;height:.07em;border-radius:9px;background:${C.ac};transform-origin:left;animation:ld-draw 1s .6s both cubic-bezier(.2,.7,.2,1)}
.ld-faq{display:grid;grid-template-rows:0fr;transition:grid-template-rows .4s cubic-bezier(.2,.7,.2,1)}
.ld-faq.open{grid-template-rows:1fr}
.ld-faq>div{overflow:hidden}
.ld-hero-in>*{opacity:0;animation:ld-up .8s both cubic-bezier(.2,.7,.2,1)}
.ld-hero-in>*:nth-child(1){animation-delay:.05s}.ld-hero-in>*:nth-child(2){animation-delay:.15s}.ld-hero-in>*:nth-child(3){animation-delay:.25s}.ld-hero-in>*:nth-child(4){animation-delay:.35s}.ld-hero-in>*:nth-child(5){animation-delay:.45s}
@keyframes ld-up{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
.ld-nav{transition:background .3s,backdrop-filter .3s,border-color .3s}
@media (prefers-reduced-motion:reduce){.ld *,.ld *::before,.ld *::after{animation:none!important;transition:none!important}.ld-rv{opacity:1;transform:none}.ld-hero-in>*{opacity:1}}
`;

/** Aparece suavemente al entrar en pantalla. */
function Rv({ children, d = 0, className = '' }: { children: ReactNode; d?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`ld-rv ${on ? 'in' : ''} ${className}`} style={{ '--d': `${d}s` } as CSSProperties}>{children}</div>;
}

const Wa = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
    <path fill="currentColor" d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm5.2 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.2-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.3.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.4.1.6-.1l.8-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.8-.1 1.4z" />
  </svg>
);
const ICO = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M7 7l10 10M17 7L7 17',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  note: 'M9 18V5l11-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z',
} as const;
function Ico({ n, className = 'h-4 w-4', sw = 2.4 }: { n: keyof typeof ICO; className?: string; sw?: number }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICO[n]} /></svg>;
}
const Check = ({ ok = true }: { ok?: boolean }) => (
  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full" style={ok ? { background: C.ac, color: C.ink } : { background: '#1a1d27', color: C.mute, border: `1px solid ${C.line}` }}><Ico n={ok ? 'check' : 'x'} className="h-3 w-3" sw={3} /></span>
);

function Cta({ children, ghost = false, href = WA_CONTACT, to, dark = false }: { children: ReactNode; ghost?: boolean; href?: string; to?: string; dark?: boolean }) {
  const cls = 'ld-btn inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold';
  const st: CSSProperties = dark ? { background: '#0a0c14', color: C.cream } : ghost ? { border: `1.5px solid ${C.cream}44`, color: C.cream } : { background: C.ac, color: C.ink };
  return to ? <Link to={to} className={cls} style={st}>{children}</Link> : <a href={href} target={href.startsWith('#') ? undefined : '_blank'} rel="noreferrer" className={cls} style={st}>{children}</a>;
}

const Eyebrow = ({ children }: { children: ReactNode }) => <p className="text-[11px] font-extrabold uppercase tracking-[.22em]" style={{ color: C.ac }}>{children}</p>;
const H2 = ({ children }: { children: ReactNode }) => <h2 className="mt-3 max-w-xl text-3xl font-black leading-[1.1] tracking-tight sm:text-5xl" style={{ color: C.cream }}>{children}</h2>;

const WITHOUT = [['Las canciones se pierden.', 'Papelitos, gritos y pedidos al oído del DJ.'], ['Los turnos se sienten injustos.', 'Nadie sabe cuánto falta ni quién sigue, y las quejas le caen al DJ o al mesero.'], ['El negocio queda a ciegas.', 'Nadie registra qué se pide ni cómo rindió la noche.']];
const WITH = [['Cada pedido queda en la cola.', 'Directo desde el celular de la mesa.'], ['Turnos claros para todos.', 'Cada mesa ve cuánto le falta.'], ['Datos de cada noche.', 'Qué se pide y qué mesas participan más.']];
const STEPS = [['Escanea el QR', 'Cada mesa tiene el suyo. No se descarga nada.'], ['Elige su canción', 'Karaoke u original, desde YouTube o con enlace.'], ['Entra a la cola', 'Con turnos y cupo por mesa.'], ['Suena en la TV', 'El DJ aprueba, salta o pausa desde su panel.']];
const FEATURES = [['QR por mesa', 'Cada mesa pide desde su propio código.'], ['Cola automática', 'La app decide qué suena y en qué orden.'], ['Pantalla sola', 'La TV reproduce sin que nadie esté pendiente.'], ['Panel del DJ', 'Aprobar, saltar, pausar o cancelar en vivo.'], ['Cupo por mesa', 'Ninguna mesa acapara la noche.'], ['Estadísticas', 'Qué se pide y cómo rinde cada noche.']];
const FEAT_ICON = ['M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h-3zM20 14v6h-3', 'M4 6h16M4 12h16M4 18h10', 'M3 6h18v12H3zM8 21h8', 'M3 14a9 9 0 0118 0M3 14v3a2 2 0 002 2h1v-6H5a2 2 0 00-2 1zM21 14v3a2 2 0 01-2 2h-1v-6h1a2 2 0 012 1z', 'M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4', 'M5 21V11M12 21V4M19 21v-7'];
const FAQ = [['¿Mis clientes tienen que descargar algo?', 'No. Escanean el QR y listo.'], ['¿Qué necesita mi local?', 'Una pantalla o TV con internet para abrir la pantalla de Tono, y un celular o computador para el panel del DJ.'], ['¿Tono cobra por canciones o maneja derechos?', 'Tono es la herramienta de pedidos y cola. Los videos se reproducen desde YouTube; los permisos de uso musical de tu local siguen siendo tu responsabilidad.'], ['¿Sirve para más de un local?', 'Sí. Cada establecimiento tiene su cuenta, sus mesas y su panel. Escríbenos si tienes varios locales.'], ['¿Y si dos mesas piden la misma canción?', 'Entran las dos a la cola, en el orden en que llegaron. El DJ puede ajustar el orden.']];
const VENUES = ['Karaokes', 'Bares', 'Gastrobares', 'Restaurantes', 'Discotecas', 'Eventos'];

export default function Landing() {
  const PLANS = usePlans();
  const [open, setOpen] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => {
    const prev = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => { document.documentElement.style.scrollBehavior = prev; };
  }, []);

  return (
    <div className="ld min-h-dvh overflow-x-clip" style={{ background: C.bg, color: C.cream, fontFamily: "'Nunito',system-ui,sans-serif" }}>
      <style>{CSS}</style>

      <header className="ld-nav sticky top-0 z-40 border-b" style={{ background: scrolled ? 'rgba(5,6,10,.82)' : 'transparent', backdropFilter: scrolled ? 'blur(14px)' : 'none', borderColor: scrolled ? C.line : 'transparent' }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3">
          <a href="#top" aria-label="TONO"><img src="/logo.png" alt="TONO" className="h-11 w-auto transition-transform hover:scale-105" /></a>
          <nav className="flex items-center gap-5 text-[13px]" style={{ color: C.mute }}>
            {[['#como', 'Cómo funciona'], ['#demo', 'Demo'], ['#funciones', 'Funciones'], ['#precios', 'Precios'], ['#preguntas', 'Preguntas']].map(([h, l]) => <a key={h} href={h} className="ld-link hidden md:block">{l}</a>)}
            <Link to="/login" className="ld-link">Entrar</Link>
            <Cta><Wa />Hablemos</Cta>
          </nav>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="relative mx-auto grid max-w-5xl items-center gap-12 px-5 pb-16 pt-12 md:grid-cols-[1.1fr_1fr] md:pt-16">
          <div className="ld-glow pointer-events-none absolute right-0 top-0 -z-10 h-[34rem] w-[34rem] rounded-full blur-3xl" style={{ background: `radial-gradient(circle,${C.ac}2e,transparent 65%)` }} />
          <div className="ld-hero-in">
            <h1 className="mt-6 text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">La música de tu local, <span className="ld-under">sin papelitos</span> ni turnos peleados.</h1>
            <p className="mt-5 max-w-md text-[17px] leading-relaxed" style={{ color: C.mute }}>Cada mesa pide desde su celular, para cantar o solo para escuchar. La cola se ordena sola y la TV la reproduce.</p>
            <div className="mt-7 flex flex-wrap gap-3"><Cta href={waLink('Hola, quiero una demo de Tono karaoke.')}><Wa />Pide tu demo</Cta><Cta ghost href="#como">Ver cómo funciona</Cta></div>
            <p className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-xs" style={{ color: C.mute }}><span className="flex items-center gap-1.5"><span style={{ color: C.ac }}><Ico n="check" /></span>Sin descargar apps</span><span className="flex items-center gap-1.5"><span style={{ color: C.ac }}><Ico n="check" /></span>Tu TV y tu sonido de siempre</span></p>
          </div>

          <div className="relative mx-auto h-[24rem] w-full max-w-md" aria-hidden>
            <div className="ld-float absolute right-0 top-0 w-[88%] rounded-2xl border p-4 pb-5" style={{ background: 'linear-gradient(135deg,#101a33,#0a0f1c)', borderColor: C.line, boxShadow: `0 30px 80px -30px ${C.ac}55` }}>
              <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: '#1d2a4f', color: C.ac }}>Sonando · Mesa 2</span>
              <b className="mt-4 block text-2xl font-black leading-tight">Rata de<br />dos patas</b>
              <small className="mt-1 block text-xs font-bold" style={{ color: C.ac }}>Karaoke</small>
              <div className="mt-4 h-1 w-1/2 rounded-full bg-white/10"><i className="ld-bar block h-1 rounded-full" style={{ background: C.ac }} /></div>
            </div>
            <div className="ld-float2 absolute bottom-0 left-2 w-[58%] rounded-[1.6rem] border p-3.5" style={{ background: '#0b0e16', borderColor: C.line, boxShadow: '0 30px 60px -20px #000' }}>
              <div className="flex justify-between text-[11px] font-bold"><span>La Rockola</span><span style={{ color: C.mute }}>● Mesa <b className="text-white">4</b></span></div>
              <small className="mt-2.5 block text-[9px] uppercase tracking-widest" style={{ color: C.mute }}>En cola</small>
              {[['Como la flor', 'Original'], ['Vivir mi vida', 'Karaoke']].map(([t, s], i) => (
                <div key={t} className="mt-1.5 flex items-center gap-2 rounded-lg p-2 text-[10px]" style={{ background: '#121722' }}><b style={{ color: C.mute }}>{i + 1}</b><span><b className="block text-[11px]">{t}</b><small style={{ color: C.mute }}>{s}</small></span></div>
              ))}
              <div className="mt-1.5 flex items-center gap-2 rounded-lg border p-2 text-[10px]" style={{ borderColor: C.ac, background: '#101a33' }}><b>3</b><span><b className="block text-[11px]">Mi primer millón</b><small style={{ color: C.mute }}>Tu mesa</small></span><em className="ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-bold not-italic" style={{ background: C.ac, color: C.ink }}>Faltan 2</em></div>
              <div className="mt-2 rounded-full border px-2.5 py-1.5 text-[10px]" style={{ borderColor: C.line, color: C.mute }}>Busca una canción…</div>
            </div>
          </div>
        </section>

        {/* Cinta */}
        <div className="overflow-hidden border-y py-5" style={{ borderColor: C.line, background: '#080a10' }} aria-hidden>
          <div className="ld-marq">
            {[0, 1].map((k) => (
              <div key={k} className="flex shrink-0 items-center">
                {VENUES.map((v) => <span key={v + k} className="flex items-center text-xl font-black tracking-tight sm:text-2xl"><span className="px-6">{v}</span><span style={{ color: C.ac }}><Ico n="note" className="h-5 w-5" sw={2} /></span></span>)}
              </div>
            ))}
          </div>
        </div>

        {/* Problema */}
        <section className="mx-auto max-w-5xl px-5 py-24">
          <Rv><Eyebrow>El problema</Eyebrow><H2>Así se vive hoy una noche de música.</H2></Rv>
          <div className="mt-10 grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr]">
            <Rv className="h-full"><div className="ld-lift h-full rounded-2xl border p-6" style={{ background: C.card, borderColor: C.line }}>
              <small className="text-[11px] font-extrabold uppercase tracking-widest" style={{ color: C.mute }}>Sin Tono</small>
              <ul className="mt-4 space-y-4">{WITHOUT.map(([t, d]) => <li key={t} className="flex gap-3"><Check ok={false} /><span><b className="block text-sm">{t}</b><small className="text-[13px]" style={{ color: C.mute }}>{d}</small></span></li>)}</ul>
            </div></Rv>
            <Rv d={0.15} className="hidden self-center md:block"><span className="ld-dot grid h-11 w-11 place-items-center rounded-full" style={{ background: C.ac, color: C.ink }}><Ico n="arrow" className="h-5 w-5" sw={2.6} /></span></Rv>
            <Rv d={0.25} className="h-full"><div className="ld-lift h-full rounded-2xl border p-6" style={{ background: 'linear-gradient(160deg,#0f1a36,#0a1022)', borderColor: `${C.ac}55`, boxShadow: `0 20px 60px -30px ${C.ac}66` }}>
              <small className="text-[11px] font-extrabold uppercase tracking-widest" style={{ color: C.ac }}>Con Tono</small>
              <ul className="mt-4 space-y-4">{WITH.map(([t, d]) => <li key={t} className="flex gap-3"><Check /><span><b className="block text-sm">{t}</b><small className="text-[13px]" style={{ color: '#aab4cc' }}>{d}</small></span></li>)}</ul>
            </div></Rv>
          </div>
        </section>

        {/* Pasos */}
        <section id="como" className="mx-auto max-w-5xl scroll-mt-16 px-5 py-20">
          <Rv><Eyebrow>Cómo funciona</Eyebrow><H2>Cuatro pasos. Cero papelitos.</H2></Rv>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            {STEPS.map(([t, d], i) => (
              <Rv key={t} d={i * 0.1}><li className="ld-lift h-full rounded-2xl border p-5" style={i === 3 ? { background: 'linear-gradient(160deg,#0f1a36,#0a1022)', borderColor: `${C.ac}55` } : { background: C.card, borderColor: C.line }}>
                <span className="text-4xl font-black" style={{ color: C.ac }}>0{i + 1}</span>
                <b className="mt-4 block text-sm">{t}</b><p className="mt-1 text-[13px] leading-relaxed" style={{ color: C.mute }}>{d}</p>
              </li></Rv>
            ))}
          </ol>
        </section>

        {/* Demo */}
        <section id="demo" className="mx-auto max-w-5xl scroll-mt-16 px-5 py-20">
          <Rv><Eyebrow>Demo</Eyebrow><H2>Mírala funcionando en 47 segundos.</H2></Rv>
          <Rv d={0.15}>
            <div className="ld-lift mt-10 overflow-hidden rounded-2xl border" style={{ borderColor: `${C.ac}55`, background: '#0b0b12', boxShadow: `0 30px 80px -30px ${C.ac}55` }}>
              <video src="/2-demo-tono-v3.mp4" poster="/demo-tono-poster.jpg" controls playsInline preload="metadata" className="block h-auto w-full" />
            </div>
            <p className="mt-4 text-center text-[13px]" style={{ color: C.mute }}>Grabada del producto real, con narración en español.</p>
          </Rv>
        </section>

        {/* Funciones */}
        <section id="funciones" className="mx-auto max-w-5xl scroll-mt-16 px-5 py-20">
          <Rv><Eyebrow>Funciones</Eyebrow><H2>Todo lo que tu noche necesita.</H2></Rv>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {FEATURES.map(([t, d], i) => (
              <Rv key={t} d={(i % 3) * 0.08}><li className="ld-lift group h-full rounded-2xl border p-5" style={{ background: C.card, borderColor: C.line }}>
                <span className="grid h-10 w-10 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6" style={{ background: '#151d36', color: C.ac }}>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={FEAT_ICON[i]} /></svg>
                </span>
                <b className="mt-5 block text-sm">{t}</b><p className="mt-1 text-[13px] leading-relaxed" style={{ color: C.mute }}>{d}</p>
              </li></Rv>
            ))}
          </ul>
        </section>

        {/* Precios (centrados) */}
        <section id="precios" className="mx-auto max-w-5xl scroll-mt-16 px-5 py-20 text-center">
          <Rv><Eyebrow>Precios</Eyebrow><h2 className="mx-auto mt-3 max-w-xl text-3xl font-black leading-[1.1] tracking-tight sm:text-5xl" style={{ color: C.cream }}>Un precio claro, cada mes.</h2></Rv>
          <div className={`mx-auto mt-12 grid gap-5 text-left sm:grid-cols-2 ${PLANS.length > 2 ? "max-w-5xl lg:grid-cols-3" : "max-w-3xl"}`}>
            {PLANS.map((p, i) => {
              const hi = !!p.highlight;
              return (
                <Rv key={p.id} d={i * 0.15} className="h-full"><div className="ld-lift relative flex h-full flex-col rounded-2xl border p-7" style={{ background: hi ? 'linear-gradient(160deg,#0f1a36,#0a1022)' : C.card, borderColor: hi ? `${C.ac}66` : C.line, boxShadow: hi ? `0 24px 70px -30px ${C.ac}77` : undefined }}>
                  {p.badge && <span className="absolute -top-3 left-6 rounded-full px-3 py-1 text-[10px] font-extrabold" style={{ background: '#1d2a4f', color: C.ac, border: `1px solid ${C.ac}55` }}>{p.badge}</span>}
                  <b>{p.name}</b>
                  <div className="mt-4"><span className="text-5xl font-black">{cop(p.price)}</span> <small style={{ color: C.mute }}>COP / mes</small></div>
                  <ul className="mt-6 flex-1 space-y-2.5 text-sm">{p.features.map((x) => <li key={x} className="flex items-start gap-2.5"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ background: `${C.ac}22`, color: C.ac }}><Ico n="check" className="h-3 w-3" sw={3} /></span>{x}</li>)}</ul>
                  <div className="mt-7 flex"><Cta ghost={!hi} to={`/login?registro&plan=${encodeURIComponent(p.id)}`}><span className="w-full text-center">Quiero este plan</span></Cta></div>
                </div></Rv>
              );
            })}
          </div>
        </section>

        {/* Preguntas */}
        <section id="preguntas" className="mx-auto grid max-w-5xl scroll-mt-16 gap-10 px-5 py-20 md:grid-cols-[1fr_1.4fr]">
          <Rv><Eyebrow>Preguntas</Eyebrow><H2>Lo que todos preguntan.</H2></Rv>
          <Rv d={0.1}><div>
            {FAQ.map(([q, a], i) => (
              <div key={q} className="border-b" style={{ borderColor: C.line }}>
                <button className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-bold transition-colors hover:text-white" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
                  {q}
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full transition-all duration-300" style={{ background: open === i ? C.ac : '#161a24', color: open === i ? C.ink : C.ac, transform: open === i ? 'rotate(180deg)' : 'none' }}><Ico n={open === i ? 'minus' : 'plus'} /></span>
                </button>
                <div className={`ld-faq ${open === i ? 'open' : ''}`}><div><p className="pb-4 text-sm leading-relaxed" style={{ color: C.mute }}>{a}</p></div></div>
              </div>
            ))}
          </div></Rv>
        </section>

        {/* CTA final */}
        <section className="mx-auto max-w-5xl px-5 pb-20 pt-6">
          <Rv><div className="relative overflow-hidden rounded-3xl px-6 py-16 text-center" style={{ background: 'linear-gradient(135deg,#b5c4ff,#93a6f5)', color: C.ink }}>
            <svg viewBox="0 0 24 24" className="ld-float2 pointer-events-none absolute -bottom-8 -right-4 h-56 w-56 opacity-15" aria-hidden><path fill="currentColor" d="M9 3v12.3A3.5 3.5 0 107 18.5V8l10-2v7.3a3.5 3.5 0 10-2 3.2V3z" /></svg>
            <h2 className="relative mx-auto max-w-md text-3xl font-black leading-tight tracking-tight sm:text-5xl">Que suene lo que pide la casa.</h2>
            <p className="relative mt-3 text-sm font-semibold">Escríbenos y lo ponemos a sonar en tu local.</p>
            <div className="relative mt-7"><Cta dark><Wa />Escríbenos por WhatsApp</Cta></div>
          </div></Rv>
        </section>
      </main>

      <footer className="border-t" style={{ borderColor: C.line }}>
        <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-6 px-5 py-8 text-sm" style={{ color: C.mute }}>
          <div><img src="/logo.png" alt="TONO" className="h-12 w-auto" /><p className="mt-2 text-xs">Pedidos de música y karaoke por QR.</p><p className="mt-1 text-xs">© {new Date().getFullYear()} Tono. Todos los derechos reservados.</p></div>
          <nav className="flex flex-wrap gap-5 text-xs">
            <a href="#como" className="ld-link">Cómo funciona</a><a href="#precios" className="ld-link">Precios</a><a href="#preguntas" className="ld-link">Preguntas</a><a href={WA_CONTACT} target="_blank" rel="noreferrer" className="ld-link">WhatsApp</a>
            <Link to="/privacidad" className="ld-link">Privacidad</Link><Link to="/terminos" className="ld-link">Términos</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
