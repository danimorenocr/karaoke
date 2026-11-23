import fs from 'node:fs';
import { io } from 'socket.io-client';
import { createDownloader } from './downloader.js';
import { idFor, scan } from './library.js';
import path from 'node:path';

/** Mantiene la biblioteca indexada y conectada al backend; reconecta sola. */
export function createAgent(getConfig) {
  const st = { files: new Map(), count: 0, songs: [], skipped: [], connected: false, error: '', lastSync: null };
  let socket = null;
  let watcher = null;
  let timer = null;

  // Videos que YouTube no deja incrustar: el servidor pide bajarlos y quedan en la carpeta como cualquier otro video
  const downloader = createDownloader({
    getFolder: () => getConfig().folder,
    onDone: (requestId, file) => {
      sync(); // el indice (con el video nuevo) sale antes que el aviso
      socket?.emit('agent.download.done', { requestId, id: idFor(path.basename(file)) });
    },
    onFail: (requestId, reason) => { socket?.emit('agent.download.failed', { requestId, reason }); },
  });

  function sync() {
    const cfg = getConfig();
    try {
      if (cfg.folder && !fs.statSync(cfg.folder).isDirectory()) throw new Error('no es una carpeta');
      const { songs, files, skipped } = scan(cfg.folder);
      st.files = files;
      st.count = songs.length;
      st.songs = songs.map((s) => s.name).sort((a, b) => a.localeCompare(b));
      st.skipped = skipped;
      if (!st.error.startsWith('Servidor')) st.error = '';
      if (socket?.connected) {
        socket.emit('agent.index', { songs }, (r) => {
          if (r?.ok) st.lastSync = new Date().toISOString();
          else { clearTimeout(timer); timer = setTimeout(sync, 3000); } // el servidor aun no nos reconocia: reintenta
        });
      }
    } catch (e) {
      st.files = new Map();
      st.count = 0;
      st.songs = [];
      st.skipped = [];
      st.error = cfg.folder ? `No se puede leer la carpeta: ${e.message}` : '';
    }
  }

  function watch() {
    watcher?.close();
    watcher = null;
    const { folder } = getConfig();
    if (!folder) return;
    try {
      // Agregar / quitar / renombrar videos: se reenvia el indice 1.5 s despues del ultimo cambio
      watcher = fs.watch(folder, () => { clearTimeout(timer); timer = setTimeout(sync, 1500); });
      watcher.on('error', () => {});
    } catch { /* carpeta inaccesible: el error lo muestra sync() */ }
  }

  function connect() {
    socket?.removeAllListeners();
    socket?.disconnect();
    socket = null;
    st.connected = false;
    const cfg = getConfig();
    if (!cfg.token || !cfg.server) return;
    socket = io(cfg.server, { auth: { agentToken: cfg.token }, transports: ['websocket'], reconnectionDelayMax: 10_000 });
    socket.on('connect', () => { st.connected = true; if (st.error.startsWith('Servidor')) st.error = ''; sync(); });
    socket.on('disconnect', () => { st.connected = false; });
    socket.on('agent.download', (job) => { if (job && typeof job.requestId === 'string' && typeof job.videoId === 'string') downloader.enqueue({ requestId: job.requestId, videoId: job.videoId }); });
    socket.on('connect_error', (e) => { st.connected = false; st.error = `Servidor: ${e.message}`; });
  }

  return {
    state: () => ({ downloads: downloader.state(), count: st.count, songs: st.songs, skipped: st.skipped, connected: st.connected, error: st.error, lastSync: st.lastSync }),
    file: (id) => st.files.get(id),
    /** Se llama al cambiar la configuracion (carpeta, servidor o token). */
    apply() { connect(); watch(); sync(); },
  };
}
