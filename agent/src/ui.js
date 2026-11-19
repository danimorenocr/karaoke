export const ui = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Agente de karaoke</title>
<style>
  body{font-family:system-ui,Segoe UI,sans-serif;background:#0f1117;color:#e8e8ee;margin:0;display:grid;place-items:center;min-height:100vh}
  main{width:min(560px,92vw);background:#181b25;border:1px solid #2a2f3f;border-radius:16px;padding:28px}
  h1{margin:0 0 4px;font-size:22px} p.sub{margin:0 0 20px;color:#9aa0b5;font-size:14px}
  label{display:block;font-size:13px;color:#9aa0b5;margin:16px 0 6px}
  input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid #2f3547;background:#0f1117;color:#fff;font-size:14px}
  .row{display:flex;gap:8px} .row input{flex:1}
  button{padding:10px 16px;border:0;border-radius:10px;background:#6d7cff;color:#fff;font-weight:600;cursor:pointer;font-size:14px}
  button.sec{background:#2a2f3f} button:disabled{opacity:.5}
  .st{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 4px}
  .pill{padding:6px 12px;border-radius:999px;font-size:13px;background:#2a2f3f}
  .ok{background:#12391f;color:#7ee2a0}.bad{background:#3d1620;color:#ff9aa9}
  .err{margin-top:14px;color:#ff9aa9;font-size:13px} .msg{margin-top:14px;color:#7ee2a0;font-size:13px}
  small{color:#7c8298;display:block;margin-top:18px;line-height:1.5}
  details{margin-top:16px;background:#0f1117;border:1px solid #2a2f3f;border-radius:10px;padding:10px 14px}
  summary{cursor:pointer;font-size:14px;font-weight:600}
  ul{margin:10px 0 2px;padding-left:18px;max-height:220px;overflow:auto;font-size:13px;line-height:1.7;color:#cfd3e4}
  ul.sk li span{color:#ff9aa9}
</style></head><body><main>
<h1>Agente de karaoke</h1>
<p class="sub">Sirve los videos de este PC a la TV del bar.</p>
<div class="st"><span id="p-conn" class="pill">...</span><span id="p-songs" class="pill">...</span></div>

<label>Carpeta con los videos</label>
<div class="row"><input id="folder" placeholder="C:\\Karaoke\\Videos"><button class="sec" id="pick">Elegir...</button></div>

<label>Token del agente <span style="color:#7c8298">(Admin - Biblioteca local)</span></label>
<input id="token" placeholder="pega aqui el token" autocomplete="off">

<label>Servidor</label>
<input id="server" placeholder="http://localhost:3000">

<div style="margin-top:20px"><button id="save">Guardar y conectar</button></div>
<div id="err" class="err"></div><div id="msg" class="msg"></div>
<details open><summary id="t-songs">Canciones cargadas</summary><ul id="l-songs"></ul></details>
<details id="d-skip" style="display:none"><summary id="t-skip">Archivos ignorados</summary><ul id="l-skip" class="sk"></ul></details>
<small>Formatos: mp4, m4v, mov, webm, mkv. El nombre del archivo es lo que se busca (ej. <b>Artista - Cancion.mp4</b>).<br>Los cambios en la carpeta se detectan solos.</small>
</main>
<script>
const $ = (i) => document.getElementById(i);
const post = (u, b) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', 'x-agent-ui': '1' }, body: JSON.stringify(b || {}) }).then((r) => r.json());
let filled = false;
async function refresh() {
  const s = await fetch('/api/state').then((r) => r.json()).catch(() => null);
  if (!s) return;
  $('p-conn').textContent = s.connected ? 'Conectado al servidor' : 'Sin conexion';
  $('p-conn').className = 'pill ' + (s.connected ? 'ok' : 'bad');
  $('p-songs').textContent = s.count + ' canciones';
  $('p-songs').className = 'pill ' + (s.count ? 'ok' : '');
  $('err').textContent = s.error || '';
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  $('t-songs').textContent = 'Canciones cargadas (' + s.count + ')';
  $('l-songs').innerHTML = s.songs.length ? s.songs.map((n) => '<li>' + esc(n) + '</li>').join('') : '<li>Ninguna todavia</li>';
  $('d-skip').style.display = s.skipped.length ? '' : 'none';
  $('t-skip').textContent = 'Archivos ignorados (' + s.skipped.length + ')';
  $('l-skip').innerHTML = s.skipped.map((x) => '<li>' + esc(x.name) + ' - <span>' + esc(x.reason) + '</span></li>').join('');
  if (!filled) { $('folder').value = s.config.folder; $('token').value = s.config.token; $('server').value = s.config.server; filled = true; }
}
$('pick').onclick = async () => {
  $('pick').disabled = true;
  const r = await post('/api/pick-folder');
  $('pick').disabled = false;
  if (r.folder) $('folder').value = r.folder; else if (r.error) $('err').textContent = r.error;
};
$('save').onclick = async () => {
  $('msg').textContent = '';
  await post('/api/config', { folder: $('folder').value, token: $('token').value, server: $('server').value });
  $('msg').textContent = 'Guardado.';
  setTimeout(refresh, 1200);
};
refresh(); setInterval(refresh, 3000);
</script></body></html>`;
