# SocialPulse — Social Analytics Dashboard

Plataforma privada de analítica de contenido multiplataforma diseñada para centralizar, consultar, analizar y comparar el rendimiento de videos publicados en **YouTube**, **TikTok**, **Instagram** y **Facebook** mediante sus APIs oficiales.

---

## 1. Características Principales

- **Seguridad desde el Diseño (Security by Design)**:
  - Autenticación privada con **Supabase Auth** (registro público estrictamente deshabilitado en `supabase/config.toml` y bloqueado en `middleware.ts`).
  - **Row Level Security (RLS)** con `FORCE ROW LEVEL SECURITY` y políticas optimizadas `(select auth.uid()) = user_id` en todas las tablas.
  - Credenciales OAuth (`access_token` y `refresh_token`) cifradas en reposo con **AES-256-GCM** (`src/lib/security/crypto.ts`) en una tabla aislada (`public.oauth_credentials`) con permisos revocados para los roles `anon` y `authenticated`.
  - Protección CSRF mediante validación criptográfica HMAC-SHA256 + PKCE (`S256`) en flujos OAuth y verificación de cabeceras `Origin`/`Host` en endpoints mutables.
  - Rate limiting por ventana deslizante (`src/lib/security/rate-limit.ts`) y sanitización automática de secretos en logs (`src/lib/utils/logger.ts`).
- **Identidad Visual Estricta 60/30/10**:
  - **60% Midnight Navy (`#0B1220`)**: Superficie principal y lienzo del dashboard.
  - **30% Slate Blue (`#1B2940`)**: Tarjetas, paneles, sidebar, header y contenedores elevados.
  - **10% Electric Teal (`#22D3C5`)**: Acciones primarias, indicadores activos, métricas clave y acentos de visualización.
- **Integraciones Oficiales Desacopladas (`src/services/`)**:
  - `YouTubeService`: Google OAuth 2.0 + YouTube Data API v3 + YouTube Analytics API v2.
  - `TikTokService`: TikTok Login Kit v2 (con PKCE) + TikTok Display API v2.
  - `InstagramService`: Meta OAuth + Instagram Graph API v21.0 (cuentas Profesionales Creator/Business).
  - `FacebookService`: Facebook Login + Meta Graph API v21.0 (Páginas autorizadas y `video_insights`).
- **Motor de Sincronización Idempotente (`src/features/synchronization/`)**:
  - Sincronización manual bajo demanda y sincronización programada compatible con **Vercel Cron** (`/api/sync/cron`).
  - Detección y renovación automática de tokens expirados, recuperación ante interrupciones serverless (>10 min), control de frecuencia por plataforma y reintentos con backoff exponencial.
  - Snapshots históricos inmutables en `public.video_metrics` para analizar la evolución temporal de cada publicación sin sobrescribir el historial.

---

## 2. Estructura del Proyecto

```text
src/
  app/
    (auth)/
      login/                  # Inicio de sesión privado
      forgot-password/        # Solicitud de recuperación de contraseña
      reset-password/         # Restablecimiento con validación estricta
    (dashboard)/
      dashboard/              # 7.1 Resumen ejecutivo multiplataforma
      platforms/[platform]/   # 7.2 Rendimiento individual (YouTube, TikTok, Instagram, Facebook)
      videos/                 # 7.3 Biblioteca centralizada con filtros y paginación
      videos/[id]/            # 7.5 Análisis individual y snapshots históricos del video
      compare/                # 7.4 Comparación multiplataforma y notas metodológicas
      connections/            # 7.6 Administración de conexiones OAuth 2.0
    auth/
      confirm/route.ts        # Verificación OTP server-side
      signout/route.ts        # Cierre de sesión seguro
    api/
      oauth/[platform]/
        connect/route.ts      # Inicio OAuth con estado firmado HMAC + PKCE
        callback/route.ts     # Canje de código, cifrado AES-256-GCM y sync inicial
      sync/
        manual/route.ts       # Sincronización manual protegida con sesión + CSRF + Rate Limit
        cron/route.ts         # Sincronización programada protegida con CRON_SECRET
  components/
    ui/                       # Componentes base (Button, Card, Badge, Input, Skeleton, Alert)
    dashboard/                # Sidebar, Header, MetricCard, FilterBar, SyncButton
    charts/                   # Gráficas Recharts (ViewsEvolution, PlatformDistribution, VideoHistory)
    platforms/                # PlatformBadge, ConnectionStatusBadge, ConnectionCard
    videos/                   # VideosTable paginada
  features/
    auth/                     # Gestión de sesión server-side y Server Actions de autenticación
    analytics/                # Motor de agregación, comparativas de períodos equivalentes y series
    connections/              # Persistencia cifrada OAuth y revocación remota/local
    synchronization/          # Orquestador idempotente de sincronización y snapshots
    videos/                   # Repositorio de consultas paginadas e historial por video
  services/
    youtube/                  # YouTubeService (Data API v3 & Analytics API v2)
    tiktok/                   # TikTokService (Login Kit v2 & Display API v2)
    instagram/                # InstagramService (Instagram Graph API v21.0)
    facebook/                 # FacebookService (Meta Graph API v21.0)
    http-client.ts            # Cliente HTTP con backoff exponencial y detección de 401/429
    registry.ts               # Registro centralizado de servicios
  lib/
    supabase/                 # Clientes Browser, Server SSR, Admin (Service Role) y Middleware
    security/                 # AES-256-GCM crypto, OAuth state HMAC+PKCE, CSRF y Rate Limiter
    validation/               # Esquemas Zod estrictos
    utils/                    # Formateadores, manejo centralizado de errores y logger sanitizado
  types/                      # Tipos de dominio y contrato tipado de base de datos PostgreSQL
  tests/                      # Suite de pruebas automatizadas con Vitest y Testing Library
e2e/                          # Pruebas End-to-End con Playwright
supabase/
  config.toml                 # Configuración local de Supabase CLI (enable_signup = false)
  migrations/                 # Migración SQL versionada con esquema, índices y políticas RLS
  seed.sql                    # Guía de aprovisionamiento del usuario propietario
docs/
  ARCHITECTURE.md             # Documentación de arquitectura y diagrama ER de base de datos
  INTEGRATIONS_AND_OAUTH.md   # Configuración OAuth, límites de APIs y proceso de App Review
  DEPLOYMENT_SUPABASE_VERCEL.md # Guía paso a paso de configuración de Supabase y Vercel
  SECURITY_AND_TESTING.md     # Guía de seguridad, políticas RLS y ejecución de pruebas
```

---

## 3. Guía Rápida de Instalación y Configuración Local

### Requisitos Previos

- **Node.js** `>= 20.x` y **npm** `>= 10.x`.
- Proyecto en **Supabase** (Plan Free compatible).

### Paso 1: Instalar dependencias

```bash
npm install
```

### Paso 2: Configurar variables de entorno

Copia el archivo `.env.example` a `.env.local`:

```bash
cp .env.example .env.local
```

Genera las tres claves criptográficas de servidor con OpenSSL y agrégalas a `.env.local`:

```bash
openssl rand -hex 32 # Para OAUTH_ENCRYPTION_KEY
openssl rand -hex 32 # Para CRON_SECRET
openssl rand -hex 32 # Para OAUTH_STATE_SECRET
```

Completa en `.env.local` las credenciales de tu proyecto Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) y las credenciales OAuth de las plataformas que vayas a conectar.

### Paso 3: Aplicar la migración en Supabase y crear el usuario propietario

1. Ejecuta el contenido de [`supabase/migrations/20261118000001_initial_schema.sql`](supabase/migrations/20261118000001_initial_schema.sql) en el **SQL Editor** de tu proyecto Supabase (o mediante `supabase db push`).
2. En el panel de Supabase, ve a **Authentication > Providers > Email** y desactiva **Enable Sign Ups** para garantizar que ningún tercero pueda registrarse.
3. Ve a **Authentication > Users > Add User > Create New User** para crear tu cuenta de propietario. El trigger automático `on_auth_user_created` creará tu perfil con rol `owner` en `public.profiles`.

### Paso 4: Iniciar el servidor de desarrollo

```bash
npm run dev
```

Abre `http://localhost:3000` e inicia sesión con tu cuenta de propietario.

---

## 4. Verificación y Calidad

Ejecuta los comandos de validación antes de desplegar:

```bash
npm run lint        # Verificación ESLint sin advertencias
npm run typecheck   # Verificación TypeScript en modo estricto (tsc --noEmit)
npm run test        # Suite de pruebas unitarias, RLS, servicios y componentes (Vitest)
npm run build       # Compilación de producción de Next.js
```

---

## 5. Límites de Planes Gratuitos y Condiciones de Uso

| Servicio / API | Plan Gratuito | Límites Técnicos y Cuotas | Condiciones Comerciales / Producción |
| :--- | :--- | :--- | :--- |
| **Vercel Hobby** | Gratuito | 100 GB bandwidth/mes; funciones serverless 10s–60s timeout; **1 ejecución diaria de Cron Job** (`0 6 * * *`). | Uso personal y proyectos no comerciales del titular. Para uso comercial multi-usuario se requiere Vercel Pro. |
| **Supabase Free** | Gratuito | 500 MB almacenamiento PostgreSQL; 50,000 MAU en Auth; 5 GB egress. Proyectos inactivos por 7 días se pausan automáticamente. | Uso comercial permitido dentro de las cuotas del plan Free. |
| **YouTube Data API v3 & Analytics API** | Gratuito | **10,000 unidades de cuota/día** (`channels.list` = 1u, `playlistItems.list` = 1u, `videos.list` = 1u). | En modo *Testing* admite hasta 100 usuarios de prueba sin verificación. |
| **TikTok Display API v2** | Gratuito | Límite de 600 solicitudes/minuto; máximo 20 videos por página en `/v2/video/list/`. | En *Sandbox* funciona con cuentas agregadas como *Target Users*; en *Producción* requiere aprobación de `user.info.stats` y `video.list`. |
| **Instagram Graph API v21.0** | Gratuito | Rate limit de `200 * Número de Usuarios/hora` (Platform Rate Limit de Meta). | Requiere cuenta Profesional (Creator/Business) vinculada a una Página de Facebook. |
| **Facebook Graph API v21.0** | Gratuito | Rate limit de `200 llamadas/hora` por usuario/página en nivel de acceso estándar. | En modo *Desarrollo* funciona para administradores/desarrolladores de la App en Meta; modo *Live* requiere App Review de `read_insights`. |

---

## 6. Documentación Detallada

- [Arquitectura y Diagrama de Base de Datos](docs/ARCHITECTURE.md)
- [Integraciones Oficiales y Configuración OAuth](docs/INTEGRATIONS_AND_OAUTH.md)
- [Guía de Configuración de Supabase y Despliegue en Vercel](docs/DEPLOYMENT_SUPABASE_VERCEL.md)
- [Guía de Seguridad y Pruebas Automatizadas](docs/SECURITY_AND_TESTING.md)
