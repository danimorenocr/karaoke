import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'karaoke-agent');
const file = path.join(dir, 'config.json');

const defaults = {
  // __DEFAULT_SERVER__ lo fija el build del instalador (node scripts/build.mjs --server https://...)
  server: process.env.KARAOKE_API || (typeof __DEFAULT_SERVER__ !== 'undefined' ? __DEFAULT_SERVER__ : 'http://localhost:3000'),
  token: '', // token del agente (Admin > Biblioteca local)
  folder: '',
  port: Number(process.env.AGENT_PORT) || 4545,
};

export function loadConfig() {
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return { ...defaults };
  }
}

export function saveConfig(cfg) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
}

export const configPath = file;
