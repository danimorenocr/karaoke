import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Formatos que Chrome/Edge reproducen (con codec H.264/VP9 + AAC/Opus). .avi/.wmv/.flv no se reproducen en el navegador.
export const MIME = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska' };

/** Id estable a partir del nombre del archivo: 'L' + 10 caracteres (cabe en el videoId de 11 del backend). */
export const idFor = (file) => 'L' + createHash('sha1').update(file.toLowerCase()).digest('base64url').slice(0, 10);

const AUDIO = new Set(['.mp3', '.m4a', '.wav', '.flac', '.ogg', '.aac', '.wma']);
const IGNORE = new Set(['desktop.ini', 'thumbs.db', '.ds_store']);

/** Escanea la carpeta (plana) y devuelve { songs: [{id,name}], files: Map(id -> ruta), skipped: [{name, reason}] }. */
export function scan(folder) {
  const songs = [];
  const files = new Map();
  const skipped = [];
  if (!folder) return { songs, files, skipped };
  for (const f of fs.readdirSync(folder, { withFileTypes: true })) {
    if (IGNORE.has(f.name.toLowerCase())) continue;
    if (!f.isFile()) { skipped.push({ name: f.name, reason: 'es una subcarpeta (solo se lee la carpeta elegida)' }); continue; }
    const ext = path.extname(f.name).toLowerCase();
    if (!MIME[ext]) {
      skipped.push({ name: f.name, reason: AUDIO.has(ext) ? 'es solo audio (se aceptan videos: mp4, m4v, mov, webm, mkv)' : `formato ${ext || 'desconocido'} no compatible` });
      continue;
    }
    const id = idFor(f.name);
    if (files.has(id)) { skipped.push({ name: f.name, reason: 'nombre repetido' }); continue; }
    files.set(id, path.join(folder, f.name));
    songs.push({ id, name: path.basename(f.name, path.extname(f.name)).trim() });
  }
  return { songs, files, skipped };
}
