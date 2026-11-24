# Instalador del agente de karaoke (sin permisos de administrador: instala solo para el usuario actual).
# Variables opcionales (para pruebas): KARAOKE_INSTALL_DIR, KARAOKE_STARTUP_DIR, KARAOKE_MENU_DIR, KARAOKE_NO_LAUNCH=1
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 4545
$dir = if ($env:KARAOKE_INSTALL_DIR) { $env:KARAOKE_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'KaraokeAgent' }
$startup = if ($env:KARAOKE_STARTUP_DIR) { $env:KARAOKE_STARTUP_DIR } else { [Environment]::GetFolderPath('Startup') }
$menu = if ($env:KARAOKE_MENU_DIR) { $env:KARAOKE_MENU_DIR } else { Join-Path ([Environment]::GetFolderPath('Programs')) 'Agente de karaoke' }
$noLaunch = $env:KARAOKE_NO_LAUNCH -eq '1'

function Say($text, $icon = 'Information') {
  if ($noLaunch) { Write-Host $text; return }
  Add-Type -AssemblyName System.Windows.Forms
  [void][System.Windows.Forms.MessageBox]::Show($text, 'Agente de karaoke', 'OK', $icon)
}

try {
  # Si ya habia una version corriendo, se cierra para poder reemplazarla
  Get-Process -Name 'karaoke-agent', 'yt-dlp' -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Milliseconds 700

  New-Item -ItemType Directory -Force -Path $dir, $startup, $menu | Out-Null
  Copy-Item (Join-Path $here 'karaoke-agent.exe') (Join-Path $dir 'karaoke-agent.exe') -Force
  Copy-Item (Join-Path $here 'uninstall.ps1') (Join-Path $dir 'uninstall.ps1') -Force

  # yt-dlp + ffmpeg (bajan los videos que YouTube no deja incrustar). yt-dlp se actualiza solo: no se pisa uno mas nuevo.
  $bin = Join-Path $dir 'bin'
  New-Item -ItemType Directory -Force -Path $bin | Out-Null
  foreach ($f in 'yt-dlp.exe', 'ffmpeg.exe', 'deno.exe') {
    $src = Join-Path $here $f
    $dst = Join-Path $bin $f
    if (-not (Test-Path $src)) { continue }
    $copy = -not (Test-Path $dst)
    if (-not $copy -and $f -eq 'yt-dlp.exe') { $copy = (Get-Item $src).LastWriteTime -gt (Get-Item $dst).LastWriteTime }
    if ($copy) { Copy-Item $src $dst -Force }
  }

  # Lanzador sin ventana: arranca el agente en segundo plano
  $exe = Join-Path $dir 'karaoke-agent.exe'
  $vbs = "Set s = CreateObject(""WScript.Shell"")`r`ns.Run """"""$exe"""""", 0, False`r`n"
  Set-Content -Path (Join-Path $dir 'launch.vbs') -Value $vbs -Encoding ASCII
  Copy-Item (Join-Path $dir 'launch.vbs') (Join-Path $startup 'KaraokeAgent.vbs') -Force   # arranca con Windows

  # Accesos del menu Inicio
  Set-Content -Path (Join-Path $menu 'Configurar agente de karaoke.url') -Value "[InternetShortcut]`r`nURL=http://localhost:$port/`r`n" -Encoding ASCII
  $ws = New-Object -ComObject WScript.Shell
  $lnk = $ws.CreateShortcut((Join-Path $menu 'Desinstalar agente de karaoke.lnk'))
  $lnk.TargetPath = 'powershell.exe'
  $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $dir 'uninstall.ps1')`""
  $lnk.Save()

  if ($noLaunch) { Write-Host "Instalado en $dir"; exit 0 }

  # Arranca ahora y abre la pantalla de configuracion
  Start-Process 'wscript.exe' -ArgumentList "`"$(Join-Path $dir 'launch.vbs')`""
  $up = $false
  for ($i = 0; $i -lt 20 -and -not $up; $i++) {
    Start-Sleep -Milliseconds 500
    try { $up = (Invoke-RestMethod "http://127.0.0.1:$port/ping" -TimeoutSec 1).ok } catch { }
  }
  if ($up) {
    Start-Process "http://localhost:$port/"
    Say "Agente instalado.`n`nSe abrio la pagina de configuracion en tu navegador: elige la carpeta de videos y pega el token (Admin > Biblioteca local).`n`nDesde ahora arranca solo con Windows."
  } else {
    Say "El agente se instalo pero no respondio en el puerto $port. Cierra otros programas que lo usen y abre 'Configurar agente de karaoke' desde el menu Inicio." 'Warning'
  }
} catch {
  Say "No se pudo instalar: $($_.Exception.Message)" 'Error'
  exit 1
}
