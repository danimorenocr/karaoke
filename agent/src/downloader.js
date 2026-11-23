import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const exeDir = path.dirname(process.execPath);
/** Carpeta bin\ junto al agente instalado (yt-dlp.exe + ffmpeg.exe). En desarrollo se usa lo que haya en el PATH. */
const binDir = path.join(exeDir, 'bin');
const ytdlp = fs.existsSync(path.join(binDir, 'yt-dlp.exe')) ? path.join(binDir, 'yt-dlp.exe') : 'yt-dlp';
const hasBin = ytdlp !== 'yt-dlp';

const VIDEO_ID = /^[\w-]{11}$/;
const WEEK = 7 * 24 * 3600 * 1000;

function run(args, { timeout = 15 * 60_000 } = {}) {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let p;
    try {
      p = spawn(ytdlp, args, { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    } catch (e) { return resolve({ code: -1, out, err: e.message }); }
    const t = setTimeout(() => { try { p.kill(); } catch { /* ya termino */ } }, timeout);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => { clearTimeout(t); resolve({ code: -1, out, err: e.code === 'ENOENT' ? 'yt-dlp no esta instalado' : e.message }); });
    p.on('close', (code) => { clearTimeout(t); resolve({ code, out, err }); });
  });
}

/**
 * Baja videos de YouTube a la carpeta del bar con yt-dlp (de a uno).
 * onDone(requestId, filePath) / onFail(requestId, reason). Despues de bajarlos, el agente los indexa como cualquier otro video.
 */
export function createDownloader({ getFolder, onDone, onFail }) {
  const queue = [];
  let busy = false;
  let lastUpdate = 0;
  const info = { running: false, current: null, lastError: '' };

  async function maybeUpdate(force = false) {
    if (!hasBin || (!force && Date.now() - lastUpdate < WEEK)) return;
    lastUpdate = Date.now();
    const r = await run(['-U'], { timeout: 2 * 60_000 });
    if (r.code !== 0) console.warn('yt-dlp -U:', (r.err || r.out).trim().split('\n').pop());
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
      '--no-playlist', '--no-progress', '--windows-filenames', '--trim-filenames', '120', '--encoding', 'utf-8',
      '-f', 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/b[height<=720]/b',
      '--merge-output-format', 'mp4',
      // El id va en el nombre: sirve para no volver a bajar el mismo video
      '-o', `%(title)s [${videoId}].%(ext)s`,
      '-P', `home:${folder}`, '-P', `temp:${tmp}`,
      '--print', 'after_move:filepath',
      ...(hasBin ? ['--ffmpeg-location', binDir] : []),
      `https://www.youtube.com/watch?v=${videoId}`,
    ];
    let r = await run(args);
    // YouTube cambia a menudo: si fallo por extraccion, se actualiza yt-dlp y se reintenta una vez
    if (r.code !== 0 && hasBin && /unable to extract|sign in|HTTP Error 403|nsig|signature/i.test(r.err)) {
      await maybeUpdate(true);
      r = await run(args);
    }
    const file = r.out.trim().split(/\r?\n/).filter(Boolean).pop();
    if (r.code === 0 && file && fs.existsSync(file)) return onDone(requestId, file);
    const reason = (r.err.trim().split(/\r?\n/).filter(Boolean).pop() || `yt-dlp termino con codigo ${r.code}`).slice(0, 300);
    info.lastError = reason;
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
  setInterval(() => maybeUpdate(), 6 * 3600 * 1000).unref?.();

  return {
    enqueue(job) {
      if (queue.some((j) => j.requestId === job.requestId)) return;
      queue.push(job);
      pump();
    },
    state: () => ({ available: hasBin, running: info.running, current: info.current, pending: queue.length, lastError: info.lastError }),
  };
}
