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

/** Fila "fantasma" que se muestra mientras cargan los resultados de busqueda. */
export function SkeletonRow() {
  return (
    <div className="flex animate-pulse items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-2" aria-hidden>
      <div className="h-14 w-14 shrink-0 rounded-lg bg-white/10" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3.5 w-4/5 rounded bg-white/10" />
        <div className="h-3 w-2/5 rounded bg-white/10" />
      </div>
      <div className="h-11 w-11 shrink-0 rounded-full bg-white/10" />
    </div>
  );
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Buscando canciones">
      {Array.from({ length: rows }, (_, i) => <SkeletonRow key={i} />)}
    </div>
  );
}
