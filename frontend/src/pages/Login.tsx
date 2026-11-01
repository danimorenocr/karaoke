import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, auth } from '../lib/api';

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api('POST', '/auth/login', { email, password }, false);
      auth.save(r.token, r.user);
      nav(r.user.role === 'SUPER_ADMIN' ? '/super-admin' : r.user.role === 'ADMIN' ? '/admin' : '/dj');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-20 max-w-sm space-y-3 p-6">
      <h1 className="text-2xl font-bold">Iniciar sesion</h1>
      <input className="input" type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input className="input" type="password" placeholder="Contrasena" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>Entrar</button>
    </form>
  );
}
