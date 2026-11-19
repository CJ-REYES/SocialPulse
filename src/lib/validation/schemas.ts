import { z } from 'zod';
import {
  CONNECTION_STATUSES,
  CONTENT_TYPES,
  DATE_RANGE_PRESETS,
  PLATFORMS,
  SYNC_STATUSES,
} from '@/types/domain';

export const platformSchema = z.enum(PLATFORMS);
export const dateRangePresetSchema = z.enum(DATE_RANGE_PRESETS);
export const connectionStatusSchema = z.enum(CONNECTION_STATUSES);
export const contentTypeSchema = z.enum(CONTENT_TYPES);
export const syncStatusSchema = z.enum(SYNC_STATUSES);

export const loginFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(5, 'El correo electrónico es obligatorio')
    .max(254, 'El correo electrónico es demasiado largo')
    .email('Introduce un correo electrónico válido'),
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .max(128, 'La contraseña excede la longitud máxima permitida'),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(5, 'El correo electrónico es obligatorio')
    .max(254)
    .email('Introduce un correo electrónico válido'),
});

const strongPasswordSchema = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(128, 'La contraseña excede la longitud máxima permitida')
  .regex(/[A-Z]/, 'Debe contener al menos una letra mayúscula')
  .regex(/[a-z]/, 'Debe contener al menos una letra minúscula')
  .regex(/[0-9]/, 'Debe contener al menos un número');

export const resetPasswordSchema = z
  .object({
    password: strongPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

export const signupFormSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'El nombre debe tener al menos 2 caracteres')
      .max(80, 'El nombre no puede superar 80 caracteres'),
    email: z
      .string()
      .trim()
      .min(5, 'El correo electrónico es obligatorio')
      .max(254, 'El correo electrónico es demasiado largo')
      .email('Introduce un correo electrónico válido'),
    password: strongPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

export const dashboardFilterSchema = z
  .object({
    preset: dateRangePresetSchema.default('30d'),
    platform: z.union([platformSchema, z.literal('all')]).default('all'),
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
      .optional(),
  })
  .refine(
    (data) => {
      if (data.from && data.to) {
        return new Date(data.from) <= new Date(data.to);
      }
      return true;
    },
    {
      message: 'La fecha inicial no puede ser posterior a la fecha final',
      path: ['from'],
    }
  );

export const videoLibraryQuerySchema = z.object({
  platform: z.union([platformSchema, z.literal('all')]).default('all'),
  syncStatus: z.union([syncStatusSchema, z.literal('all')]).default('all'),
  search: z
    .string()
    .trim()
    .max(120, 'La búsqueda no puede superar 120 caracteres')
    .optional()
    .default(''),
  sortBy: z
    .enum(['published_at', 'views_count', 'likes_count', 'comments_count', 'shares_count'])
    .default('published_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const manualSyncRequestSchema = z.object({
  socialAccountId: z.string().uuid('ID de cuenta social inválido').optional(),
  platform: platformSchema.optional(),
});

export const disconnectAccountSchema = z.object({
  socialAccountId: z.string().uuid('ID de cuenta social inválido'),
});

export const oauthCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(16).optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});
