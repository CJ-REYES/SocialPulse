import { AppError } from '@/lib/utils/errors';

export function getSupabasePublicEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !publishableKey) {
    throw new AppError({
      code: 'INTERNAL_ERROR',
      message:
        'Variables de entorno de Supabase faltantes: configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
      isOperational: false,
    });
  }

  return { url, publishableKey };
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && publishableKey && !url.includes('your-project-ref'));
}

export function getSupabaseServiceRoleEnv(): { url: string; serviceRoleKey: string } {
  if (typeof window !== 'undefined') {
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'Violación de seguridad: SUPABASE_SERVICE_ROLE_KEY no puede invocarse en el cliente.',
      isOperational: false,
    });
  }

  const { url } = getSupabasePublicEnv();
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!serviceRoleKey) {
    throw new AppError({
      code: 'INTERNAL_ERROR',
      message:
        'SUPABASE_SERVICE_ROLE_KEY no está configurada en el entorno de servidor.',
      isOperational: false,
    });
  }

  return { url, serviceRoleKey };
}
