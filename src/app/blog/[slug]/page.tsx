import type { Metadata } from 'next';

import Script from 'next/script';
import { notFound } from 'next/navigation';

import RichText from '@/components/RichText';
import { getCategories, getPostBySlug, getPosts, getRelatedPosts } from '@/lib/microcms';

export async function generateStaticParams() {
  const posts = await getPosts(100).catch(() => ({ contents: [] as { slug: string }[] }));
  return posts.contents.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const resolved = await params;
  const post = await getPostBySlug(resolved.slug).catch(() => null);
  if (!post) {
    return { title: 'Not Found' };
  }
  const baseUrl = process.env.SITE_URL || 'http://localhost:3000';
  const canonical = post.canonicalUrl || `${baseUrl}/blog/${post.slug || resolved.slug}`;
  const description = post.seoDescription || post.excerpt || '';
  return {
    title: post.seoTitle || post.title,
    description,
    alternates: {
      canonical
    },
    robots: post.noindex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title: post.seoTitle || post.title,
      description,
      type: 'article',
      url: canonical,
      images: post.coverImage?.url ? [{ url: post.coverImage.url }] : undefined
    },
    twitter: {
      card: 'summary_large_image',
      title: post.seoTitle || post.title,
      description,
      images: post.coverImage?.url ? [post.coverImage.url] : undefined
    }
  };
}

export default async function BlogDetailPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolved = await params;
  const post = await getPostBySlug(resolved.slug).catch(() => null);
  if (!post) notFound();

  const [related, categoriesRes] = await Promise.all([
    getRelatedPosts(post, 4).catch(() => ({ contents: [] })),
    getCategories().catch(() => ({ contents: [] }))
  ]);
  const categories = categoriesRes.contents || [];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    author: post.author ? { '@type': 'Person', name: post.author.name } : undefined,
    mainEntityOfPage: `${process.env.SITE_URL || 'http://localhost:3000'}/blog/${post.slug}`
  };

  const published = new Date(post.publishedAt).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  const heroImage =
    post.coverImage?.url ||
    'https://images.unsplash.com/photo-1558444479-c001797d2858?q=80&w=1200&auto=format&fit=crop';

  return (
    <div className="cf-page">
      <Script id="article-jsonld" type="application/ld+json">
        {JSON.stringify(jsonLd)}
      </Script>

      <nav className="cf-nav">
        <div className="cf-nav-inner">
          <div className="cf-logo">
            <a href="/">
              Copper<span>Flow</span>
            </a>
          </div>
          <div className="cf-nav-links">
            <a href="/">All</a>
            {categories.slice(0, 4).map((cat) => (
              <a key={cat.id} href={`/category/${cat.slug || cat.id}`}>
                {cat.name}
              </a>
            ))}
          </div>
        </div>
      </nav>

      <main className="cf-main cf-detail-main">
        <article className="cf-detail">
          <p className="cf-post-cat">{post.categories?.[0]?.name || 'Article'}</p>
          <h1>{post.title}</h1>
          <p className="cf-detail-meta">
            {published}
            {post.author ? ` | 著者: ${post.author.name}` : ''}
          </p>

          <div className="cf-detail-image">
            <img src={heroImage} alt={post.title} />
          </div>

          <div className="cf-article-rich">
            <RichText html={post.body} />
          </div>

          <section className="cf-detail-links">
            {(post.categories || []).map((cat) => (
              <a key={cat.id} href={`/category/${cat.slug || cat.id}`}>
                {cat.name}
              </a>
            ))}
            {(post.tags || []).map((tag) => (
              <a key={tag.id} href={`/tag/${tag.slug || tag.id}`}>
                #{tag.name}
              </a>
            ))}
          </section>
        </article>

        {related.contents.length ? (
          <section className="cf-latest cf-detail-related">
            <div className="cf-latest-head">
              <h3>Related Stories</h3>
            </div>
            <div className="cf-grid">
              {related.contents.map((item) => (
                <article key={item.id} className="cf-card">
                  <div className="cf-card-image">
                    <img
                      src={
                        item.coverImage?.url ||
                        'https://images.unsplash.com/photo-1536412597336-ade7b523ec3f?q=80&w=800&auto=format&fit=crop'
                      }
                      alt={item.title}
                    />
                  </div>
                  <div className="cf-meta">
                    <span>{item.categories?.[0]?.name || 'Article'}</span>
                    <small>
                      {new Date(item.publishedAt).toLocaleDateString('ja-JP', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </small>
                  </div>
                  <h4>{item.title}</h4>
                  <p>{item.excerpt || '詳しくは記事本文をご覧ください。'}</p>
                  <a href={`/blog/${item.slug || item.id}`}>読む</a>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <footer className="cf-footer">
        <p>© 2026 CopperFlow Intelligence. All Rights Reserved.</p>
      </footer>
    </div>
  );
}
