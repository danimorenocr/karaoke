# Karaoke

Plataforma de karaoke multi-establecimiento: los clientes piden canciones desde su mesa (QR), el DJ gestiona la cola y la TV reproduce en tiempo real.

| Carpeta     | Qué es                                                                 | Stack                                   |
|-------------|------------------------------------------------------------------------|-----------------------------------------|
| `backend/`  | API REST + WebSockets, auth JWT, planes, estadísticas                  | NestJS 11, Prisma 6, PostgreSQL, Socket.io |
| `frontend/` | Web: landing, login, cliente (`/m/:token`), DJ, TV, admin, super admin | React 19, Vite, Tailwind 4              |
| `agent/`    | Agente local (PC del bar) que indexa videos y los sirve a la TV        | Node.js                                 |

## Requisitos

- Node.js 20+ y npm
- Docker (para PostgreSQL local) — o una base PostgreSQL propia (p. ej. la de Railway)

## Instalación

```bash
git clone https://github.com/danimorenocr/karaoke.git
cd karaoke

# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install

# Agente local (opcional)
cd ../agent
npm install
```

## Ejecución en local

### 1. Base de datos (desde la raíz)

```bash
docker compose up -d      # Postgres en localhost:5433 (user/pass/db: karaoke)
```

### 2. Backend (puerto 3000)

```bash
cd backend
npm run db:local:migrate  # aplica migraciones (usa backend/.env.local)
npm run dev:local         # compila y arranca con .env.local
```

Al arrancar, el backend **crea automáticamente el super admin** si no existe (ver credenciales abajo).

> Para usar tu propia base/entorno: copia `backend/.env.example` a `backend/.env`, completa `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET` y ejecuta `npm run prisma:deploy` y `npm run dev`.

### 3. Frontend (puerto 5173)

```bash
cd frontend
npm run dev:local         # usa frontend/.env.localdb -> VITE_API_URL=http://localhost:3000
```

Abre http://localhost:5173

### 4. Agente local (opcional)

```bash
cd agent
npm start                 # configuración en http://localhost:4545
```

Ver [`agent/README.md`](agent/README.md) para el token, la carpeta de videos y el instalador `.exe`.

### Pruebas de humo del backend

Con el backend corriendo:

```bash
cd backend
node scripts/smoke.mjs
```

## Variables de entorno principales (backend)

| Variable                | Descripción                                               |
|-------------------------|-----------------------------------------------------------|
| `DATABASE_URL`/`DIRECT_URL` | Conexión a PostgreSQL                                 |
| `JWT_SECRET`            | Secreto de firma de sesiones (obligatorio)                |
| `CORS_ORIGINS`          | Orígenes del frontend, separados por coma                 |
| `YOUTUBE_API_KEY`       | Opcional; sin ella solo funcionan links pegados de YouTube |
| `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` | Super admin sembrado al arrancar        |
| `SMTP_*`, `MAIL_FROM`   | Correo para el código de recuperación de contraseña       |

## Credenciales de acceso

> ⚠️ Son credenciales **solo para desarrollo local**. Cámbialas en producción.

### Super admin

Login en http://localhost:5173/login → redirige a `/super-admin`.

| Campo      | Valor                |
|------------|----------------------|
| Correo     | `admin@karaoke.local` |
| Contraseña | `cambiame123`        |

Se define con `SUPERADMIN_EMAIL` y `SUPERADMIN_PASSWORD` en `backend/.env.local`. Solo se crea si aún no existe un super admin en la BD; para cambiarlo después hay que hacerlo desde la BD o reiniciarla (`npm run db:local:reset`).

### Establecimiento (administrador de un bar)

No hay un establecimiento precargado. Hay dos formas de obtener uno:

**A. Lo crea el super admin (recomendado para probar)**
1. Entra como super admin → crear establecimiento.
2. Indica nombre del bar, y nombre/correo/contraseña del administrador (mín. 8 caracteres). Ejemplo: `admin@bar.local` / `password123`.
3. Inicia sesión en `/login` con esas credenciales → `/admin`.

**B. Autoregistro**
1. Registrarse desde la landing/`/login`. El establecimiento queda **pendiente de pago/activación**.
2. El super admin lo activa y asigna el plan.
3. Ya puede iniciar sesión con el correo y contraseña que registró.

Desde `/admin` el dueño crea mesas (QR por mesa) y usuarios DJ; el DJ usa `/dj` y la pantalla `/tv`.

## Rutas del frontend

| Ruta           | Rol           | Descripción                    |
|----------------|---------------|--------------------------------|
| `/`            | público       | Landing                        |
| `/login`       | público       | Inicio de sesión               |
| `/m/:token`    | cliente (QR)  | Pedir canciones desde la mesa  |
| `/dj`          | DJ, Admin     | Cola de canciones              |
| `/tv`          | DJ, Admin     | Pantalla de reproducción       |
| `/admin`       | Admin         | Mesas, DJs, plan, estadísticas |
| `/super-admin` | Super admin   | Establecimientos, planes, métricas |

## Grafo de conocimiento (graphify)

El proyecto incluye un grafo de su código en `graphify-out/`:

- `graphify-out/graph.html` — grafo interactivo (abrir en el navegador)
- `graphify-out/GRAPH_REPORT.md` — reporte: nodos clave, comunidades, conexiones
- `graphify-out/graph.json` — datos del grafo

Para regenerarlo o consultarlo:

```bash
pip install graphifyy
graphify update .
graphify query "¿cómo se crea un pedido de canción?"
```

## Despliegue

- **Backend: Render** (Web Service, root directory `backend`)
  - Build command: `npm install && npm run build`
  - Start command: `npm run start:prod` (aplica migraciones y arranca)
  - Health check: `/health`
  - Variables: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `CORS_ORIGINS` (URL del frontend), `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`, `YOUTUBE_API_KEY`, `SMTP_*`, `MAIL_FROM`
- **Base de datos: Railway** (PostgreSQL). Usa la URL de conexión de Railway en `DATABASE_URL` y `DIRECT_URL`.
- **Frontend: Cloudflare** (`frontend/wrangler.jsonc`). Define `VITE_API_URL` con la URL pública del backend en Render.

> `backend/railway.json` es un resto de cuando el backend estaba en Railway; Render no lo usa.
