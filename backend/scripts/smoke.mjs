// Prueba de humo end-to-end contra una API en marcha:  API=http://localhost:3000 node scripts/smoke.mjs
const API = process.env.API ?? 'http://localhost:3000';
const SA = { email: process.env.SUPERADMIN_EMAIL ?? 'admin@karaoke.local', password: process.env.SUPERADMIN_PASSWORD ?? 'cambiame123' };
let failed = 0;
const ok = (c, m) => { console.log(c ? 'OK  ' : 'FAIL', m); if (!c) failed++; };

async function call(method, path, { token, body } = {}) {
  const r = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => null);
  return { status: r.status, json };
}
const login = async (email, password) => (await call('POST', '/auth/login', { body: { email, password } })).json?.token;

const suffix = Date.now().toString(36);
const sa = await login(SA.email, SA.password);
ok(!!sa, 'login super admin');

async function makeBar(n) {
  const email = `admin-${n}-${suffix}@t.local`;
  const b = await call('POST', '/super/businesses', { token: sa, body: { name: `Bar ${n} ${suffix}`, adminName: 'Admin', adminEmail: email, adminPassword: 'password123' } });
  const admin = await login(email, 'password123');
  const djEmail = `dj-${n}-${suffix}@t.local`;
  await call('POST', '/admin/staff', { token: admin, body: { name: 'DJ', email: djEmail, password: 'password123' } });
  const dj = await login(djEmail, 'password123');
  await call('PATCH', '/admin/business', { token: admin, body: { maxPendingPerTable: 3 } });
  const t1 = (await call('POST', '/admin/tables', { token: admin, body: { name: 'Mesa 1' } })).json;
  const t2 = (await call('POST', '/admin/tables', { token: admin, body: { name: 'Mesa 2' } })).json;
  return { id: b.json.id, admin, dj, t1, t2 };
}
const A = await makeBar('A');
const B = await makeBar('B');
ok(A.t1?.qrToken && A.dj, 'bar A creado con mesas y DJ');

const song = (i) => ({ videoId: `abcdefghi${String(i).padStart(2, '0')}`, title: `Cancion ${i}` });
let r = await call('POST', `/public/${A.t1.qrToken}/requests`, { body: song(1) });
ok(r.status === 409, 'pedir sin sesion activa -> 409');

await call('POST', '/dj/session/start', { token: A.dj });
await call('POST', '/dj/session/start', { token: B.dj });

// 6 pedidos simultaneos de la misma mesa: solo 3 deben pasar (limite por defecto)
const res = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => call('POST', `/public/${A.t1.qrToken}/requests`, { body: song(i) })));
const created = res.filter((x) => x.status === 201);
ok(created.length === 3, `limite por mesa bajo concurrencia (pasaron ${created.length}/6)`);

r = await call('POST', `/public/${A.t2.qrToken}/requests`, { body: song(9) });
ok(r.status === 201, 'otra mesa si puede pedir');

let st = (await call('GET', '/dj/queue', { token: A.dj })).json;
ok(st.pending.length === 4 && st.queue.length === 0, 'DJ ve 4 pendientes');
ok((await call('GET', '/dj/queue', { token: B.dj })).json.pending.length === 0, 'bar B no ve solicitudes de A');

const [p1, p2, p3] = st.pending;
r = await call('PATCH', `/dj/requests/${p1.id}/approve`, { token: B.dj });
ok(r.status === 404, 'DJ de B no puede aprobar solicitud de A');
await call('PATCH', `/dj/requests/${p1.id}/approve`, { token: A.dj });
await call('PATCH', `/dj/requests/${p2.id}/approve`, { token: A.dj });
await call('PATCH', `/dj/requests/${p3.id}/reject`, { token: A.dj, body: { reason: 'no' } });
st = (await call('GET', '/dj/queue', { token: A.dj })).json;
ok(st.queue.length === 2 && st.current === null, 'aprobadas en cola, nada suena antes de iniciar TV');

r = await call('PATCH', '/dj/queue/reorder', { token: A.dj, body: { ids: [p2.id, p1.id] } });
st = (await call('GET', '/dj/queue', { token: A.dj })).json;
ok(r.status === 200 && st.queue[0].id === p2.id, 'reordenar');

await call('POST', '/player/next', { token: A.dj });
st = (await call('GET', '/player/state', { token: A.dj })).json;
ok(st.current?.id === p2.id && st.next?.id === p1.id, 'TV inicia: suena la primera, siguiente lista');

// latido de la TV: guarda posicion y marca la TV como activa
await call('POST', '/player/heartbeat', { token: A.dj, body: { requestId: p2.id, positionSec: 42 } });
st = (await call('GET', '/dj/queue', { token: A.dj })).json;
ok(st.session.positionSec === 42 && st.tvArmed === true && st.tvConnected === true, 'latido guarda posicion y marca TV activa');
await call('POST', '/player/heartbeat', { token: A.dj, body: { requestId: 'otra-cancion', positionSec: 99 } });
st = (await call('GET', '/dj/queue', { token: A.dj })).json;
ok(st.session.positionSec === 42, 'latido de una cancion que no suena no pisa la posicion');

// "termino" duplicado y simultaneo: solo debe avanzar una vez
await Promise.all([1, 2, 3].map(() => call('POST', '/player/ended', { token: A.dj, body: { requestId: p2.id } })));
st = (await call('GET', '/player/state', { token: A.dj })).json;
ok(st.current?.id === p1.id && st.next === null, 'evento ended repetido avanza una sola vez');
ok((await call('GET', '/dj/queue', { token: A.dj })).json.session.positionSec === 0, 'cancion nueva arranca en posicion 0');

await call('POST', '/player/error', { token: A.dj, body: { requestId: p1.id } });
st = (await call('GET', '/dj/queue', { token: A.dj })).json;
ok(st.current === null && st.history.some((h) => h.id === p1.id && h.status === 'FAILED'), 'error de video -> FAILED y continua');
await call('PATCH', `/dj/requests/${p1.id}/retry`, { token: A.dj });
st = (await call('GET', '/dj/queue', { token: A.dj })).json;
ok(st.current?.id === p1.id, 'reintentar vuelve a reproducir');

// aprobar con la TV ya iniciada y nada sonando -> auto-play
await call('POST', '/dj/playback/skip', { token: A.dj });
const extra = (await call('POST', `/public/${A.t2.qrToken}/requests`, { body: song(20) })).json;
await call('PATCH', `/dj/requests/${extra.id}/approve`, { token: A.dj });
st = (await call('GET', '/dj/queue', { token: A.dj })).json;
ok(st.current?.id === extra.id || st.current !== null, 'aprobar con TV activa reproduce automaticamente');

// QR revocado
const old = A.t1.qrToken;
const rot = (await call('POST', `/admin/tables/${A.t1.id}/rotate-qr`, { token: A.admin })).json;
ok((await call('GET', `/public/${old}/state`)).status === 404, 'QR revocado deja de funcionar');
ok((await call('GET', `/public/${rot.qrToken}/state`)).status === 200, 'QR nuevo funciona');

// aislamiento admin
r = await call('PATCH', `/admin/tables/${A.t2.id}`, { token: B.admin, body: { active: false } });
ok(r.status === 404, 'admin de B no puede editar mesas de A');
r = await call('GET', '/super/businesses', { token: A.admin });
ok(r.status === 403, 'admin de bar no accede a super admin');

// sesion cerrada / suspension
await call('POST', '/dj/session/stop', { token: A.dj });
r = await call('POST', `/public/${A.t2.qrToken}/requests`, { body: song(30) });
ok(r.status === 409, 'sesion cerrada rechaza pedidos');
await call('PATCH', `/super/businesses/${B.id}/status`, { token: sa, body: { active: false } });
ok((await call('GET', '/dj/queue', { token: B.dj })).status === 403, 'bar suspendido pierde acceso');

console.log(failed ? `\n${failed} FALLOS` : '\nTodo OK');
process.exit(failed ? 1 : 0);
