import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import Breadcrumbs from '@/components/Breadcrumbs';
import RichText from '@/components/RichText';
import { getStaticPageBySlug } from '@/lib/microcms';

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const resolved = await params;
  const page = await getStaticPageBySlug(resolved.slug);
  if (!page) return { title: 'Not Found' };
  return {
    title: page.seoTitle || page.title,
    description: page.seoDescription
  };
}

export default async function StaticPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolved = await params;
  const page = await getStaticPageBySlug(resolved.slug);
  if (!page) notFound();

  return (
    <section>
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: page.title }]} />
      <h1>{page.title}</h1>
      <RichText html={page.body} />
    </section>
  );
}
