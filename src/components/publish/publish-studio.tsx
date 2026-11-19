'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Film,
  ImagePlus,
  KeyRound,
  Loader2,
  Play,
  Send,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertBanner } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PlatformBadge } from '@/components/platforms/platform-badge';
import { formatDateTime, getPlatformDisplayName } from '@/lib/utils/format';
import type {
  Platform,
  PublishJobRecord,
  PublishPrivacyStatus,
  SocialAccount,
} from '@/types/domain';

const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024; // 2 MB

export interface PublishableAccountItem {
  account: SocialAccount;
  hasPublishScope: boolean;
  supportsNativeScheduling: boolean;
}

export interface PublishStudioProps {
  accounts: PublishableAccountItem[];
  initialJobs: PublishJobRecord[];
}

function formatFileSizeMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PublishStatusBadge({ status }: { status: PublishJobRecord['status'] }) {
  const map: Record<
    PublishJobRecord['status'],
    { label: string; variant: 'success' | 'warning' | 'danger' | 'secondary' | 'default' }
  > = {
    published: { label: 'Publicado', variant: 'success' },
    scheduled: { label: 'Programado', variant: 'default' },
    draft_inbox: { label: 'En Borradores (Inbox)', variant: 'default' },
    uploading: { label: 'Subiendo...', variant: 'warning' },
    pending: { label: 'Pendiente', variant: 'secondary' },
    failed: { label: 'Error', variant: 'danger' },
    cancelled: { label: 'Cancelado', variant: 'secondary' },
  };
  const info = map[status];
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

export function PublishStudio({ accounts, initialJobs }: PublishStudioProps) {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [selectedThumbnail, setSelectedThumbnail] = React.useState<File | null>(null);
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = React.useState<string | null>(null);
  const [selectedAccountIds, setSelectedAccountIds] = React.useState<string[]>(() =>
    accounts.filter((a) => a.hasPublishScope).map((a) => a.account.id)
  );
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [privacyStatus, setPrivacyStatus] = React.useState<PublishPrivacyStatus>('private');
  const [mode, setMode] = React.useState<'immediate' | 'scheduled'>('immediate');
  const [scheduledLocal, setScheduledLocal] = React.useState('');
  const [jobs, setJobs] = React.useState<PublishJobRecord[]>(initialJobs);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isProcessingDue, setIsProcessingDue] = React.useState(false);
  const [progressText, setProgressText] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{
    variant: 'success' | 'error' | 'info';
    title: string;
    message: string;
  } | null>(null);

  const toggleAccount = (id: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  React.useEffect(() => {
    return () => {
      if (thumbnailPreviewUrl) {
        URL.revokeObjectURL(thumbnailPreviewUrl);
      }
    };
  }, [thumbnailPreviewUrl]);

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFeedback(null);
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      return;
    }

    if (file.size > MAX_THUMBNAIL_BYTES) {
      setFeedback({
        variant: 'error',
        title: 'Miniatura demasiado grande',
        message: 'La miniatura debe pesar máximo 2 MB (recomendado 1280×720 px).',
      });
      return;
    }

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setFeedback({
        variant: 'error',
        title: 'Formato de miniatura no compatible',
        message: 'Selecciona una imagen en formato JPG o PNG.',
      });
      return;
    }

    if (thumbnailPreviewUrl) {
      URL.revokeObjectURL(thumbnailPreviewUrl);
    }
    setSelectedThumbnail(file);
    setThumbnailPreviewUrl(URL.createObjectURL(file));
  };

  const clearThumbnail = () => {
    if (thumbnailPreviewUrl) {
      URL.revokeObjectURL(thumbnailPreviewUrl);
    }
    setSelectedThumbnail(null);
    setThumbnailPreviewUrl(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFeedback(null);
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_SIZE_BYTES) {
      setSelectedFile(null);
      setFeedback({
        variant: 'error',
        title: 'Archivo demasiado grande',
        message: 'El tamaño máximo admitido por video es de 50 MB.',
      });
      return;
    }

    if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(file.type)) {
      setSelectedFile(null);
      setFeedback({
        variant: 'error',
        title: 'Formato no compatible',
        message: 'Selecciona un video en formato MP4, MOV o WebM.',
      });
      return;
    }

    setSelectedFile(file);
    if (!title.trim()) {
      const cleanName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      setTitle(cleanName.slice(0, 100));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!selectedFile) {
      setFeedback({
        variant: 'error',
        title: 'Falta el archivo de video',
        message: 'Selecciona un archivo MP4, MOV o WebM antes de continuar.',
      });
      return;
    }

    if (selectedAccountIds.length === 0) {
      setFeedback({
        variant: 'error',
        title: 'Selecciona al menos una red',
        message: 'Marca al menos una cuenta conectada para subir o programar el video.',
      });
      return;
    }

    let scheduledIso: string | null = null;
    if (mode === 'scheduled') {
      if (!scheduledLocal) {
        setFeedback({
          variant: 'error',
          title: 'Fecha requerida',
          message: 'Elige una fecha y hora futura para programar la publicación.',
        });
        return;
      }
      const parsedDate = new Date(scheduledLocal);
      if (Number.isNaN(parsedDate.getTime()) || parsedDate.getTime() <= Date.now() + 2 * 60 * 1000) {
        setFeedback({
          variant: 'error',
          title: 'Fecha inválida',
          message: 'La fecha programada debe ser al menos 5 minutos en el futuro.',
        });
        return;
      }
      scheduledIso = parsedDate.toISOString();
    }

    setIsSubmitting(true);
    try {
      // Paso 1: Solicitar URL firmada de subida directa para el video
      setProgressText('Preparando carga segura...');
      const signRes = await fetch('/api/publish/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetKind: 'video',
          fileName: selectedFile.name,
          fileSizeBytes: selectedFile.size,
          mimeType: selectedFile.type,
        }),
      });

      const signJson = (await signRes.json()) as {
        ok?: boolean;
        storagePath?: string;
        signedUrl?: string;
        message?: string;
      };

      if (!signRes.ok || !signJson.signedUrl || !signJson.storagePath) {
        throw new Error(signJson.message ?? 'No fue posible preparar la carga del video.');
      }

      // Paso 2: Subir el archivo binario del video directamente desde el navegador
      setProgressText(`Subiendo ${formatFileSizeMb(selectedFile.size)} de forma segura...`);
      const uploadRes = await fetch(signJson.signedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': selectedFile.type,
          'x-upsert': 'true',
        },
        body: selectedFile,
      });

      if (!uploadRes.ok) {
        throw new Error('Falló la transferencia del archivo de video. Inténtalo de nuevo.');
      }

      // Paso 2b (Opcional): Subir miniatura personalizada si el usuario eligió una
      let thumbnailStoragePath: string | null = null;
      let thumbnailMimeType: string | null = null;

      if (selectedThumbnail) {
        setProgressText('Subiendo miniatura personalizada...');
        const thumbSignRes = await fetch('/api/publish/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetKind: 'thumbnail',
            fileName: selectedThumbnail.name,
            fileSizeBytes: selectedThumbnail.size,
            mimeType: selectedThumbnail.type,
          }),
        });

        const thumbSignJson = (await thumbSignRes.json()) as {
          ok?: boolean;
          storagePath?: string;
          signedUrl?: string;
          message?: string;
        };

        if (!thumbSignRes.ok || !thumbSignJson.signedUrl || !thumbSignJson.storagePath) {
          throw new Error(
            thumbSignJson.message ?? 'No fue posible preparar la carga de la miniatura.'
          );
        }

        const thumbPutRes = await fetch(thumbSignJson.signedUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': selectedThumbnail.type,
            'x-upsert': 'true',
          },
          body: selectedThumbnail,
        });

        if (!thumbPutRes.ok) {
          throw new Error('Falló la transferencia de la miniatura. Inténtalo de nuevo.');
        }

        thumbnailStoragePath = thumbSignJson.storagePath;
        thumbnailMimeType = selectedThumbnail.type;
      }

      // Paso 3: Enviar a las plataformas seleccionadas o encolar programación
      setProgressText(
        mode === 'scheduled'
          ? 'Programando publicación en las plataformas seleccionadas...'
          : 'Publicando video en las plataformas seleccionadas...'
      );

      const pubRes = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          socialAccountIds: selectedAccountIds,
          title: title.trim(),
          description: description.trim(),
          privacyStatus,
          storagePath: signJson.storagePath,
          thumbnailStoragePath,
          thumbnailMimeType,
          fileName: selectedFile.name,
          fileSizeBytes: selectedFile.size,
          mimeType: selectedFile.type,
          scheduledAt: scheduledIso,
        }),
      });

      const pubJson = (await pubRes.json()) as {
        ok?: boolean;
        jobs?: PublishJobRecord[];
        message?: string;
      };

      if (!pubRes.ok || !pubJson.ok || !pubJson.jobs) {
        throw new Error(pubJson.message ?? 'No fue posible completar la publicación.');
      }

      setJobs((prev) => [...pubJson.jobs!, ...prev]);
      const failed = pubJson.jobs.filter((j) => j.status === 'failed');

      if (failed.length === pubJson.jobs.length) {
        setFeedback({
          variant: 'error',
          title: 'Publicación con errores',
          message:
            failed[0]?.errorMessage ??
            'Verifica que la cuenta tenga el permiso de publicación habilitado.',
        });
      } else {
        setFeedback({
          variant: 'success',
          title: mode === 'scheduled' ? 'Video programado correctamente' : 'Video enviado correctamente',
          message:
            failed.length > 0
              ? `Completado en ${pubJson.jobs.length - failed.length} cuenta(s) y con error en ${failed.length}. Revisa el historial abajo.`
              : `Procesado correctamente en ${pubJson.jobs.length} plataforma(s). El archivo temporal se limpia automáticamente al concluir.`,
        });
        setSelectedFile(null);
        clearThumbnail();
        setTitle('');
        setDescription('');
      }

      router.refresh();
    } catch (err) {
      setFeedback({
        variant: 'error',
        title: 'No se pudo completar el envío',
        message: err instanceof Error ? err.message : 'Error inesperado al subir el video.',
      });
    } finally {
      setIsSubmitting(false);
      setProgressText(null);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    const res = await fetch('/api/publish', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publishJobId: jobId }),
    });
    if (res.ok) {
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: 'cancelled', storagePath: null } : j))
      );
      router.refresh();
    }
  };

  const handleProcessDue = async () => {
    setIsProcessingDue(true);
    try {
      const res = await fetch('/api/publish', { method: 'PATCH' });
      const json = (await res.json()) as {
        ok?: boolean;
        processedCount?: number;
        jobs?: PublishJobRecord[];
      };
      if (res.ok && json.ok) {
        if (json.jobs && json.jobs.length > 0) {
          const updatedById = new Map(json.jobs.map((j) => [j.id, j]));
          setJobs((prev) => prev.map((j) => updatedById.get(j.id) ?? j));
        }
        setFeedback({
          variant: 'info',
          title: 'Cola revisada',
          message:
            (json.processedCount ?? 0) > 0
              ? `Se procesaron ${json.processedCount} publicación(es) programada(s).`
              : 'No hay publicaciones programadas cuya hora haya vencido todavía.',
        });
        router.refresh();
      }
    } finally {
      setIsProcessingDue(false);
    }
  };

  const hasQueuedJobs = jobs.some(
    (j) => j.status === 'scheduled' && j.publishMode === 'scheduled_queue'
  );

  return (
    <div className="space-y-6">
      {feedback ? (
        <AlertBanner variant={feedback.variant} title={feedback.title}>
          {feedback.message}
        </AlertBanner>
      ) : null}

      {accounts.length === 0 ? (
        <AlertBanner variant="info" title="Conecta al menos una red social primero">
          Para subir o programar videos, vincula tus cuentas en{' '}
          <Link href="/connections" className="font-semibold text-electricTeal underline">
            Conexiones Oficiales
          </Link>
          .
        </AlertBanner>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Formulario de Subida y Programación */}
        <form onSubmit={handleSubmit} className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UploadCloud className="h-5 w-5 text-electricTeal" />
                1. Selecciona tu Video
              </CardTitle>
              <CardDescription>
                Formatos MP4, MOV o WebM (máximo 50 MB). El archivo temporal se elimina automáticamente tras publicarse.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slateBlue-border bg-midnight/60 p-8 text-center transition-colors hover:border-electricTeal/60">
                <Film className="h-9 w-9 text-electricTeal" />
                {selectedFile ? (
                  <div className="mt-3 space-y-1">
                    <p className="text-sm font-semibold text-white">{selectedFile.name}</p>
                    <p className="font-mono text-xs text-electricTeal">
                      {formatFileSizeMb(selectedFile.size)} • {selectedFile.type}
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 space-y-1">
                    <p className="text-sm font-medium text-white">
                      Haz clic para elegir un video desde tu equipo
                    </p>
                    <p className="text-xs text-slateBlue-muted">MP4, MOV o WebM • Hasta 50 MB</p>
                  </div>
                )}
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  onChange={handleFileChange}
                  disabled={isSubmitting}
                  className="hidden"
                />
              </label>

              {/* Selector opcional de Miniatura Personalizada */}
              <div className="rounded-xl border border-slateBlue-border bg-midnight/50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                      Miniatura Personalizada (Opcional)
                    </p>
                    <p className="mt-0.5 text-[11px] text-slateBlue-muted">
                      JPG o PNG (máx. 2 MB, recomendado 1280×720). Aplica a YouTube, Instagram Reels y Facebook; TikTok permite elegir portada en borradores.
                    </p>
                  </div>

                  {!selectedThumbnail ? (
                    <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-electricTeal/40 bg-electricTeal/10 px-3 text-xs font-semibold text-electricTeal transition-colors hover:bg-electricTeal/20">
                      <ImagePlus className="h-4 w-4" />
                      <span>Elegir miniatura</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png"
                        onChange={handleThumbnailChange}
                        disabled={isSubmitting}
                        className="hidden"
                      />
                    </label>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isSubmitting}
                      onClick={clearThumbnail}
                    >
                      <X className="h-3.5 w-3.5" />
                      Quitar
                    </Button>
                  )}
                </div>

                {thumbnailPreviewUrl && selectedThumbnail ? (
                  <div className="mt-3 flex items-center gap-3 rounded-lg border border-slateBlue-border bg-midnight p-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbnailPreviewUrl}
                      alt="Vista previa de miniatura"
                      className="h-16 w-28 rounded-md object-cover border border-slateBlue-border"
                    />
                    <div className="min-w-0 text-xs">
                      <p className="truncate font-semibold text-white">
                        {selectedThumbnail.name}
                      </p>
                      <p className="font-mono text-[11px] text-electricTeal">
                        {formatFileSizeMb(selectedThumbnail.size)} • {selectedThumbnail.type}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Detalles y Programación</CardTitle>
              <CardDescription>
                Define título, descripción, visibilidad y si deseas publicar al instante o programar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="video-title"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                >
                  Título del Video *
                </label>
                <Input
                  id="video-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={150}
                  required
                  disabled={isSubmitting}
                  placeholder="Ej. Cómo optimizar tu estrategia de contenido"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="video-description"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                >
                  Descripción / Copy
                </label>
                <textarea
                  id="video-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  maxLength={5000}
                  disabled={isSubmitting}
                  placeholder="Añade hashtags, contexto o enlaces para tu publicación..."
                  className="w-full rounded-lg border border-slateBlue-border bg-midnight px-3 py-2 text-sm text-slate-100 placeholder:text-slateBlue-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electricTeal disabled:opacity-50"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor="video-privacy"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                  >
                    Visibilidad Inicial (YouTube)
                  </label>
                  <select
                    id="video-privacy"
                    value={privacyStatus}
                    onChange={(e) => setPrivacyStatus(e.target.value as PublishPrivacyStatus)}
                    disabled={isSubmitting}
                    className="h-10 w-full rounded-lg border border-slateBlue-border bg-midnight px-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-electricTeal"
                  >
                    <option value="private">Privado (recomendado para revisar)</option>
                    <option value="unlisted">No listado (solo con enlace)</option>
                    <option value="public">Público</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Momento de Publicación
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMode('immediate')}
                      disabled={isSubmitting}
                      className={`h-10 rounded-lg text-xs font-semibold transition-all ${
                        mode === 'immediate'
                          ? 'bg-electricTeal text-midnight'
                          : 'border border-slateBlue-border bg-midnight text-slate-300 hover:text-white'
                      }`}
                    >
                      Publicar Ahora
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('scheduled')}
                      disabled={isSubmitting}
                      className={`h-10 rounded-lg text-xs font-semibold transition-all ${
                        mode === 'scheduled'
                          ? 'bg-electricTeal text-midnight'
                          : 'border border-slateBlue-border bg-midnight text-slate-300 hover:text-white'
                      }`}
                    >
                      Programar Fecha
                    </button>
                  </div>
                </div>
              </div>

              {mode === 'scheduled' ? (
                <div className="space-y-2 rounded-lg border border-electricTeal/30 bg-midnight/70 p-4">
                  <label
                    htmlFor="scheduled-at"
                    className="flex items-center gap-1.5 text-xs font-semibold text-electricTeal"
                  >
                    <CalendarClock className="h-4 w-4" />
                    Fecha y Hora de Publicación (tu zona horaria local)
                  </label>
                  <Input
                    id="scheduled-at"
                    type="datetime-local"
                    value={scheduledLocal}
                    onChange={(e) => setScheduledLocal(e.target.value)}
                    disabled={isSubmitting}
                    required
                  />
                  <p className="text-[11px] leading-relaxed text-slateBlue-muted">
                    YouTube y Facebook programan directamente en su plataforma a la hora exacta. TikTok e Instagram se guardan temporalmente en cola y se envían al cumplirse la fecha programada.
                  </p>
                </div>
              ) : null}

              <div className="flex items-center justify-between pt-2">
                {progressText ? (
                  <p className="flex items-center gap-2 text-xs font-medium text-electricTeal">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {progressText}
                  </p>
                ) : (
                  <span className="text-xs text-slateBlue-muted">
                    {selectedAccountIds.length} cuenta(s) seleccionada(s)
                  </span>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting || !selectedFile || selectedAccountIds.length === 0}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : mode === 'scheduled' ? (
                    <CalendarClock className="h-4 w-4" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span>
                    {isSubmitting
                      ? 'Procesando...'
                      : mode === 'scheduled'
                        ? 'Programar Video'
                        : 'Subir y Publicar Ahora'}
                  </span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>

        {/* Selector de Cuentas Conectadas */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">3. Redes Destino</CardTitle>
            <CardDescription>
              Elige en qué cuentas conectadas deseas publicar este video
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {accounts.length === 0 ? (
              <p className="py-4 text-xs text-slateBlue-muted">
                No tienes cuentas activas todavía.
              </p>
            ) : (
              accounts.map((item) => {
                const isSelected = selectedAccountIds.includes(item.account.id);
                return (
                  <div
                    key={item.account.id}
                    className={`rounded-xl border p-3.5 transition-all ${
                      isSelected
                        ? 'border-electricTeal/60 bg-midnight/90'
                        : 'border-slateBlue-border bg-midnight/40'
                    }`}
                  >
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleAccount(item.account.id)}
                        disabled={isSubmitting}
                        className="mt-1 h-4 w-4 accent-[#22D3C5]"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <PlatformBadge platform={item.account.platform as Platform} />
                          {item.hasPublishScope ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" />
                              Listo
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium text-amber-300">
                              Permiso requerido
                            </span>
                          )}
                        </div>
                        <p className="truncate text-sm font-semibold text-white">
                          {item.account.accountName}
                        </p>
                        <p className="text-[11px] text-slateBlue-muted">
                          {item.supportsNativeScheduling
                            ? 'Soporta subida directa y programación nativa'
                            : item.account.platform === 'tiktok'
                              ? 'Subida a borradores de TikTok (Inbox)'
                              : 'Publicación de Reel + cola programada'}
                        </p>
                      </div>
                    </label>

                    {!item.hasPublishScope ? (
                      <div className="mt-3 border-t border-slateBlue-border/60 pt-2.5">
                        <a
                          href={`/api/oauth/${item.account.platform}/connect?mode=publish`}
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-electricTeal/40 bg-electricTeal/10 px-3 py-1.5 text-xs font-semibold text-electricTeal hover:bg-electricTeal/20"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Habilitar permiso de publicación en{' '}
                          {getPlatformDisplayName(item.account.platform)}
                        </a>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Historial y Cola de Publicaciones */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Cola Programada e Historial de Subidas</CardTitle>
            <CardDescription>
              Seguimiento en tiempo real de tus videos publicados, en borradores o programados
            </CardDescription>
          </div>
          {hasQueuedJobs ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isProcessingDue}
              onClick={handleProcessDue}
            >
              {isProcessingDue ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 text-electricTeal" />
              )}
              <span>Ejecutar programados vencidos</span>
            </Button>
          ) : null}
        </CardHeader>

        {jobs.length === 0 ? (
          <CardContent className="py-10 text-center text-xs text-slateBlue-muted">
            Todavía no has subido ni programado ningún video desde este panel.
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slateBlue-border bg-midnight/90 uppercase text-slateBlue-muted">
                <tr>
                  <th className="px-4 py-3">Video</th>
                  <th className="px-4 py-3">Plataforma</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Fecha / Programación</th>
                  <th className="px-4 py-3">Detalle</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slateBlue-border/60">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-midnight/40">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-white">{job.title}</p>
                      <p className="text-[11px] text-slateBlue-muted">
                        {job.fileName} • {formatFileSizeMb(job.fileSizeBytes)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <PlatformBadge platform={job.platform} />
                    </td>
                    <td className="px-4 py-3">
                      <PublishStatusBadge status={job.status} />
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-300">
                      {job.scheduledAt
                        ? `Prog: ${formatDateTime(job.scheduledAt)}`
                        : formatDateTime(job.publishedAt ?? job.createdAt)}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-slateBlue-muted">
                      {job.errorMessage ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {job.externalPostUrl ? (
                          <a
                            href={job.externalPostUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-slateBlue-border bg-midnight px-2 text-electricTeal hover:border-electricTeal"
                          >
                            Ver <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}

                        {job.status === 'scheduled' &&
                        job.publishMode === 'scheduled_queue' ? (
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => handleCancelJob(job.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                            Cancelar
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
