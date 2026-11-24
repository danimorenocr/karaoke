import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const exeDir = path.dirname(process.execPath);
/** Carpeta bin\ junto al agente instalado (yt-dlp.exe + ffmpeg.exe). En desarrollo se usa lo que haya en el PATH. */
const binDir = path.join(exeDir, 'bin');
const ytdlp = fs.existsSync(path.join(binDir, 'yt-dlp.exe')) ? path.join(binDir, 'yt-dlp.exe') : 'yt-dlp';
const hasBin = ytdlp !== 'yt-dlp';

const ffmpegCmd = fs.existsSync(path.join(binDir, 'ffmpeg.exe')) ? path.join(binDir, 'ffmpeg.exe') : 'ffmpeg';
const denoCmd = fs.existsSync(path.join(binDir, 'deno.exe')) ? path.join(binDir, 'deno.exe') : null;
const VIDEO_ID = /^[\w-]{11}$/;
const WEEK = 7 * 24 * 3600 * 1000;

function run(args, { timeout = 15 * 60_000, onLine, cmd = ytdlp } = {}) {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let p;
    try {
      p = spawn(cmd, args, { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    } catch (e) { return resolve({ code: -1, out, err: e.message }); }
    const t = setTimeout(() => { try { p.kill(); } catch { /* ya termino */ } }, timeout);
    // Lineas completas (el progreso llega por stdout o stderr segun la version)
    const feed = (store) => {
      let buf = '';
      return (d) => {
        store(d);
        if (!onLine) return;
        buf += d;
        const parts = buf.split(/\r?\n|\r/);
        buf = parts.pop();
        parts.forEach(onLine);
      };
    };
    p.stdout.on('data', feed((d) => (out += d)));
    p.stderr.on('data', feed((d) => (err += d)));
    p.on('error', (e) => { clearTimeout(t); resolve({ code: -1, out, err: e.code === 'ENOENT' ? 'yt-dlp no esta instalado' : e.message }); });
    p.on('close', (code) => { clearTimeout(t); resolve({ code, out, err }); });
  });
}

/**
 * Baja videos de YouTube a la carpeta del bar con yt-dlp (de a uno).
 * onDone(requestId, filePath) / onFail(requestId, reason). Despues de bajarlos, el agente los indexa como cualquier otro video.
 */
export function createDownloader({ getFolder, onDone, onFail, onProgress }) {
  const events = []; // ultimos eventos (para diagnosticar desde la pantalla del agente)
  const log = (msg, level = 'info') => {
    events.push({ t: new Date().toISOString(), level, msg: String(msg).slice(0, 400) });
    if (events.length > 40) events.shift();
  };

  /** Revisa que yt-dlp y ffmpeg existan y arranquen (en otro PC suele faltar algo: archivos, antivirus o el runtime de Visual C++). */
  async function checkDeps() {
    const one = async (name, cmd, args, bundled) => {
      const where = bundled ? cmd : `${cmd} (del PATH)`;
      if (bundled && !fs.existsSync(cmd)) return { name, ok: false, path: cmd, error: `No se encontro el archivo ${cmd}. Reinstala el agente con el instalador nuevo.` };
      const r = await run(args, { cmd, timeout: 20_000 });
      if (r.code === 0) return { name, ok: true, path: where, version: (r.out.split(/\r?\n/).find(Boolean) ?? '').slice(0, 120) };
      const msg = (r.err || r.out || '').trim().split(/\r?\n/).filter(Boolean).slice(-2).join(' ') || `termino con codigo ${r.code}`;
      return { name, ok: false, path: where, error: msg.slice(0, 300) };
    };
    const [y, f, d] = await Promise.all([
      one('yt-dlp', ytdlp, ['--version'], hasBin),
      one('ffmpeg', ffmpegCmd, ['-version'], ffmpegCmd !== 'ffmpeg'),
      one('deno', denoCmd ?? 'deno', ['--version'], !!denoCmd),
    ]);
    return { ytdlp: y, ffmpeg: f, deno: d, ok: y.ok && f.ok && d.ok };
  }

  const queue = [];
  let busy = false;
  let lastUpdate = 0;
  const info = { running: false, current: null, lastError: '', percent: 0 };

  async function maybeUpdate(force = false) {
    if (!hasBin || (!force && Date.now() - lastUpdate < WEEK)) return;
    lastUpdate = Date.now();
    const r = await run(['-U'], { timeout: 2 * 60_000 });
    if (r.code !== 0) {
      const m = (r.err || r.out).trim().split('\n').pop();
      console.warn('yt-dlp -U:', m);
      log(`Actualizar yt-dlp fallo: ${m}`, 'warn');
    } else log('yt-dlp actualizado/revisado');
  }

  /** Busca un archivo ya bajado de ese video (el nombre lleva el id entre corchetes cuando se baja con este agente). */
  function existing(folder, videoId) {
    try {
      const f = fs.readdirSync(folder).find((n) => n.includes(`[${videoId}]`) && /\.(mp4|webm|mkv|m4v|mov)$/i.test(n));
      return f ? path.join(folder, f) : null;
    } catch { return null; }
  }

  async function download({ requestId, videoId }) {
    const folder = getFolder();
    if (!folder) return onFail(requestId, 'el agente no tiene carpeta configurada');
    if (!VIDEO_ID.test(videoId)) return onFail(requestId, 'id de video invalido');
    const have = existing(folder, videoId);
    if (have) return onDone(requestId, have);

    const tmp = path.join(folder, '.tmp');
    const args = [
      '--no-playlist', '--windows-filenames', '--trim-filenames', '120', '--encoding', 'utf-8',
      '-f', 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/b[height<=720]/b',
      '--merge-output-format', 'mp4',
      // El id va en el nombre: sirve para no volver a bajar el mismo video
      '-o', `%(title)s [${videoId}].%(ext)s`,
      '-P', `home:${folder}`, '-P', `temp:${tmp}`,
      '--newline', '--progress', '--progress-template', 'download:PRG|%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(info.format_id)s',
      '--print', 'after_move:filepath',
      ...(hasBin ? ['--ffmpeg-location', binDir] : []),
      // YouTube exige un runtime de JavaScript para resolver sus desafios: sin el, faltan formatos y las descargas fallan
      ...(denoCmd ? ['--js-runtimes', `deno:${denoCmd}`] : []),
      `https://www.youtube.com/watch?v=${videoId}`,
    ];
    // Progreso real: yt-dlp baja el video y luego el audio (2 tramos) y al final los une con ffmpeg
    const streams = new Map();
    let pct = 0;
    const onLine = (line) => {
      const m = /^PRG\|(\w+)\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)$/.exec(line.trim());
      if (!m) return;
      const [, status, got, total, est, fmt] = m;
      const size = Number(total) || Number(est) || 0; // YouTube a veces manda NA: Number('NA') = NaN = 0
      const frac = status === 'finished' ? 1 : size ? Math.min(1, (Number(got) || 0) / size) : 0;
      streams.set(fmt, frac);
      const list = [...streams.values()];
      // Con 2 tramos: video 0-85 %, audio 85-97 %; con 1 solo, 0-97 %. El resto es la union con ffmpeg.
      const weights = list.length >= 2 ? [85, 12] : [97];
      const next = Math.round(list.reduce((a, f, i) => a + f * (weights[i] ?? 0), 0));
      if (next > pct) { pct = next; info.percent = pct; onProgress?.(requestId, pct); }
    };
    log(`Bajando ${videoId}...`);
    onProgress?.(requestId, 0);
    let r = await run(args, { onLine });
    // YouTube cambia a menudo: si fallo por extraccion, se actualiza yt-dlp y se reintenta una vez
    if (r.code !== 0 && hasBin && /unable to extract|sign in|HTTP Error 403|nsig|signature/i.test(r.err)) {
      log('Fallo la extraccion: actualizando yt-dlp y reintentando', 'warn');
      await maybeUpdate(true);
      streams.clear();
      pct = 0;
      r = await run(args, { onLine });
    }
    const file = [...r.out.split(/\r?\n/), ...r.err.split(/\r?\n/)]
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('PRG|') && path.isAbsolute(l) && fs.existsSync(l))
      .pop();
    if (r.code === 0 && file) {
      onProgress?.(requestId, 100);
      log(`Listo: ${path.basename(file)}`);
      return onDone(requestId, file);
    }
    const errLines = r.err.trim().split(/\r?\n/).filter((l) => l && !l.startsWith('PRG|'));
    const reason = (errLines.filter((l) => /error/i.test(l)).pop() || errLines.pop() || `yt-dlp termino con codigo ${r.code}`).slice(0, 300);
    info.lastError = reason;
    log(`Fallo ${videoId}: ${reason}`, 'error');
    return onFail(requestId, reason);
  }

  async function pump() {
    if (busy) return;
    busy = true;
    info.running = true;
    try {
      await maybeUpdate();
      while (queue.length) {
        const job = queue.shift();
        info.current = job.videoId;
        info.percent = 0;
        try { await download(job); } catch (e) { onFail(job.requestId, e.message); }
      }
    } finally {
      busy = false;
      info.running = false;
      info.current = null;
    }
  }

  // Actualizacion semanal aunque no haya descargas (al arrancar y cada 6 h se revisa si ya toca)
  setTimeout(() => maybeUpdate(), 30_000).unref?.();
  // Al arrancar se comprueban las librerias y queda anotado en los eventos si algo falta
  checkDeps().then((d) => {
    log(d.ok ? `yt-dlp ${d.ytdlp.version} y ffmpeg listos` : `Faltan librerias: ${[d.ytdlp, d.ffmpeg, d.deno].filter((x) => !x.ok).map((x) => `${x.name} (${x.error})`).join('; ')}`, d.ok ? 'info' : 'error');
  }).catch(() => {});
  setInterval(() => maybeUpdate(), 6 * 3600 * 1000).unref?.();

  return {
    checkDeps,
    log,
    enqueue(job) {
      log(`Tarea recibida del servidor: ${job.videoId}`);
      if (queue.some((j) => j.requestId === job.requestId)) return;
      queue.push(job);
      pump();
    },
    state: () => ({ percent: info.percent, events: [...events].reverse(), available: hasBin, running: info.running, current: info.current, pending: queue.length, lastError: info.lastError }),
  };
}
