import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { getSupabaseServiceRoleEnv } from './env';

/**
 * Cliente administrativo de servidor (Service Role).
 * Uso ESTRICTAMENTE restringido a:
 * 1. Lectura/escritura cifrada en `public.oauth_credentials` (inaccesible para anon y authenticated).
 * 2. Procesos de sincronización programada servidor-a-servidor (Vercel Cron) autenticados con CRON_SECRET.
 * NUNCA importar este módulo desde componentes de cliente.
 */
export function createAdminClient() {
  const { url, serviceRoleKey } = getSupabaseServiceRoleEnv();

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
