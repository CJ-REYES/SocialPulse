import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-midnight px-4 py-12 text-slate-100">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-electricTeal hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a SocialPulse Analytics
        </Link>

        <Card className="border-slateBlue-border bg-slateBlue">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl text-white">
              <FileText className="h-5 w-5 text-electricTeal" />
              Términos de Servicio — SocialPulse Analytics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed text-slate-300">
            <p>
              <strong className="text-white">1. Propósito de la plataforma:</strong>{' '}
              SocialPulse Analytics es una aplicación de analítica de contenido multiplataforma que permite a creadores consultar y comparar las estadísticas de sus propias publicaciones en YouTube, TikTok, Instagram y Facebook a través de sus APIs oficiales de solo lectura.
            </p>
            <p>
              <strong className="text-white">2. Uso de APIs oficiales:</strong>{' '}
              El servicio accede únicamente a las métricas y capacidades de publicación autorizadas explícitamente por cada usuario mediante OAuth 2.0 (YouTube Data API v3, YouTube Analytics API, TikTok API v2, Instagram Graph API y Meta Graph API). SocialPulse nunca publica contenido sin la acción o programación expresa del titular.
            </p>
            <p>
              <strong className="text-white">3. Revocación de acceso:</strong>{' '}
              El usuario puede desconectar cualquier cuenta social en cualquier momento desde la sección Conexiones OAuth del panel, revocando el token ante el proveedor y eliminando las credenciales almacenadas.
            </p>
            <p>
              <strong className="text-white">4. Responsabilidad y disponibilidad:</strong>{' '}
              Las métricas dependen de la disponibilidad y cuotas de cada proveedor oficial. La aplicación se proporciona tal cual para análisis de rendimiento de contenido propio.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
