import { Link } from 'react-router-dom';
import { auth } from '../lib/api';
import { ACCENT, Btn, Icon, IconName } from '../components/kit';
import Landing from './Landing';

const LINKS: { to: string; icon: IconName; title: string; desc: string; roles: string[] }[] = [
  { to: '/dj', icon: 'dj', title: 'Panel DJ', desc: 'Aprueba, ordena y controla la cola', roles: ['DJ', 'ADMIN'] },
  { to: '/tv', icon: 'tv', title: 'Pantalla TV', desc: 'Abre esto en la pantalla del bar', roles: ['DJ', 'ADMIN'] },
  { to: '/admin', icon: 'chart', title: 'Administración', desc: 'Estadísticas, mesas, QR y configuración', roles: ['ADMIN'] },
  { to: '/super-admin', icon: 'shield', title: 'Super administrador', desc: 'Establecimientos y salud de la plataforma', roles: ['SUPER_ADMIN'] },
];

const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: 'Super administrador', ADMIN: 'Administrador', DJ: 'DJ' };

export default function Home() {
  const user = auth.user();
  if (!user || !auth.token()) return <Landing />;
  const items = user ? LINKS.filter((l) => l.roles.includes(user.role)) : [];

  return (
    <div className="grid min-h-dvh place-items-center bg-[#05060a] px-4 py-10 text-slate-100" style={{ backgroundImage: `radial-gradient(60% 45% at 50% 0%, ${ACCENT}26, transparent 70%)` }}>
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl " style={{ background: ACCENT + '22', color: ACCENT, boxShadow: `0 0 40px ${ACCENT}33` }}><Icon name="mic" className="h-8 w-8" /></div>
        <h1 className="text-4xl font-extrabold tracking-tight">Karaoke</h1>

        {user ? (
          <>
            <p className="mt-2 text-slate-400">
              Hola, <b className="text-slate-200">{user.name}</b>
              <span className="ml-2 rounded-full bg-white/10 px-2.5 py-0.5 text-xs">{ROLE_LABEL[user.role]}</span>
              {user.businessName && <span className="block text-sm">{user.businessName}</span>}
            </p>
            <div className="mt-8 space-y-3 text-left">
              {items.map((l) => (
                <Link key={l.to} to={l.to} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-white/25 hover:bg-white/[0.07]">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10 text-2xl" style={{ color: ACCENT }}><Icon name={l.icon} className="h-6 w-6" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{l.title}</span>
                    <span className="block text-sm text-slate-400">{l.desc}</span>
                  </span>
                  <span className="text-slate-500">›</span>
                </Link>
              ))}
            </div>
            <Btn className="mt-6 w-full" onClick={() => { auth.clear(); location.href = '/login'; }}>Cerrar sesión</Btn>
          </>
        ) : (
          <>
            <p className="mx-auto mt-3 max-w-xs text-slate-400">Cola de canciones para tu bar: los clientes piden desde su mesa escaneando un QR.</p>
            <Link to="/login" className="mt-8 block rounded-xl py-3 text-base font-semibold text-[#0b1030] hover:brightness-110" style={{ background: ACCENT }}>
              Iniciar sesión
            </Link>
            <p className="mt-6 text-xs text-slate-500">¿Eres cliente? Escanea el código QR de tu mesa.</p>
          </>
        )}
      </div>
    </div>
  );
}
