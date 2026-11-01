import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import './index.css';
import { Protected } from './components/ui';
import { auth } from './lib/api';
import Login from './pages/Login';
import Customer from './pages/Customer';
import Dj from './pages/Dj';
import Tv from './pages/Tv';
import Admin from './pages/Admin';
import SuperAdmin from './pages/SuperAdmin';

function Home() {
  const user = auth.user();
  const links: [string, string, string[]][] = [
    ['/dj', 'Panel DJ', ['DJ', 'ADMIN']],
    ['/tv', 'Pantalla TV', ['DJ', 'ADMIN']],
    ['/admin', 'Administrador del bar', ['ADMIN']],
    ['/super-admin', 'Super administrador', ['SUPER_ADMIN']],
  ];
  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="mb-1 text-3xl font-bold">Karaoke</h1>
      <p className="mb-6 text-zinc-400">Los clientes entran escaneando el QR de su mesa.</p>
      {user ? (
        <div className="space-y-2">
          <div className="text-sm text-zinc-400">Sesion: {user.name} ({user.role})</div>
          {links.filter(([, , roles]) => roles.includes(user.role)).map(([to, label]) => (
            <Link key={to} to={to} className="btn btn-primary block text-center">{label}</Link>
          ))}
          <button className="btn w-full" onClick={() => { auth.clear(); location.reload(); }}>Cerrar sesion</button>
        </div>
      ) : (
        <Link to="/login" className="btn btn-primary block text-center">Iniciar sesion</Link>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/m/:token" element={<Customer />} />
        <Route path="/dj" element={<Protected roles={['DJ', 'ADMIN']}><Dj /></Protected>} />
        <Route path="/tv" element={<Protected roles={['DJ', 'ADMIN']}><Tv /></Protected>} />
        <Route path="/admin" element={<Protected roles={['ADMIN']}><Admin /></Protected>} />
        <Route path="/super-admin" element={<Protected roles={['SUPER_ADMIN']}><SuperAdmin /></Protected>} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
