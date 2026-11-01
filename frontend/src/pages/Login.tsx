import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, auth, SessionUser } from '../lib/api';
import { ACCENT, Btn, Field } from '../components/kit';

export const homeFor = (role: SessionUser['role']) => (role === 'SUPER_ADMIN' ? '/super-admin' : role === 'ADMIN' ? '/admin' : '/dj');

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
    <div className="grid min-h-dvh place-items-center bg-[#050d18] px-4 py-10 text-slate-100" style={{ backgroundImage: `radial-gradient(60% 45% at 50% 0%, ${ACCENT}26, transparent 70%)` }}>
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl text-3xl" style={{ background: ACCENT + '22', boxShadow: `0 0 40px ${ACCENT}33` }}>🎤</div>
          <h1 className="text-3xl font-extrabold tracking-tight">Karaoke</h1>
          <p className="mt-1 text-sm text-slate-400">Ingresa a tu panel de administración o DJ</p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
          <Field label="Correo" type="email" autoComplete="username" placeholder="tu@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          <div className="relative">
            <Field label="Contraseña" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="button" onClick={() => setShow((v) => !v)} className="absolute bottom-2.5 right-3 text-xs font-semibold text-slate-400 hover:text-slate-200">
              {show ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-red-400/30 bg-red-500/15 p-3 text-sm text-red-200" role="alert">{error}</div>
          )}

          <Btn kind="accent" className="w-full py-3 text-base" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Btn>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          ¿Eres cliente? Escanea el código QR de tu mesa para pedir canciones.
          <br />
          <Link to="/" className="mt-2 inline-block text-slate-400 hover:text-slate-200">← Volver al inicio</Link>
        </p>
      </div>
    </div>
  );
}
