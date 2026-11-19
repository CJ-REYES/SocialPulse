import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/terms', '/privacy'],
        disallow: [
          '/dashboard',
          '/videos',
          '/platforms',
          '/compare',
          '/connections',
          '/api',
          '/auth',
          '/reset-password',
          '/forgot-password',
        ],
      },
    ],
  };
}
