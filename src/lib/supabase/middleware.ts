import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured } from './env';

const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/forgot-password',
  '/auth/confirm',
  '/terms',
  '/privacy',
];
const AUTH_ONLY_PATHS = ['/login', '/signup'];

function applyNoCacheHeaders(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}

export async function updateSessionAndProtectRoutes(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // El endpoint de cron valida su propio CRON_SECRET servidor-a-servidor
  if (pathname.startsWith('/api/sync/cron')) {
    return applyNoCacheHeaders(NextResponse.next());
  }

  const isPublicPath = PUBLIC_PATHS.some(
    (pub) => pathname === pub || pathname.startsWith(`${pub}/`)
  );

  if (!isSupabaseConfigured()) {
    if (!isPublicPath) {
      if (pathname.startsWith('/api/')) {
        return applyNoCacheHeaders(
          NextResponse.json(
            { error: 'SERVICE_UNAVAILABLE', message: 'Servicio temporalmente no disponible.' },
            { status: 503 }
          )
        );
      }
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('error', 'service_unavailable');
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>
      ) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, {
            ...options,
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
          })
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Política default-deny: toda ruta fuera de PUBLIC_PATHS requiere sesión autenticada
  if (!user && !isPublicPath) {
    if (pathname.startsWith('/api/')) {
      return applyNoCacheHeaders(
        NextResponse.json(
          { error: 'UNAUTHORIZED', message: 'Debes iniciar sesión para acceder a este recurso.' },
          { status: 401 }
        )
      );
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    if (pathname !== '/' && /^\/[a-zA-Z0-9/_-]+$/.test(pathname)) {
      loginUrl.searchParams.set('next', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (user && (AUTH_ONLY_PATHS.includes(pathname) || pathname === '/')) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = '/dashboard';
    dashboardUrl.search = '';
    return NextResponse.redirect(dashboardUrl);
  }

  if (!isPublicPath) {
    applyNoCacheHeaders(supabaseResponse);
  }

  return supabaseResponse;
}
