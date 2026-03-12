import type { Metadata } from 'next';
import Link from 'next/link';

import NativePageShell from '@/components/native/NativePageShell';
import { SectionCard } from '@/components/native/NativeWidgets';
import { formatDateLabel } from '@/lib/date_label';
import { getPostsByTagSlug, getTags } from '@/lib/microcms';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `タグ: ${slug}` };
}

export default async function TagPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [postsRes, tagsRes] = await Promise.all([
    getPostsByTagSlug(slug, 'a').catch(() => ({ contents: [] as any[] })),
    getTags('a').catch(() => ({ contents: [] as any[] })),
  ]);
  const tag = (tagsRes.contents || []).find((t: any) => t.slug === slug || t.id === slug);

  return (
    <NativePageShell active="article" title={`#${tag?.name || slug}`} description={`タグ記事一覧 (${postsRes.contents.length}件)`}>
      <SectionCard title="記事一覧">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {(postsRes.contents || []).map((post: any) => (
            <article key={`tag-post-${post.id}`} className="glass-card rounded-2xl p-5">
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
