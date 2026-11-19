import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import type { UserProfile } from '@/types/domain';
import type { Database } from '@/types/database';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export interface AuthenticatedContext {
  userId: string;
  email: string;
  profile: UserProfile;
}

export async function getAuthenticatedContext(): Promise<AuthenticatedContext | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  const { data: rawProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  const profileRow = rawProfile as ProfileRow | null;

  const profile: UserProfile = profileRow
    ? {
        id: profileRow.id,
        email: profileRow.email,
        fullName: profileRow.full_name,
        avatarUrl: profileRow.avatar_url,
        role: profileRow.role,
        timezone: profileRow.timezone,
        createdAt: profileRow.created_at,
        updatedAt: profileRow.updated_at,
      }
    : {
        id: user.id,
        email: user.email ?? 'owner@private.local',
        fullName:
          typeof user.user_metadata?.full_name === 'string'
            ? user.user_metadata.full_name
            : (user.email?.split('@')[0] ?? 'Propietario'),
        avatarUrl:
          typeof user.user_metadata?.avatar_url === 'string'
            ? user.user_metadata.avatar_url
            : null,
        role: 'owner',
        timezone: 'UTC',
        createdAt: user.created_at,
        updatedAt: user.updated_at ?? user.created_at,
      };

  return {
    userId: user.id,
    email: profile.email,
    profile,
  };
}

export async function requireAuthenticatedContext(): Promise<AuthenticatedContext> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    redirect('/login');
  }
  return ctx;
}
