import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { configPath, loadConfig, saveConfig } from './config.js';
import { createAgent } from './connection.js';
import { pickFolder } from './folderPicker.js';
import { MIME } from './library.js';
import { ui } from './ui.js';

const cfg = loadConfig();
const agent = createAgent(() => cfg);

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type + '; charset=utf-8' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};
const readJson = (req) =>
  new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
  });

/** Video con soporte de Range (adelantar / retomar a mitad de cancion). */
function serveVideo(req, res, id) {
  const file = agent.file(id);
  if (!file) return send(res, 404, { error: 'video no encontrado' });
  let stat;
  try { stat = fs.statSync(file); } catch { return send(res, 404, { error: 'archivo no disponible' }); }
  const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  let start = 0;
  let end = stat.size - 1;
  if (m) {
    if (m[1] !== '') { start = Number(m[1]); end = m[2] !== '' ? Math.min(Number(m[2]), end) : end; }
    else if (m[2] !== '') { start = Math.max(0, stat.size - Number(m[2])); }
    if (start > end || start >= stat.size) { res.writeHead(416, { 'content-range': `bytes */${stat.size}` }); return res.end(); }
  }
  res.writeHead(m ? 206 : 200, {
    'content-type': type,
    'accept-ranges': 'bytes',
    'content-length': end - start + 1,
    ...(m ? { 'content-range': `bytes ${start}-${end}/${stat.size}` } : {}),
  });
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(file, { start, end });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  // La TV (otra pagina web en este mismo navegador) pide los videos: se permite cualquier origen, pero solo lectura
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-private-network', 'true');
  res.setHeader('access-control-allow-headers', 'range');
  res.setHeader('access-control-expose-headers', 'content-range, content-length, accept-ranges');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const v = /^\/video\/(L[\w-]{10})$/.exec(url.pathname);
  if (v && (req.method === 'GET' || req.method === 'HEAD')) return serveVideo(req, res, v[1]);
  if (url.pathname === '/ping') return send(res, 200, { ok: true, agent: 'karaoke', songs: agent.state().count });

  if (url.pathname === '/' && req.method === 'GET') return send(res, 200, ui, 'text/html');
  if (url.pathname === '/api/state' && req.method === 'GET') {
    return send(res, 200, { ...agent.state(), config: { ...cfg, token: cfg.token ? '••••' + cfg.token.slice(-4) : '' }, configPath });
  }

  // Los POST de configuracion exigen un encabezado propio: una pagina web ajena no puede enviarlo (CORS lo bloquea)
  if (req.method === 'POST' && req.headers['x-agent-ui'] === '1') {
    if (url.pathname === '/api/config') {
      const b = await readJson(req);
      if (typeof b.server === 'string' && b.server.trim()) cfg.server = b.server.trim().replace(/\/+$/, '');
      if (typeof b.token === 'string' && b.token.trim() && !b.token.includes('•')) cfg.token = b.token.trim();
      if (typeof b.folder === 'string') cfg.folder = b.folder.trim();
      saveConfig(cfg);
      agent.apply();
      return send(res, 200, { ok: true });
    }
    if (url.pathname === '/api/pick-folder') {
      try { return send(res, 200, { folder: await pickFolder() }); }
      catch (e) { return send(res, 500, { error: e.message }); }
    }
  }
  send(res, 404, { error: 'no encontrado' });
});

// Solo escucha en este PC (127.0.0.1): nadie de la red del bar puede pedir los videos ni cambiar la configuracion
server.listen(cfg.port, '127.0.0.1', () => {
  console.log(`Agente karaoke listo: http://localhost:${cfg.port}  (configuracion en ${configPath})`);
  agent.apply();
});
server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `El puerto ${cfg.port} ya esta en uso (el agente ya esta abierto?)` : e.message);
  process.exit(1);
});
