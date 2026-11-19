// Construye dist/KaraokeAgent-Setup.exe:  node scripts/build.mjs --server https://tu-backend.up.railway.app
//   1) esbuild junta el agente y sus librerias en un solo archivo
//   2) Node SEA lo mete dentro de una copia de node.exe  -> karaoke-agent.exe (no requiere instalar Node)
//   3) IExpress (viene con Windows) empaqueta el exe y los scripts en un instalador
import { build } from 'esbuild';
import { inject } from 'postject';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const stage = path.join(dist, 'stage');

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : undefined; };
const server = (arg('server') || process.env.AGENT_SERVER || 'http://localhost:3000').replace(/\/+$/, '');
if (!/^https?:\/\//.test(server)) throw new Error(`--server debe empezar por http:// o https:// (recibido: ${server})`);
if (process.platform !== 'win32') throw new Error('El instalador solo se construye en Windows');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
console.log(`Servidor por defecto: ${server}`);

// 1) bundle
const bundle = path.join(dist, 'agent.cjs');
await build({
  entryPoints: [path.join(root, 'src/index.js')],
  bundle: true, platform: 'node', format: 'cjs', target: 'node22', outfile: bundle,
  define: { __DEFAULT_SERVER__: JSON.stringify(server) },
  external: ['bufferutil', 'utf-8-validate'], // opcionales de ws
  logLevel: 'warning',
});

// 2) SEA
const blob = path.join(dist, 'sea-prep.blob');
const seaCfg = path.join(dist, 'sea-config.json');
fs.writeFileSync(seaCfg, JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true }));
execFileSync(process.execPath, ['--experimental-sea-config', seaCfg], { stdio: 'inherit' });
const exe = path.join(stage, 'karaoke-agent.exe');
fs.copyFileSync(process.execPath, exe);
await inject(exe, 'NODE_SEA_BLOB', fs.readFileSync(blob), { sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2' });
for (const f of ['install.ps1', 'uninstall.ps1']) fs.copyFileSync(path.join(root, 'installer', f), path.join(stage, f));
console.log(`karaoke-agent.exe listo (${(fs.statSync(exe).size / 1048576).toFixed(0)} MB)`);

// 3) IExpress
const target = path.join(dist, 'KaraokeAgent-Setup.exe');
const files = ['karaoke-agent.exe', 'install.ps1', 'uninstall.ps1'];
const sed = `[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=%InstallPrompt%
DisplayLicense=%DisplayLicense%
FinishMessage=%FinishMessage%
TargetName=%TargetName%
FriendlyName=%FriendlyName%
AppLaunched=%AppLaunched%
PostInstallCmd=%PostInstallCmd%
AdminQuietInstCmd=%AdminQuietInstCmd%
UserQuietInstCmd=%UserQuietInstCmd%
SourceFiles=SourceFiles
[Strings]
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=${target}
FriendlyName=Agente de karaoke
AppLaunched=cmd /c powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File install.ps1
PostInstallCmd=<None>
AdminQuietInstCmd=cmd /c powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File install.ps1
UserQuietInstCmd=cmd /c powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File install.ps1
${files.map((f, i) => `FILE${i}="${f}"`).join('\n')}
[SourceFiles]
SourceFiles0=${stage}\\
[SourceFiles0]
${files.map((_, i) => `%FILE${i}%=`).join('\n')}
`;
const sedPath = path.join(dist, 'setup.sed');
fs.writeFileSync(sedPath, sed.replace(/\n/g, '\r\n'), 'latin1');
spawnSync(path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'iexpress.exe'), ['/N', '/Q', sedPath], { stdio: 'inherit' });
// iexpress puede devolver el control antes de terminar: se espera a que el archivo exista y deje de crecer
let last = -1;
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const size = fs.existsSync(target) ? fs.statSync(target).size : 0;
  if (size > 0 && size === last) break;
  last = size;
}
if (!fs.existsSync(target)) throw new Error('IExpress no genero el instalador');
console.log(`\nInstalador: ${target} (${(fs.statSync(target).size / 1048576).toFixed(0)} MB)`);
