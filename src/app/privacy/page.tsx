import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function PrivacyPolicyPage() {
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
              <ShieldCheck className="h-5 w-5 text-electricTeal" />
              Política de Privacidad — SocialPulse Analytics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed text-slate-300">
            <p>
              <strong className="text-white">1. Datos recopilados:</strong>{' '}
              Recopilamos únicamente la información de perfil básica necesaria para tu cuenta de acceso y las métricas públicas/autorizadas de tus canales y videos en YouTube, TikTok, Instagram y Facebook (visualizaciones, me gusta, comentarios, compartidos, seguidores y metadatos de publicaciones).
            </p>
            <p>
              <strong className="text-white">2. Protección y cifrado:</strong>{' '}
              Las credenciales de acceso de las plataformas conectadas se almacenan cifradas en servidores seguros y nunca se exponen en el navegador. Los datos de cada cuenta permanecen estrictamente aislados para su titular.
            </p>
            <p>
              <strong className="text-white">3. No compartición con terceros:</strong>{' '}
              SocialPulse Analytics nunca vende, alquila ni comparte los datos de tus redes sociales con terceros. Los datos se utilizan exclusivamente para mostrar tus paneles analíticos e historial de métricas.
            </p>
            <p>
              <strong className="text-white">4. Eliminación de datos:</strong>{' '}
              Puedes revocar la conexión de cualquier plataforma desde el panel de Conexiones OAuth en cualquier momento, eliminando inmediatamente los tokens OAuth almacenados.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
