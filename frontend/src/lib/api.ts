import { io, Socket } from 'socket.io-client';

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface SessionUser {
  id: string;
  name: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'DJ';
  businessId: string | null;
  businessName: string | null;
}

const TOKEN_KEY = 'karaoke_token';
const USER_KEY = 'karaoke_user';

export const auth = {
  token: () => localStorage.getItem(TOKEN_KEY),
  user: (): SessionUser | null => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null');
    } catch {
      return null;
    }
  },
  save(token: string, user: SessionUser) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = any>(method: string, path: string, body?: unknown, useAuth = true): Promise<T> {
  const token = useAuth ? auth.token() : null;
  const res = await fetch(API_URL + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && useAuth) {
      auth.clear();
      if (location.pathname !== '/login') location.href = '/login';
    }
    const msg = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
    throw new ApiError(res.status, msg ?? `Error ${res.status}`);
  }
  return data as T;
}

export const pub = <T = any>(method: string, path: string, body?: unknown) => api<T>(method, path, body, false);

/** Socket con reconexion automatica; `onEvent` se invoca en cada evento y tambien al (re)conectar. */
export function connectSocket(
  opts: { tableToken?: string; role?: 'tv' | 'dj' },
  onEvent: (name: string, payload?: any) => void,
): () => void {
  const socket: Socket = io(API_URL, {
    auth: opts.tableToken ? { tableToken: opts.tableToken } : { token: auth.token(), role: opts.role },
    // Reconexion automatica y sin limite de intentos (el wifi del bar puede caerse un rato)
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });
  ['queue.updated', 'playback.paused', 'playback.resumed', 'playback.reload', 'tv.status'].forEach((e) =>
    socket.on(e, (p) => onEvent(e, p)),
  );
  socket.on('connect', () => onEvent('connect'));
  socket.on('disconnect', () => onEvent('disconnect'));
  return () => {
    socket.disconnect();
  };
}

export const fmtDuration = (s?: number | null) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');
