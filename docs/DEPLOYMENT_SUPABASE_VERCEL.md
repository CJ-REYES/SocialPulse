# Guía de Configuración de Supabase y Despliegue en Vercel

## 1. Configuración de Supabase (Base de Datos, Auth y RLS)

### 1.1. Creación o Activación del Proyecto
1. Inicia sesión en [Supabase Dashboard](https://supabase.com/dashboard).
2. Crea un nuevo proyecto (o restaura tu proyecto existente si se encuentra en estado `INACTIVE`).
3. En **Project Settings > API Keys**, copia:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `Publishable key` (o `anon` key) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `Secret key` (o `service_role` key) → `SUPABASE_SERVICE_ROLE_KEY` (**Estrictamente privada en el servidor**).

### 1.2. Ejecución de Migraciones y Políticas RLS
1. Abre el **SQL Editor** en Supabase Dashboard.
2. Copia y ejecuta íntegramente el script [`supabase/migrations/20261118000001_initial_schema.sql`](../supabase/migrations/20261118000001_initial_schema.sql).
3. Este script crea:
   - El esquema privado `private` y los triggers `set_updated_at` y `on_auth_user_created`.
   - Las 8 tablas normalizadas (`profiles`, `social_accounts`, `oauth_credentials`, `platform_permissions`, `videos`, `video_metrics`, `sync_jobs`, `sync_logs`).
   - Todos los índices B-Tree sobre claves foráneas y columnas de filtrado/ordenamiento.
   - La revocación estricta de permisos sobre `public.oauth_credentials` para los roles `anon` y `authenticated`.
   - Las políticas RLS con `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY`.

### 1.3. Configuración de Autenticación Privada
1. Ve a **Authentication > Providers > Email** y **deshabilita** la opción **Allow new users to sign up**.
2. Ve a **Authentication > URL Configuration**:
   - **Site URL**: `https://tu-dominio.vercel.app` (o `http://localhost:3000` en local).
   - **Redirect URLs**:
     - `http://localhost:3000/auth/confirm`
     - `http://localhost:3000/reset-password`
     - `https://tu-dominio.vercel.app/auth/confirm`
     - `https://tu-dominio.vercel.app/reset-password`
3. Ve a **Authentication > Users > Add User** y crea el usuario propietario inicial.

---

## 2. Despliegue en Vercel (Plan Hobby Gratuito)

### 2.1. Importación del Repositorio
1. Sube el repositorio a **GitHub** (verificando que `.env.local` esté excluido por `.gitignore`).
2. En [Vercel Dashboard](https://vercel.com/new), importa el repositorio de GitHub.
3. Framework Preset: **Next.js**.

### 2.2. Variables de Entorno en Vercel
Configura en **Settings > Environment Variables** de Vercel todas las variables definidas en [`.env.example`](../.env.example):
- `NEXT_PUBLIC_APP_URL` = `https://tu-dominio.vercel.app`
- `OAUTH_ENCRYPTION_KEY` = (64 caracteres hexadecimales generados con `openssl rand -hex 32`)
- `CRON_SECRET` = (secreto aleatorio generado con `openssl rand -hex 32`)
- `OAUTH_STATE_SECRET` = (secreto aleatorio generado con `openssl rand -hex 32`)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- Variables OAuth de `YOUTUBE_*`, `TIKTOK_*`, `INSTAGRAM_*` y `FACEBOOK_*`.

### 2.3. Sincronización Programada con Vercel Cron
- El archivo [`vercel.json`](../vercel.json) configura automáticamente un Cron Job diario a las `06:00 UTC` (`0 6 * * *`) compatible con los límites del plan **Vercel Hobby (gratuito)**:
  ```json
  {
    "crons": [
      {
        "path": "/api/sync/cron",
        "schedule": "0 6 * * *"
      }
    ]
  }
  ```
- Vercel envía automáticamente la cabecera `Authorization: Bearer <CRON_SECRET>` al invocar `/api/sync/cron`, la cual es verificada en tiempo constante (`timingSafeEqual`) por `verifyCronSecretHeader`.
