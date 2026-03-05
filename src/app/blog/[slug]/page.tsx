import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import NativePageShell from '@/components/native/NativePageShell';
import { SectionCard } from '@/components/native/NativeWidgets';
import RichText from '@/components/RichText';
import { formatDateLabel } from '@/lib/date_label';
import { getPostBySlug, getPosts } from '@/lib/microcms';

export async function generateStaticParams() {
  const posts = await getPosts(200, 'a').catch(() => ({ contents: [] as any[] }));
  return (posts.contents || []).map((p: any) => ({ slug: p.slug || p.id }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug, 'a').catch(() => null);
  if (!post) return { title: '記事' };
  return {
    title: post.seoTitle || post.title,
    description: post.seoDescription || post.excerpt || post.title,
  };
}

export default async function BlogDetailPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [post, latest] = await Promise.all([
    getPostBySlug(slug, 'a').catch(() => null),
    getPosts(3, 'a').catch(() => ({ contents: [] as any[] })),
  ]);
  if (!post) notFound();

  return (
    <NativePageShell active="article" title={post.title} description={post.excerpt || '相場・指標記事'}>
      <SectionCard>
        <p className="text-cool-grey text-sm mb-4">{formatDateLabel(post.publishedAt)}</p>
        <RichText html={post.body || ''} />
      </SectionCard>
      <div className="mt-8">
        <SectionCard title="関連記事">
          <ul className="space-y-3">
            {(latest.contents || []).filter((p: any) => p.slug !== post.slug).slice(0, 3).map((item: any) => (
              <li key={`related-${item.id}`}>
                <Link href={`/blog/${item.slug || item.id}`} className="text-cool-grey hover:text-off-white">
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </NativePageShell>
  );
}
