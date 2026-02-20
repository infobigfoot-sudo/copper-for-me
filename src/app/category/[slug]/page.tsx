import { notFound } from 'next/navigation';

import ArticleCard from '@/components/ArticleCard';
import Breadcrumbs from '@/components/Breadcrumbs';
import { getCategories, getPostsByCategorySlug } from '@/lib/microcms';

export default async function CategoryPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolved = await params;
  const [categories, posts] = await Promise.all([
    getCategories().catch(() => ({ contents: [] as any[] })),
    getPostsByCategorySlug(resolved.slug).catch(() => ({ contents: [] as any[] }))
  ]);
  const category = categories.contents.find((c) => c.slug === resolved.slug);
  if (!category) notFound();

  return (
    <section>
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Category', href: '/' },
          { label: category.name }
        ]}
      />
      <h1>カテゴリ: {category.name}</h1>
      <p>{category.description}</p>
      <div className="article-grid">
        {posts.contents.map((post) => (
          <ArticleCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
}
