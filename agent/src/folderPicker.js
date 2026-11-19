import { execFile } from 'node:child_process';

/** Abre el selector de carpetas de Windows y devuelve la ruta elegida ('' si cancelo). */
export function pickFolder() {
  const script =
    "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::EnableVisualStyles();" +
    "$f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Carpeta con los videos de karaoke'; $f.ShowNewFolderButton = $false;" +
    "$top = New-Object System.Windows.Forms.Form; $top.TopMost = $true; $top.ShowInTaskbar = $false;" +
    "if ($f.ShowDialog($top) -eq 'OK') { [Console]::OutputEncoding = [Text.Encoding]::UTF8; Write-Output $f.SelectedPath }";
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') return reject(new Error('El selector de carpetas solo existe en Windows: escribe la ruta a mano'));
    execFile('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { encoding: 'utf8' }, (err, out) =>
      err ? reject(err) : resolve(out.trim()),
    );
  });
}
