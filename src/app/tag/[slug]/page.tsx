import type { Metadata } from 'next';

import SiteTagPage, {
  generateMetadata as generateSiteMetadata
} from '@/app/[site]/tag/[slug]/page';

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const resolved = await params;
  return generateSiteMetadata({
    params: Promise.resolve({ site: 'a', slug: resolved.slug })
  });
}

export default async function TagPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolved = await params;
  return SiteTagPage({
    params: Promise.resolve({ site: 'a', slug: resolved.slug })
  });
}

