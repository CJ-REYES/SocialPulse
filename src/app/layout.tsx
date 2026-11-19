import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SocialPulse | Social Analytics Dashboard',
  description:
    'Plataforma de analítica de contenido multiplataforma para YouTube, TikTok, Instagram y Facebook.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-screen bg-midnight text-slate-100 antialiased selection:bg-electricTeal selection:text-midnight">
        {children}
      </body>
    </html>
  );
}
