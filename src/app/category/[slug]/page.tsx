import type { Metadata } from 'next';

import SiteCategoryPage, {
  generateMetadata as generateSiteMetadata
} from '@/app/[site]/category/[slug]/page';

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

export default async function CategoryPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolved = await params;
  return SiteCategoryPage({
    params: Promise.resolve({ site: 'a', slug: resolved.slug })
  });
}

