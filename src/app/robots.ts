import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return {
    rules: {
      userAgent: '*',
      allow: '/'
    },
    sitemap: `${baseUrl}/sitemap.xml`
  };
}
