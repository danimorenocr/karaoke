import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, auth, SessionUser } from '../lib/api';
import { Headphones } from '../components/art';
import { ACCENT, Brand, Btn } from '../components/kit';

export const homeFor = (role: SessionUser['role']) => (role === 'SUPER_ADMIN' ? '/super-admin' : role === 'ADMIN' ? '/admin' : '/dj');

const inputCls = 'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/50';

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Si ya hay sesion iniciada, va directo a su panel
  const current = auth.user();
  if (auth.token() && current) return <Navigate to={homeFor(current.role)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api('POST', '/auth/login', { email: email.trim(), password }, false);
      auth.save(r.token, r.user);
      nav(homeFor(r.user.role), { replace: true });
    } catch (e: any) {
      // "Failed to fetch" = el servidor no respondio (suele ser que esta despertando)
      setError(e.status ? e.message : 'No se pudo conectar con el servidor. Si estaba inactivo, espera unos segundos e intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh bg-[#060b14] text-slate-100 lg:grid-cols-[1.1fr_1fr]" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      {/* Panel de marca */}
      <section className="relative hidden overflow-hidden border-r border-white/[0.07] lg:block" style={{ background: `radial-gradient(70% 60% at 70% 30%, ${ACCENT}26, transparent 70%), radial-gradient(60% 50% at 10% 100%, #6d28d933, transparent 70%), linear-gradient(180deg,#08111e,#050912)` }}>
        <div className="absolute left-12 top-12"><Brand size="lg" /></div>
        <Headphones className="absolute left-1/2 top-[34%] w-[34rem] max-w-[80%] -translate-x-1/2 drop-shadow-[0_0_60px_rgba(34,216,234,.25)]" />
        <div className="absolute inset-x-12 bottom-14">
          <p className="text-5xl leading-tight text-slate-100" style={{ fontFamily: "'Caveat', cursive" }}>
            Tu karaoke,<br />tu estilo <span style={{ color: ACCENT }}>♡</span>
          </p>
          <p className="mt-4 max-w-sm text-[15px] text-slate-400">Administra tus mesas, personaliza la experiencia de cada una y deja que la música haga el resto.</p>
        </div>
      </section>

      {/* Formulario */}
      <main className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Brand size="lg" /></div>
          <div className="text-xs font-semibold uppercase tracking-[.3em]" style={{ color: ACCENT }}>Bienvenido</div>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight">Inicia sesión</h1>
          <p className="mt-2 text-sm text-slate-400">Ingresa a tu panel de administración o DJ.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-300">Correo</span>
              <input className={inputCls} type="email" autoComplete="username" placeholder="tu@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </label>
            <label className="relative grid gap-1.5 text-sm">
              <span className="font-medium text-slate-300">Contraseña</span>
              <input className={`${inputCls} pr-24`} type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute bottom-3 right-4 text-xs font-semibold text-slate-400 hover:text-slate-200">
                {show ? 'Ocultar' : 'Mostrar'}
              </button>
            </label>

            {error && <div className="rounded-xl border border-red-400/30 bg-red-500/15 p-3 text-sm text-red-200" role="alert">{error}</div>}

            <Btn kind="accent" className="w-full !rounded-2xl py-3.5 text-base font-bold" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Btn>
          </form>

          <p className="mt-8 text-center text-xs leading-relaxed text-slate-500">
            ¿Eres cliente? Escanea el código QR de tu mesa para pedir canciones.
            <br />
            <Link to="/" className="mt-2 inline-block text-slate-400 hover:text-slate-200">← Volver al inicio</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
