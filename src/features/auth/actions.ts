'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import {
  forgotPasswordSchema,
  loginFormSchema,
  resetPasswordSchema,
  signupFormSchema,
} from '@/lib/validation/schemas';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/utils/logger';

export interface AuthActionState {
  status: 'idle' | 'success' | 'error';
  message?: string;
}

async function getAppBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured && !configured.includes('localhost')) {
    return configured.replace(/\/$/, '');
  }

  const headerStore = await headers();
  const origin = headerStore.get('origin');
  if (origin && origin.startsWith('http')) {
    return origin.replace(/\/$/, '');
  }

  const forwardedHost = headerStore.get('x-forwarded-host') ?? headerStore.get('host');
  const forwardedProto = headerStore.get('x-forwarded-proto') ?? 'https';
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return configured?.replace(/\/$/, '') ?? 'http://localhost:3000';
}

async function getClientIp(): Promise<string> {
  const headerStore = await headers();
  const forwardedFor = headerStore.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() ?? 'unknown';
  }
  return headerStore.get('x-real-ip') ?? 'local';
}

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) {
    return {
      status: 'error',
      message: 'El servicio de autenticación no está disponible temporalmente.',
    };
  }

  const rawEmail = String(formData.get('email') ?? '');
  const rawPassword = String(formData.get('password') ?? '');

  const parsed = loginFormSchema.safeParse({
    email: rawEmail,
    password: rawPassword,
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Credenciales inválidas.',
    };
  }

  const clientIp = await getClientIp();
  const rateLimit = checkRateLimit({
    key: `auth:login:${clientIp}:${parsed.data.email.toLowerCase()}`,
    limit: 5,
    windowMs: 15 * 60 * 1000, // 5 intentos por 15 minutos
  });

  if (!rateLimit.allowed) {
    logger.warn('auth_login_rate_limited', { email: parsed.data.email, clientIp });
    return {
      status: 'error',
      message:
        'Demasiados intentos de inicio de sesión fallidos. Por seguridad, espera 15 minutos antes de volver a intentarlo.',
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    logger.warn('auth_login_failed', {
      email: parsed.data.email,
      clientIp,
    });
    return {
      status: 'error',
      message: 'Correo electrónico o contraseña incorrectos.',
    };
  }

  logger.info('auth_login_success', { email: parsed.data.email });
  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function signupAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) {
    return {
      status: 'error',
      message: 'El servicio de registro no está disponible temporalmente.',
    };
  }

  const parsed = signupFormSchema.safeParse({
    fullName: String(formData.get('fullName') ?? ''),
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    confirmPassword: String(formData.get('confirmPassword') ?? ''),
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Verifica los datos del formulario.',
    };
  }

  const clientIp = await getClientIp();
  const rateLimit = checkRateLimit({
    key: `auth:signup:${clientIp}`,
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return {
      status: 'error',
      message: 'Demasiados registros recientes desde tu red. Espera 15 minutos antes de reintentar.',
    };
  }

  const appUrl = await getAppBaseUrl();
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${appUrl}/auth/confirm?next=/dashboard`,
      data: {
        full_name: parsed.data.fullName,
      },
    },
  });

  if (error) {
    logger.warn('auth_signup_failed', {
      email: parsed.data.email,
      reason: error.message,
    });
    return {
      status: 'error',
      message:
        'No fue posible completar el registro. Verifica tus datos o intenta iniciar sesión si ya tienes cuenta.',
    };
  }

  // Si el proyecto tiene confirmación automática (session devuelta de inmediato), entrar directo al dashboard
  if (data.session) {
    logger.info('auth_signup_immediate_login', { email: parsed.data.email });
    revalidatePath('/', 'layout');
    redirect('/dashboard');
  }

  logger.info('auth_signup_confirmation_sent', { email: parsed.data.email });
  return {
    status: 'success',
    message:
      'Cuenta creada correctamente. Revisa tu correo electrónico y haz clic en el enlace de confirmación para iniciar sesión.',
  };
}

export async function forgotPasswordAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) {
    return {
      status: 'error',
      message: 'El servicio de recuperación no está disponible temporalmente.',
    };
  }

  const parsed = forgotPasswordSchema.safeParse({
    email: String(formData.get('email') ?? ''),
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Introduce un correo electrónico válido.',
    };
  }

  const clientIp = await getClientIp();
  const rateLimit = checkRateLimit({
    key: `auth:forgot:${clientIp}`,
    limit: 3,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return {
      status: 'error',
      message: 'Has solicitado demasiados enlaces de recuperación. Espera 15 minutos.',
    };
  }

  const appUrl = await getAppBaseUrl();
  const supabase = await createClient();

  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl}/auth/confirm?next=/reset-password`,
  });

  // Respuesta genérica para prevenir enumeración de usuarios
  return {
    status: 'success',
    message:
      'Si el correo corresponde a una cuenta registrada, recibirás un enlace seguro para restablecer tu contraseña.',
  };
}

export async function resetPasswordAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) {
    return {
      status: 'error',
      message: 'El servicio de autenticación no está disponible temporalmente.',
    };
  }

  const parsed = resetPasswordSchema.safeParse({
    password: String(formData.get('password') ?? ''),
    confirmPassword: String(formData.get('confirmPassword') ?? ''),
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Verifica los requisitos de la contraseña.',
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      status: 'error',
      message: 'Tu sesión de recuperación ha expirado. Solicita un nuevo enlace.',
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return {
      status: 'error',
      message: 'No fue posible actualizar la contraseña. Intenta con una contraseña diferente.',
    };
  }

  logger.info('auth_password_reset_completed', { userId: user.id });
  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  revalidatePath('/', 'layout');
  redirect('/login');
}
