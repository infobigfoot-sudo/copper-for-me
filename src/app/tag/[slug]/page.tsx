import { notFound } from 'next/navigation';

import ArticleCard from '@/components/ArticleCard';
import Breadcrumbs from '@/components/Breadcrumbs';
import { getPostsByTagSlug, getTags } from '@/lib/microcms';

export default async function TagPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolved = await params;
  const [tags, posts] = await Promise.all([
    getTags().catch(() => ({ contents: [] as any[] })),
    getPostsByTagSlug(resolved.slug).catch(() => ({ contents: [] as any[] }))
  ]);
  const tag = tags.contents.find((t) => t.slug === resolved.slug);
  if (!tag) notFound();

  return (
    <section>
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Tag', href: '/' },
          { label: tag.name }
        ]}
      />
      <h1>タグ: #{tag.name}</h1>
      <div className="article-grid">
        {posts.contents.map((post) => (
          <ArticleCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
}
