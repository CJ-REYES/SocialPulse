# Documentación de Integraciones Oficiales y Configuración OAuth 2.0

Todas las integraciones se comunican exclusivamente con los endpoints oficiales de cada proveedor. No se utiliza scraping ni métodos no autorizados.

---

## 1. YouTube (`YouTubeService`)

- **APIs Oficiales**:
  - **YouTube Data API v3** (`https://www.googleapis.com/youtube/v3/channels`, `/playlistItems`, `/videos`).
  - **YouTube Analytics API v2** (`https://youtubeanalytics.googleapis.com/v2/reports`).
- **Scopes OAuth 2.0 Requeridos**:
  - `https://www.googleapis.com/auth/youtube.readonly`
  - `https://www.googleapis.com/auth/yt-analytics.readonly`
- **Métricas Recuperadas**:
  - Canal: Título, handle (`customUrl`), avatar, suscriptores (`subscriberCount`, salvo que el canal tenga `hiddenSubscriberCount = true`), total de videos.
  - Videos: Visualizaciones (`viewCount`), Me gusta (`likeCount`), Comentarios (`commentCount`), Duración ISO-8601 (`duration`), Compartidos (`shares`), Minutos estimados reproducidos (`estimatedMinutesWatched`) y Duración promedio de visualización (`averageViewDuration`).
- **Métricas No Disponibles en la API**:
  - `reach` (Alcance de espectadores únicos) e `impressions` no están expuestos mediante el endpoint JSON REST estándar de YouTube Analytics API v2 (se marcan explícitamente en `unavailable_metrics`).
- **Configuración en Google Cloud Console**:
  1. Crea un proyecto en [Google Cloud Console](https://console.cloud.google.com/).
  2. En **APIs & Services > Library**, habilita **YouTube Data API v3** y **YouTube Analytics API**.
  3. En **OAuth consent screen**, configura la pantalla en modo *Testing* y añade tu correo de Google en **Test users**.
  4. En **Credentials > Create Credentials > OAuth client ID** (tipo *Web application*), añade la URI de redirección autorizada:
     - Local: `http://localhost:3000/api/oauth/youtube/callback`
     - Producción: `https://tu-dominio.vercel.app/api/oauth/youtube/callback`
  5. Copia `YOUTUBE_CLIENT_ID` y `YOUTUBE_CLIENT_SECRET` a tu archivo `.env.local`.

---

## 2. TikTok (`TikTokService`)

- **APIs Oficiales**:
  - **TikTok Login Kit v2** (`https://www.tiktok.com/v2/auth/authorize/`, `https://open.tiktokapis.com/v2/oauth/token/`) con **PKCE (`S256`)** obligatorio.
  - **TikTok Display API v2** (`https://open.tiktokapis.com/v2/user/info/`, `https://open.tiktokapis.com/v2/video/list/`).
- **Scopes OAuth 2.0 Requeridos**:
  - `user.info.basic`
  - `user.info.stats`
  - `video.list`
- **Métricas Recuperadas**:
  - Cuenta: `display_name`, `username`, `avatar_url`, `follower_count`, `following_count`, `video_count`, `likes_count`.
  - Videos: `view_count`, `like_count`, `comment_count`, `share_count`, `duration`, `cover_image_url`, `share_url`, `create_time`.
- **Métricas No Disponibles en la API**:
  - `reach`, `impressions`, `watch_time_minutes`, `avg_view_duration_seconds` no son expuestos por TikTok Display API v2.
- **Procedimiento de Configuración y Aprobación en TikTok for Developers**:
  1. Crea una aplicación en [TikTok for Developers](https://developers.tiktok.com/).
  2. Activa el entorno **Sandbox** para pruebas inmediatas sin esperar revisión: añade tu cuenta de TikTok en **Target Users**.
  3. Agrega los productos **Login Kit** y **Display API**, y selecciona los scopes `user.info.basic`, `user.info.stats` y `video.list`.
  4. Configura el **Redirect URI**:
     - `https://tu-dominio.vercel.app/api/oauth/tiktok/callback`
  5. Para pasar a **Production**, envía la solicitud de revisión (*App Review*) adjuntando una captura del flujo de login y del dashboard privado.

---

## 3. Instagram (`InstagramService`)

- **API Oficial**:
  - **Instagram Graph API v21.0** sobre Meta Graph API (`https://graph.facebook.com/v21.0`).
- **Requisitos de Cuenta**:
  - La cuenta de Instagram debe ser una **Cuenta Profesional (Creator o Business)** vinculada a una Página de Facebook administrada por el usuario.
- **Scopes OAuth 2.0 Requeridos**:
  - `instagram_basic`
  - `instagram_manage_insights`
  - `pages_show_list`
  - `pages_read_engagement`
- **Métricas Recuperadas**:
  - Cuenta: `username`, `name`, `profile_picture_url`, `followers_count`, `follows_count`, `media_count`.
  - Videos y Reels: `views` (métrica unificada en Graph API v21+), `like_count`, `comments_count`, `shares`, `reach`.
- **Métricas No Disponibles**:
  - `duration_seconds`, `watch_time_minutes` y `avg_view_duration_seconds` no son expuestos en el nodo estándar `/{ig_media_id}` de Instagram Graph API.

---

## 4. Facebook (`FacebookService`)

- **API Oficial**:
  - **Meta Graph API v21.0** (`https://graph.facebook.com/v21.0/me/accounts`, `/{page_id}/videos`, `/{video_id}/video_insights`).
- **Scopes OAuth 2.0 Requeridos**:
  - `pages_show_list`
  - `pages_read_engagement`
  - `pages_read_user_content`
  - `read_insights`
- **Métricas Recuperadas**:
  - Página: `name`, `username`, `followers_count`, `fan_count`, `picture`.
  - Videos de Página: `views` (`total_video_views`), `likes.summary(total_count)`, `comments.summary(total_count)`, `length`, `total_video_impressions`, `total_video_view_total_time` (convertido de ms a minutos) y `total_video_avg_time_watched` (convertido de ms a segundos).
- **Configuración en Meta for Developers (Instagram y Facebook)**:
  1. Crea una App de tipo **Business** en [Meta for Developers](https://developers.facebook.com/).
  2. Añade el producto **Facebook Login for Business** e **Instagram Graph API**.
  3. En **Modo Desarrollo (Development Mode)**, cualquier cuenta que tenga rol de Administrador, Desarrollador o Tester en la App puede autorizar los scopes inmediatamente sin pasar por App Review público.
  4. Configura en **Valid OAuth Redirect URIs**:
     - `http://localhost:3000/api/oauth/instagram/callback`
     - `http://localhost:3000/api/oauth/facebook/callback`
     - `https://tu-dominio.vercel.app/api/oauth/instagram/callback`
     - `https://tu-dominio.vercel.app/api/oauth/facebook/callback`
