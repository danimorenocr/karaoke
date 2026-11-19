# Desinstala el agente de karaoke. La configuracion (carpeta, token) se conserva en %APPDATA%\karaoke-agent
# salvo que se pase -Purge. Variables opcionales (pruebas): KARAOKE_INSTALL_DIR, KARAOKE_STARTUP_DIR, KARAOKE_MENU_DIR
param([switch]$Purge)
$dir = if ($env:KARAOKE_INSTALL_DIR) { $env:KARAOKE_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'KaraokeAgent' }
$startup = if ($env:KARAOKE_STARTUP_DIR) { $env:KARAOKE_STARTUP_DIR } else { [Environment]::GetFolderPath('Startup') }
$menu = if ($env:KARAOKE_MENU_DIR) { $env:KARAOKE_MENU_DIR } else { Join-Path ([Environment]::GetFolderPath('Programs')) 'Agente de karaoke' }

Get-Process -Name 'karaoke-agent' -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item (Join-Path $startup 'KaraokeAgent.vbs') -Force -ErrorAction SilentlyContinue
Remove-Item $menu -Recurse -Force -ErrorAction SilentlyContinue
if ($Purge) { Remove-Item (Join-Path $env:APPDATA 'karaoke-agent') -Recurse -Force -ErrorAction SilentlyContinue }

# Esta propia carpeta se borra un instante despues (el script esta dentro de ella)
Start-Process cmd -WindowStyle Hidden -ArgumentList "/c ping -n 3 127.0.0.1 >nul & rmdir /s /q `"$dir`""

if ($env:KARAOKE_INSTALL_DIR) { Write-Host 'Desinstalado'; exit 0 }
Add-Type -AssemblyName System.Windows.Forms
[void][System.Windows.Forms.MessageBox]::Show('Agente de karaoke desinstalado. Tu configuracion (carpeta y token) se conserva por si lo vuelves a instalar.', 'Agente de karaoke', 'OK', 'Information')
