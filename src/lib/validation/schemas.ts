import { z } from 'zod';
import {
  CONNECTION_STATUSES,
  CONTENT_TYPES,
  DATE_RANGE_PRESETS,
  PLATFORMS,
  PUBLISH_PRIVACY_STATUSES,
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

export const MAX_UPLOAD_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB (Supabase Free limit)
export const MAX_UPLOAD_THUMBNAIL_BYTES = 2 * 1024 * 1024; // 2 MB (YouTube & Meta limit)

export const allowedVideoMimeTypes = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;

export const allowedThumbnailMimeTypes = ['image/jpeg', 'image/png'] as const;

export const uploadUrlRequestSchema = z
  .object({
    assetKind: z.enum(['video', 'thumbnail']).default('video'),
    fileName: z
      .string()
      .trim()
      .min(1, 'El nombre del archivo es obligatorio')
      .max(180, 'El nombre del archivo es demasiado largo'),
    fileSizeBytes: z.number().int().min(1, 'El archivo no puede estar vacío'),
    mimeType: z.enum([...allowedVideoMimeTypes, ...allowedThumbnailMimeTypes], {
      errorMap: () => ({
        message: 'Formato no permitido. Usa MP4/MOV/WebM para video o JPG/PNG para miniatura.',
      }),
    }),
  })
  .superRefine((data, ctx) => {
    if (data.assetKind === 'thumbnail') {
      if (
        !(allowedThumbnailMimeTypes as readonly string[]).includes(data.mimeType)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'La miniatura debe ser una imagen JPG o PNG.',
          path: ['mimeType'],
        });
      }
      if (data.fileSizeBytes > MAX_UPLOAD_THUMBNAIL_BYTES) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'La miniatura no puede superar los 2 MB.',
          path: ['fileSizeBytes'],
        });
      }
    } else {
      if (!(allowedVideoMimeTypes as readonly string[]).includes(data.mimeType)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El video debe estar en formato MP4, MOV o WebM.',
          path: ['mimeType'],
        });
      }
      if (data.fileSizeBytes > MAX_UPLOAD_VIDEO_BYTES) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El video supera el límite gratuito de 50 MB.',
          path: ['fileSizeBytes'],
        });
      }
    }
  });

export const createPublishJobSchema = z.object({
  socialAccountIds: z
    .array(z.string().uuid('Cuenta social inválida'))
    .min(1, 'Selecciona al menos una cuenta conectada')
    .max(10),
  title: z
    .string()
    .trim()
    .min(2, 'El título debe tener al menos 2 caracteres')
    .max(150, 'El título no puede superar 150 caracteres'),
  description: z.string().trim().max(5000).optional().default(''),
  privacyStatus: z.enum(PUBLISH_PRIVACY_STATUSES).default('private'),
  storagePath: z
    .string()
    .min(5, 'Ruta de archivo inválida')
    .max(300),
  thumbnailStoragePath: z.string().min(5).max(300).optional().nullable(),
  thumbnailMimeType: z.enum(allowedThumbnailMimeTypes).optional().nullable(),
  fileName: z.string().trim().min(1).max(180),
  fileSizeBytes: z.number().int().min(1).max(MAX_UPLOAD_VIDEO_BYTES),
  mimeType: z.enum(allowedVideoMimeTypes).default('video/mp4'),
  scheduledAt: z.string().datetime({ offset: true }).optional().nullable(),
});

export const cancelPublishJobSchema = z.object({
  publishJobId: z.string().uuid('ID de publicación inválido'),
});
