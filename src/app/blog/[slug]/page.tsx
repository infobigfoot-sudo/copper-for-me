import type { Metadata } from 'next';

import SiteBlogDetailPage, {
  generateMetadata as generateSiteMetadata,
  generateStaticParams as generateSiteStaticParams
} from '@/app/[site]/blog/[slug]/page';

export async function generateStaticParams() {
  const all = await generateSiteStaticParams();
  return all
    .filter((p) => p.site === 'a')
    .map((p) => ({ slug: p.slug }));
}

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

export default async function BlogDetailPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolved = await params;
  return SiteBlogDetailPage({
    params: Promise.resolve({ site: 'a', slug: resolved.slug })
  });
}

