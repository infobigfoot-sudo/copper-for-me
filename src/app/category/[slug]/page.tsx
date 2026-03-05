import type { Metadata } from 'next';
import Link from 'next/link';

import NativePageShell from '@/components/native/NativePageShell';
import { SectionCard } from '@/components/native/NativeWidgets';
import { formatDateLabel } from '@/lib/date_label';
import { getCategories, getPostsByCategorySlug } from '@/lib/microcms';

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `カテゴリ: ${slug}` };
}

export default async function CategoryPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [postsRes, catsRes] = await Promise.all([
    getPostsByCategorySlug(slug, 'a').catch(() => ({ contents: [] as any[] })),
    getCategories('a').catch(() => ({ contents: [] as any[] })),
  ]);
  const category = (catsRes.contents || []).find((c: any) => c.slug === slug || c.id === slug);

  return (
    <NativePageShell active="article" title={category?.name || slug} description={`カテゴリ記事一覧 (${postsRes.contents.length}件)`}>
      <SectionCard title="記事一覧">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {(postsRes.contents || []).map((post: any) => (
            <article key={`cat-post-${post.id}`} className="glass-card rounded-2xl p-5">
              <p className="text-cool-grey text-xs mb-2">{formatDateLabel(post.publishedAt)}</p>
              <h3 className="text-off-white font-bold mb-2">
                <Link href={`/blog/${post.slug || post.id}`} className="hover:text-positive">{post.title}</Link>
              </h3>
              {post.excerpt ? <p className="text-cool-grey text-sm">{post.excerpt}</p> : null}
            </article>
          ))}
        </div>
      </SectionCard>
    </NativePageShell>
  );
}
