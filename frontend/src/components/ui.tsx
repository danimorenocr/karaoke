import { ReactNode, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { auth, SessionUser } from '../lib/api';

export function Protected({ roles, children }: { roles: SessionUser['role'][]; children: ReactNode }) {
  const user = auth.user();
  if (!auth.token() || !user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function TopBar({ title }: { title: string }) {
  const user = auth.user();
  return (
    <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
      <div>
        <div className="font-bold">{title}</div>
        <div className="text-xs text-zinc-400">
          {user?.businessName ? `${user.businessName} · ` : ''}
          {user?.name}
        </div>
      </div>
      <div className="flex gap-2">
        <Link to="/" className="btn">Inicio</Link>
        <button className="btn" onClick={() => { auth.clear(); location.href = '/login'; }}>Salir</button>
      </div>
    </header>
  );
}

export function Thumb({ src, className = 'h-12 w-20' }: { src?: string | null; className?: string }) {
  return src ? <img src={src} className={`${className} shrink-0 rounded object-cover`} /> : <div className={`${className} shrink-0 rounded bg-zinc-800`} />;
}

export function useToast() {
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg && (
    <div className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-lg ${msg.error ? 'bg-red-700' : 'bg-emerald-700'}`}>
      {msg.text}
    </div>
  );
  return { toast: (text: string, error = false) => setMsg({ text, error }), node };
}

/** Ejecuta una accion mostrando el error del backend en un toast. */
export function useAction(toast: (t: string, e?: boolean) => void) {
  return async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e: any) {
      toast(e.message ?? 'Error', true);
    }
  };
}
