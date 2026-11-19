# Guía de Seguridad y Pruebas Automatizadas

## 1. Controles de Seguridad Implementados

### 1.1. Autenticación y Protección de Rutas
- **Deshabilitación de Registro Público**: Cualquier intento de navegar a `/signup`, `/register` o `/sign-up` es interceptado por `src/lib/supabase/middleware.ts` y redirigido a `/login?error=registration_disabled`. En Supabase Auth, `enable_signup = false` impide el alta pública a nivel de API.
- **Protección de Rutas Privadas**: Todas las rutas del dashboard y endpoints `/api/*` verifican la identidad del usuario en el servidor mediante `supabase.auth.getUser()`.
- **Cookies Seguras**: Las cookies de sesión y los nonces efímeros de OAuth utilizan `httpOnly: true`, `sameSite: 'lax'` y `secure: true` en producción.

### 1.2. Cifrado de Credenciales OAuth en Reposo
- **Algoritmo**: `AES-256-GCM` (`src/lib/security/crypto.ts`).
- **Formato del Payload**: `v1:<iv_base64url>:<authTag_base64url>:<ciphertext_base64url>`.
- **Aislamiento en Base de Datos**: La tabla `public.oauth_credentials` no tiene permisos `GRANT` ni políticas RLS para `anon` ni `authenticated`. Solo el proceso de servidor puede leer o actualizar tokens cifrados.

### 1.3. Protección contra CSRF, XSS y Abuso (Rate Limiting)
- **Headers HTTP de Seguridad (`next.config.ts`)**:
  - `Content-Security-Policy` restrictiva con orígenes explícitos para miniaturas oficiales (`i.ytimg.com`, `*.tiktokcdn.com`, `*.cdninstagram.com`, `*.fbcdn.net`) y conexión a `*.supabase.co`.
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
- **CSRF en OAuth y Endpoints Mutables**:
  - Los flujos OAuth firman el parámetro `state` con `HMAC-SHA256` vinculando `userId`, `platform`, `issuedAt` (TTL 10 minutos) y un `nonce` contrastado contra cookie `httpOnly`, además de `PKCE (S256)`.
  - Los endpoints `POST` verifican correspondencia exacta entre las cabeceras `Origin` y `Host` (`verifyCsrfOrigin`).
- **Sanitización de Logs (`src/lib/utils/logger.ts`)**:
  - Cualquier objeto o cadena registrada mediante `logger` o persistida en `public.sync_logs` pasa por `sanitizeLogPayload()`, que redacta automáticamente `access_token`, `refresh_token`, `client_secret`, `password`, `authorization` y encabezados `Bearer`.

---

## 2. Guía de Pruebas Automatizadas

La suite de pruebas verifica criptografía, validación de entradas, cumplimiento de políticas RLS, servicios de integración con redes sociales, cálculos analíticos y componentes de interfaz.

### 2.1. Ejecución de Pruebas Unitarias y de Integración (Vitest)

```bash
npm run test
```

Archivos de prueba incluidos en `src/tests/`:
- `src/tests/security.test.ts`: Cifrado/descifrado AES-256-GCM, detección de manipulación de Auth Tag, firma HMAC-SHA256 de estado OAuth, pares PKCE S256, validación CSRF, autenticación `CRON_SECRET`, rate limiter y sanitización de secretos en logs.
- `src/tests/validation.test.ts`: Validación Zod para login, recuperación de contraseña, filtros de fechas, paginación de biblioteca de videos y solicitudes de sincronización.
- `src/tests/rls-schema.test.ts`: Auditoría estática de la migración SQL y `config.toml` verificando RLS + FORCE RLS en las 8 tablas, aislamiento total de `oauth_credentials`, uso de `(select auth.uid())` y presencia de índices en todas las claves foráneas.
- `src/tests/services.test.ts`: Construcción de URLs OAuth oficiales para YouTube, TikTok, Instagram y Facebook, parseo de respuestas de YouTube Data API v3 + Analytics API v2, reporte de `unavailableMetrics`, backoff exponencial ante HTTP 429 y detección de expiración de token ante HTTP 401.
- `src/tests/analytics.test.ts`: Comparación porcentual contra períodos equivalentes, parseo de duraciones ISO-8601 y agregación multiplataforma con detección de videos de más rápido crecimiento.
- `src/tests/components.test.tsx`: Renderizado y accesibilidad de `MetricCard`, `PlatformBadge`, `ConnectionStatusBadge` y `AlertBanner`.

### 2.2. Ejecución de Pruebas End-to-End (Playwright)

Con el servidor corriendo (`npm run dev`), ejecuta:

```bash
npm run test:e2e
```

El archivo `e2e/auth-security.spec.ts` verifica la redirección de usuarios no autenticados en `/dashboard`, el bloqueo de `/signup` y la protección 401 en `/api/sync/cron`.
