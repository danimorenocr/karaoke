import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import { Protected } from './components/ui';
import Home from './pages/Home';
import Login from './pages/Login';
import Customer from './pages/Customer';
import Dj from './pages/Dj';
import Tv from './pages/Tv';
import Admin from './pages/Admin';
import SuperAdmin from './pages/SuperAdmin';
import { Privacy, Terms } from './pages/Legal';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/privacidad" element={<Privacy />} />
        <Route path="/terminos" element={<Terms />} />
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
