# Agente local de karaoke

Corre en el PC del bar. Indexa una carpeta (plana) de videos, envía los nombres al backend para que se busquen **antes** que en YouTube, y sirve los videos a la pantalla TV en `http://127.0.0.1:4545`.

```
cd agent
npm install
npm start          # abre http://localhost:4545 para configurarlo
```

1. En la web: Admin → **Biblioteca local** → *Generar token* (requiere la función `localLibrary` en el plan).
2. En `http://localhost:4545`: elegir la carpeta, pegar el token, indicar el servidor (`http://localhost:3000` en local) y *Guardar y conectar*.
3. La configuración queda en `%APPDATA%\karaoke-agent\config.json`.

Variables opcionales: `AGENT_PORT` (por defecto 4545; si lo cambias, define `VITE_AGENT_URL` en el frontend), `KARAOKE_API`.

Formatos: mp4, m4v, mov, webm, mkv (los que reproduce Chrome/Edge con H.264/VP9). El nombre del archivo (sin extensión) es el título y lo que se busca.

## Descarga automática de videos bloqueados (yt-dlp)

Si YouTube no deja reproducir un video incrustado (errores 101/150), el servidor le pide al agente bajarlo. El agente usa `yt-dlp` y `ffmpeg` (720p máx.), lo guarda en la carpeta del bar con el nombre `Título [idDeYouTube].mp4` y la canción pasa a sonar como «En el bar», conservando su mesa y su puesto en la cola. Requiere la función `localLibrary` del plan y el agente conectado.

- El instalador trae `yt-dlp.exe` y `ffmpeg.exe` y los copia a `%LOCALAPPDATA%\KaraokeAgentin`. `npm run build` los descarga una vez a `agent/vendor/` (usa `--no-ytdlp` para omitirlos).
- `yt-dlp` se actualiza solo (al arrancar y cada 7 días, y una vez más si una descarga falla por extracción).
- Las descargas en curso usan la subcarpeta oculta `.tmp` de la carpeta del bar (el agente la ignora).
- Para actualizar un PC que ya tiene el agente basta ejecutar el nuevo `KaraokeAgent-Setup.exe` encima: no hace falta desinstalar y se conservan carpeta y token.

## Instalador para el PC del cliente

```
cd agent
npm install
npm run build -- --server https://TU-BACKEND.up.railway.app
```

Genera `dist/KaraokeAgent-Setup.exe` (≈23 MB, no requiere Node en el PC del cliente). La URL del servidor queda como valor por defecto del agente; el cliente solo elige carpeta y pega el token.

El instalador (sin permisos de administrador):
- copia el agente a `%LOCALAPPDATA%\KaraokeAgent`,
- lo registra para arrancar con Windows (sin ventana),
- crea en el menú Inicio «Configurar agente de karaoke» y «Desinstalar agente de karaoke»,
- lo arranca y abre `http://localhost:4545` para configurarlo.

La configuración (carpeta, token) vive en `%APPDATA%\karaoke-agent\config.json` y se conserva al reinstalar o desinstalar. Reinstalar encima actualiza el agente.

Windows SmartScreen puede avisar de «editor desconocido» porque el `.exe` no está firmado: «Más información → Ejecutar de todas formas».
