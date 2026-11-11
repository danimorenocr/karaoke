import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api, auth, SessionUser } from '../lib/api';
import { Headphones } from '../components/art';
import { ACCENT, Brand, Btn, Icon } from '../components/kit';
import { cop, PAY_HOLDER, PAY_METHODS, PlanId, usePlans, waLink } from '../landing/config';

export const homeFor = (role: SessionUser['role']) => (role === 'SUPER_ADMIN' ? '/super-admin' : role === 'ADMIN' ? '/admin' : '/dj');

const inputCls = 'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-300/50';

export default function Login() {
  const nav = useNavigate();
  const [qs] = useSearchParams();
  const [mode, setMode] = useState<'login' | 'register'>(qs.has('registro') ? 'register' : 'login');
  const PLANS = usePlans();
  const [planSel, setPlan] = useState<PlanId>(qs.get('plan') ?? '');
  const plan = PLANS.some((p) => p.id === planSel) ? planSel : PLANS[0].id;
  const [phone, setPhone] = useState('');
  // Despues de registrarse (o al entrar sin haber pagado) se muestra la pantalla de pago
  // Recuperar contrasena: correo -> codigo OTP + contrasena nueva
  const [rec, setRec] = useState<{ step: 'email' | 'code' } | null>(null);
  const [code, setCode] = useState('');
  const [info, setInfo] = useState('');
  const [pay, setPay] = useState<{ biz: string; plan: PlanId; review?: boolean } | null>(null);
  const [bizName, setBizName] = useState('');
  const [name, setName] = useState('');
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
      const r = mode === 'login'
        ? await api('POST', '/auth/login', { email: email.trim(), password }, false)
        : await api('POST', '/auth/register', { businessName: bizName.trim(), name: name.trim(), email: email.trim(), password, phone: phone.trim(), plan }, false);
      if (r.pendingPayment) { setPay({ biz: r.businessName, plan: r.plan }); return; }
      auth.save(r.token, r.user);
      nav(homeFor(r.user.role), { replace: true });
    } catch (e: any) {
      if (e.message === 'PAGO_REVISION') { setPay({ biz: bizName.trim() || 'tu establecimiento', plan, review: true }); return; }
      if (e.message === 'PAGO_PENDIENTE') { setPay({ biz: bizName.trim() || 'tu establecimiento', plan }); return; }
      // "Failed to fetch" = el servidor no respondio (suele ser que esta despertando)
      setError(e.status ? e.message : 'No se pudo conectar con el servidor. Si estaba inactivo, espera unos segundos e intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function paid() {
    setBusy(true); setError('');
    try { await api('POST', '/auth/payment-sent', { email: email.trim(), password }, false); setPay({ ...pay!, review: true }); }
    catch (e: any) { setError(e.status ? e.message : 'No se pudo conectar con el servidor. Intenta de nuevo.'); }
    finally { setBusy(false); }
  }

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true); setError(''); setInfo('');
    try {
      await api('POST', '/auth/forgot', { email: email.trim() }, false);
      setRec({ step: 'code' });
      setInfo(`Si ${email.trim()} tiene cuenta, te enviamos un código de 6 dígitos. Vence en 10 minutos.`);
    } catch (e: any) {
      setError(e.status ? e.message : 'No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally { setBusy(false); }
  }

  async function resetPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api('POST', '/auth/reset', { email: email.trim(), code: code.trim(), password }, false);
      setRec(null); setCode(''); setPassword(''); setMode('login');
      setInfo('Contraseña actualizada. Ya puedes iniciar sesión.');
    } catch (e: any) {
      setError(e.status ? e.message : 'No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally { setBusy(false); }
  }

  // Entra con las credenciales; devuelve true si ya hay acceso
  async function tryEnter(): Promise<boolean> {
    try {
      const r = await api('POST', '/auth/login', { email: email.trim(), password }, false);
      if (r.token) { auth.save(r.token, r.user); nav(homeFor(r.user.role), { replace: true }); return true; }
    } catch { /* sigue pendiente o sin conexion */ }
    return false;
  }
  const waiting = !!pay?.review;
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => { tryEnter(); }, 15000);
    return () => clearInterval(id);
  }, [waiting]); // eslint-disable-line react-hooks/exhaustive-deps

  if (rec) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#05060a] px-5 py-10 text-slate-100" style={{ fontFamily: "'Nunito', system-ui, sans-serif", backgroundImage: `radial-gradient(60% 45% at 50% 0%, ${ACCENT}26, transparent 70%)` }}>
        <div className="page-in w-full max-w-sm">
          <Brand size="lg" />
          <div className="mt-6 text-xs font-semibold uppercase tracking-[.3em]" style={{ color: ACCENT }}>Recuperar acceso</div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{rec.step === 'email' ? '¿Olvidaste tu contraseña?' : 'Revisa tu correo'}</h1>
          <p className="mt-2 text-sm text-slate-400">{rec.step === 'email' ? 'Escribe tu correo y te enviamos un código de verificación.' : 'Escribe el código y elige una contraseña nueva.'}</p>

          {rec.step === 'email' ? (
            <form onSubmit={sendCode} className="mt-7 space-y-4">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-slate-300">Correo</span>
                <input className={inputCls} type="email" autoComplete="username" placeholder="tu@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </label>
              {error && <div className="rounded-xl border border-red-400/30 bg-red-500/15 p-3 text-sm text-red-200" role="alert">{error}</div>}
              <Btn kind="accent" className="w-full !rounded-2xl py-3.5 text-base font-bold" disabled={busy}>{busy ? 'Enviando…' : 'Enviar código'}</Btn>
            </form>
          ) : (
            <form onSubmit={resetPassword} className="mt-7 space-y-4">
              {info && <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-slate-300" role="status">{info}</div>}
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-slate-300">Código</span>
                <input className={`${inputCls} text-center text-2xl font-bold tracking-[.5em]`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} required pattern="[0-9]{6}" title="Código de 6 dígitos" autoFocus />
              </label>
              <label className="relative grid gap-1.5 text-sm">
                <span className="font-medium text-slate-300">Contraseña nueva</span>
                <input className={`${inputCls} pr-24`} type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="Mínimo 8 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
                <button type="button" onClick={() => setShow((v) => !v)} className="absolute bottom-3 right-4 text-xs font-semibold text-slate-400 hover:text-slate-200">{show ? 'Ocultar' : 'Mostrar'}</button>
              </label>
              {error && <div className="rounded-xl border border-red-400/30 bg-red-500/15 p-3 text-sm text-red-200" role="alert">{error}</div>}
              <Btn kind="accent" className="w-full !rounded-2xl py-3.5 text-base font-bold" disabled={busy || code.length !== 6}>{busy ? 'Guardando…' : 'Cambiar contraseña'}</Btn>
              <button type="button" disabled={busy} onClick={() => sendCode()} className="w-full text-center text-sm text-slate-400 hover:text-slate-200">¿No llegó? Reenviar código</button>
            </form>
          )}
          <p className="mt-6 text-center text-sm"><button type="button" onClick={() => { setRec(null); setError(''); setInfo(''); setPassword(''); }} className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-200"><Icon name="back" className="h-3.5 w-3.5" />Volver a iniciar sesión</button></p>
        </div>
      </div>
    );
  }

  if (pay?.review) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#05060a] px-5 py-10 text-slate-100" style={{ fontFamily: "'Nunito', system-ui, sans-serif", backgroundImage: `radial-gradient(60% 45% at 50% 0%, ${ACCENT}26, transparent 70%)` }}>
        <div className="page-in w-full max-w-md text-center">
          <Brand size="lg" />
          <div className="mx-auto mt-6 grid h-16 w-16 place-items-center rounded-full " style={{ background: ACCENT + '22', color: ACCENT }} aria-hidden><Icon name="clock" className="h-8 w-8" /></div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Estamos revisando tu pago</h1>
          <p className="mt-3 text-sm text-slate-400">Apenas lo confirmemos tendrás acceso a <b className="text-slate-200">{pay.biz}</b>. Luego solo inicia sesión con tu correo y contraseña.</p>
          <a href={waLink(`Hola, ya hice el pago de Tono karaoke. Establecimiento: ${pay.biz}. Correo: ${email.trim()}.`)} target="_blank" rel="noreferrer" className="mt-6 block rounded-2xl py-3.5 text-base font-bold text-[#0b1030] hover:brightness-110" style={{ background: ACCENT }}>Enviar comprobante por WhatsApp</a>
          <Btn className="mt-3 w-full !rounded-2xl py-3.5" disabled={busy} onClick={async () => { setBusy(true); setError(''); const ok = await tryEnter(); setBusy(false); if (!ok) setError('Aún no hemos confirmado tu pago. Esta pantalla se actualiza sola cuando lo hagamos.'); }}>{busy ? 'Revisando…' : 'Ya me confirmaron, entrar'}</Btn>
          {error && <p className="mt-3 text-sm text-amber-300" role="status">{error}</p>}
          <p className="mt-3 text-xs text-slate-500">Esta pantalla revisa tu acceso cada pocos segundos y te deja entrar apenas confirmemos el pago.</p>
        </div>
      </div>
    );
  }

  if (pay) {
    const sel = PLANS.find((p) => p.id === pay.plan) ?? PLANS[0];
    const msg = `Hola, ya hice el pago de Tono karaoke (plan ${sel.name}, ${cop(sel.price)}). Establecimiento: ${pay.biz}. Correo: ${email.trim()}.`;
    return (
      <div className="grid min-h-dvh place-items-center bg-[#05060a] px-5 py-10 text-slate-100" style={{ fontFamily: "'Nunito', system-ui, sans-serif", backgroundImage: `radial-gradient(60% 45% at 50% 0%, ${ACCENT}26, transparent 70%)` }}>
        <div className="page-in w-full max-w-md">
          <Brand size="lg" />
          <div className="mt-6 text-center text-xs font-semibold uppercase tracking-[.3em]" style={{ color: ACCENT }}>Último paso</div>
          <h1 className="mt-2 text-center text-3xl font-extrabold tracking-tight">Realiza tu pago</h1>
          <p className="mt-2 text-center text-sm text-slate-400">Tu cuenta de <b className="text-slate-200">{pay.biz}</b> queda lista y se activa en cuanto confirmemos el pago. Paga con Bre-B, Nequi o llave y pulsa «Ya pagué»; mientras tanto no podrás ingresar al panel.</p>

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-baseline justify-between"><span className="text-sm text-slate-400">Plan {sel.name}</span><span className="text-3xl font-extrabold">{cop(sel.price)}<small className="text-sm font-normal text-slate-400"> COP/mes</small></span></div>
            <div className="mt-4 border-t border-white/10 pt-4 text-sm">
              <div className="mb-3 rounded-xl bg-white/[0.05] px-3 py-2.5"><small className="block text-[11px] uppercase tracking-wider text-slate-400">A nombre de</small><b className="break-words">{PAY_HOLDER}</b></div>
              {PAY_METHODS.length ? (
                <ul className="space-y-2">{PAY_METHODS.map((m) => <li key={m.name} className="flex justify-between gap-3"><span className="text-slate-400">{m.name}</span><b>{m.value || 'pídelo por WhatsApp'}</b></li>)}</ul>
              ) : (
                <p className="text-slate-300">Escríbenos por WhatsApp y te enviamos los datos de pago.</p>
              )}
            </div>
          </div>

          <a href={waLink(msg)} target="_blank" rel="noreferrer" className="mt-5 block rounded-2xl py-3.5 text-center text-base font-bold text-[#0b1030] hover:brightness-110" style={{ background: ACCENT }}>Enviar comprobante por WhatsApp</a>
          {error && <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/15 p-3 text-sm text-red-200" role="alert">{error}</div>}
          <Btn className="mt-3 w-full !rounded-2xl py-3.5" disabled={busy || !password} onClick={paid}>{busy ? 'Enviando…' : 'Ya pagué'}</Btn>
          <p className="mt-6 text-center text-xs text-slate-500"><Link to="/" className="inline-flex items-center gap-1.5 hover:text-slate-300"><Icon name="back" className="h-3.5 w-3.5" />Volver al inicio</Link></p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-dvh bg-[#05060a] text-slate-100 lg:grid-cols-[1.1fr_1fr]" style={{ fontFamily: "'Nunito', system-ui, sans-serif" }}>
      {/* Panel de marca */}
      <section className="relative hidden overflow-hidden border-r border-white/[0.07] lg:block" style={{ background: `radial-gradient(70% 60% at 70% 30%, ${ACCENT}26, transparent 70%), radial-gradient(60% 50% at 10% 100%, #6d28d922, transparent 70%), linear-gradient(180deg,#07080c,#05060a)` }}>
        <div className="absolute left-12 top-12"><Brand size="lg" /></div>
        <Headphones className="absolute left-1/2 top-[34%] w-[34rem] max-w-[80%] -translate-x-1/2 drop-shadow-[0_0_60px_rgba(169,184,255,.25)]" />
        <div className="absolute inset-x-12 bottom-14">
          <p className="text-5xl leading-tight text-slate-100" style={{ fontFamily: "'Caveat', cursive" }}>
            Tu karaoke,<br />tu estilo <span style={{ color: ACCENT }}><Icon name="heart" className="inline h-9 w-9 align-[-.1em]" /></span>
          </p>
          <p className="mt-4 max-w-sm text-[15px] text-slate-400">Administra tus mesas, personaliza la experiencia de cada una y deja que la música haga el resto.</p>
        </div>
      </section>

      {/* Formulario */}
      <main className="flex items-center justify-center px-5 py-10">
        <div className="page-in w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Brand size="lg" /></div>
          <div className="text-xs font-semibold uppercase tracking-[.3em]" style={{ color: ACCENT }}>{mode === 'login' ? 'Bienvenido' : 'Nuevo establecimiento'}</div>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight">{mode === 'login' ? 'Inicia sesión' : 'Crea tu cuenta'}</h1>
          <p className="mt-2 text-sm text-slate-400">{mode === 'login' ? 'Ingresa a tu panel de administración o DJ.' : 'Registra tu bar y empieza a recibir canciones en minutos.'}</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {mode === 'register' && (
              <>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-slate-300">Nombre del establecimiento</span>
                  <input className={inputCls} placeholder="Mi bar" value={bizName} onChange={(e) => setBizName(e.target.value)} required minLength={2} maxLength={80} autoFocus />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-slate-300">Tu nombre</span>
                  <input className={inputCls} autoComplete="name" placeholder="Nombre y apellido" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} />
                </label>
              </>
            )}
            {mode === 'register' && (
              <>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-slate-300">WhatsApp</span>
                  <input className={inputCls} type="tel" inputMode="tel" autoComplete="tel" placeholder="318 941 3881" value={phone} onChange={(e) => setPhone(e.target.value)} required pattern="\+?[0-9 ()\-]{7,18}" title="Número de celular con WhatsApp" />
                </label>
                <fieldset className="grid gap-1.5 text-sm">
                  <legend className="mb-1.5 font-medium text-slate-300">Plan</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {PLANS.map((p) => (
                      <button key={p.id} type="button" onClick={() => setPlan(p.id)} aria-pressed={plan === p.id} className={`rounded-xl border p-3 text-left transition ${plan === p.id ? 'border-indigo-300/60 bg-indigo-300/10' : 'border-white/10 bg-white/5 hover:border-white/25'}`}>
                        <span className="block text-xs text-slate-400">{p.name}</span>
                        <span className="block text-lg font-extrabold">{cop(p.price)}<small className="text-xs font-normal text-slate-400"> /mes</small></span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              </>
            )}
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-300">Correo</span>
              <input className={inputCls} type="email" autoComplete="username" placeholder="tu@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={mode === 'login'} />
            </label>
            <label className="relative grid gap-1.5 text-sm">
              <span className="font-medium text-slate-300">Contraseña</span>
              <input className={`${inputCls} pr-24`} type={show ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'login' ? '••••••••' : 'Mínimo 8 caracteres'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'register' ? 8 : undefined} />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute bottom-3 right-4 text-xs font-semibold text-slate-400 hover:text-slate-200">
                {show ? 'Ocultar' : 'Mostrar'}
              </button>
            </label>

            {mode === 'login' && (
              <div className="-mt-1 text-right"><button type="button" onClick={() => { setRec({ step: 'email' }); setError(''); setInfo(''); setPassword(''); }} className="text-xs font-semibold hover:underline" style={{ color: ACCENT }}>¿Olvidaste tu contraseña?</button></div>
            )}
            {info && !error && <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-200" role="status">{info}</div>}
            {error && <div className="rounded-xl border border-red-400/30 bg-red-500/15 p-3 text-sm text-red-200" role="alert">{error}</div>}

            {mode === 'register' && (
              <p className="text-xs leading-relaxed text-slate-400">
                Al crear tu cuenta aceptas los <Link to="/terminos" target="_blank" className="underline hover:text-slate-200">Términos y condiciones</Link> y la <Link to="/privacidad" target="_blank" className="underline hover:text-slate-200">Política de tratamiento de datos</Link>.
              </p>
            )}
            <Btn kind="accent" className="w-full !rounded-2xl py-3.5 text-base font-bold" disabled={busy}>{busy ? (mode === 'login' ? 'Entrando…' : 'Creando…') : mode === 'login' ? 'Entrar' : 'Continuar al pago'}</Btn>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            {mode === 'login' ? '¿Aún no tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
            <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }} className="font-semibold hover:underline" style={{ color: ACCENT }}>
              {mode === 'login' ? 'Regístrate' : 'Inicia sesión'}
            </button>
          </p>

          <p className="mt-8 text-center text-xs leading-relaxed text-slate-500">
            ¿Eres cliente? Escanea el código QR de tu mesa para pedir canciones.
            <br />
            <Link to="/" className="mt-2 inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-200"><Icon name="back" className="h-3.5 w-3.5" />Volver al inicio</Link>
            <span className="mt-3 block"><Link to="/privacidad" className="hover:text-slate-300">Privacidad</Link> · <Link to="/terminos" className="hover:text-slate-300">Términos</Link></span>
          </p>
        </div>
      </main>
    </div>
  );
}
