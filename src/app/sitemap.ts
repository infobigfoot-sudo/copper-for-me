import type { MetadataRoute } from 'next';

import { getCategories, getPosts, getTags } from '@/lib/microcms';
import { SITE_KEYS, siteUrl } from '@/lib/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.SITE_URL || 'https://copper-for-me.com').replace(/\/+$/, '');

  const staticPaths = [
    '/',
    '/article',
    '/lme',
    '/prediction',
    '/scrap',
    '/tatene',
    '/tatene-calculator',
  ] as const;

  const staticRoutes: MetadataRoute.Sitemap = [
    ...SITE_KEYS.flatMap((site) =>
      staticPaths.map((path) => ({
        url: siteUrl(baseUrl, site, path),
        changeFrequency: path === '/' ? ('daily' as const) : ('weekly' as const),
        priority: path === '/' ? 1.0 : 0.8,
      }))
    ),
  ];

  const postRoutes: MetadataRoute.Sitemap = [];
  const categoryRoutes: MetadataRoute.Sitemap = [];
  const tagRoutes: MetadataRoute.Sitemap = [];

  for (const site of SITE_KEYS) {
    const posts = await getPosts(500, site).catch(
      () => ({ contents: [] as { slug: string; publishedAt: string; noindex?: boolean }[] })
    );
    const categories = await getCategories(site).catch(
      () => ({ contents: [] as { slug: string }[] })
    );
    const tags = await getTags(site).catch(
      () => ({ contents: [] as { slug: string }[] })
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

    for (const category of categories.contents) {
      if (!category.slug) continue;
      categoryRoutes.push({
        url: siteUrl(baseUrl, site, `/category/${category.slug}`),
        changeFrequency: 'weekly',
        priority: 0.6,
      });
    }

    for (const tag of tags.contents) {
      if (!tag.slug) continue;
      tagRoutes.push({
        url: siteUrl(baseUrl, site, `/tag/${tag.slug}`),
        changeFrequency: 'weekly',
        priority: 0.5,
      });
    }
  }

  return [...staticRoutes, ...categoryRoutes, ...tagRoutes, ...postRoutes];
}
