import type { MetadataRoute } from 'next';

import { getPosts } from '@/lib/microcms';
import { SITE_KEYS, siteUrl } from '@/lib/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, changeFrequency: 'daily', priority: 1.0 },
    ...SITE_KEYS.map((site) => ({
      url: siteUrl(baseUrl, site, '/'),
      changeFrequency: 'daily' as const,
      priority: 0.9
    })),
    ...SITE_KEYS.flatMap((site) => ([
      { url: siteUrl(baseUrl, site, '/category/about'), changeFrequency: 'monthly' as const, priority: 0.5 },
      { url: siteUrl(baseUrl, site, '/blog/privacypolicy'), changeFrequency: 'monthly' as const, priority: 0.4 },
      { url: siteUrl(baseUrl, site, '/blog/disclaimer'), changeFrequency: 'monthly' as const, priority: 0.4 }
    ]))
  ];

  const postRoutes: MetadataRoute.Sitemap = [];
  for (const site of SITE_KEYS) {
    const posts = await getPosts(500, site).catch(
      () => ({ contents: [] as { slug: string; publishedAt: string; noindex?: boolean }[] })
    );
    for (const post of posts.contents) {
      if (post.noindex) continue;
      postRoutes.push({
        url: siteUrl(baseUrl, site, `/blog/${post.slug}`),
        lastModified: post.publishedAt,
        changeFrequency: 'weekly',
        priority: 0.8
      });
    }
  }

  return [...staticRoutes, ...postRoutes];
}
