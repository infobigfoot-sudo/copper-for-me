import type { Metadata } from 'next';

import Script from 'next/script';
import { notFound } from 'next/navigation';

import Breadcrumbs from '@/components/Breadcrumbs';
import RichText from '@/components/RichText';
import { getPostBySlug, getPosts, getRelatedPosts } from '@/lib/microcms';
import { SITE_KEYS, normalizeSite, sitePath, siteUrl } from '@/lib/site';

export async function generateStaticParams() {
  const params: Array<{ site: string; slug: string }> = [];
  for (const site of SITE_KEYS) {
    const posts = await getPosts(100, site).catch(() => ({ contents: [] as { slug: string }[] }));
    for (const post of posts.contents) {
      params.push({ site, slug: post.slug });
    }
  }
  return params;
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ site: string; slug: string }>;
}): Promise<Metadata> {
  const resolved = await params;
  const site = normalizeSite(resolved.site);
  if (site !== resolved.site) {
    return { title: 'Not Found' };
  }
  const post = await getPostBySlug(resolved.slug, site).catch(() => null);
  if (!post) {
    return { title: 'Not Found' };
  }
  const baseUrl = process.env.SITE_URL || 'http://localhost:3000';
  const canonical = post.canonicalUrl || siteUrl(baseUrl, site, `/blog/${post.slug || resolved.slug}`);
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

export default async function SiteBlogDetailPage({
  params
}: {
  params: Promise<{ site: string; slug: string }>;
}) {
  const resolved = await params;
  const site = normalizeSite(resolved.site);
  if (site !== resolved.site) notFound();

  const post = await getPostBySlug(resolved.slug, site).catch(() => null);
  if (!post) notFound();

  const related = await getRelatedPosts(post, 4, site).catch(() => ({ contents: [] }));

  const canonical = post.canonicalUrl || siteUrl(process.env.SITE_URL || 'http://localhost:3000', site, `/blog/${post.slug}`);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    author: post.author ? { '@type': 'Person', name: post.author.name } : undefined,
    mainEntityOfPage: canonical
  };
  const baseUrl = process.env.SITE_URL || 'http://localhost:3000';
  const to = (path: string) => sitePath(site, path);
  const primaryCategory = post.categories?.[0];
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: siteUrl(baseUrl, site, '/')
      },
      ...(primaryCategory
        ? [
            {
              '@type': 'ListItem',
              position: 2,
              name: primaryCategory.name,
              item: siteUrl(baseUrl, site, `/category/${primaryCategory.slug || primaryCategory.id}`)
            }
          ]
        : []),
      {
        '@type': 'ListItem',
        position: primaryCategory ? 3 : 2,
        name: post.title,
        item: siteUrl(baseUrl, site, `/blog/${post.slug}`)
      }
    ]
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
      <Script id="breadcrumb-jsonld-article" type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </Script>

      <nav className="cf-nav">
        <div className="cf-nav-inner">
          <div className="cf-logo-wrap">
            <div className="cf-logo">
              <a href={to('/')}>
                Copper for me
              </a>
            </div>
            <p className="cf-logo-sub">Daily Scrap Learning</p>
          </div>
          <div className="cf-nav-links">
            <a href={to('/')}>Home</a>
            <a href={to('/category/info')}>相場情報</a>
            <a href={to('/category/index')}>指標まとめ</a>
            <a href={to('/category/about')}>このサイトについて</a>
          </div>
          <details className="cf-nav-mobile">
            <summary>Menu</summary>
            <div className="cf-nav-mobile-panel">
              <a href={to('/')}>Home</a>
              <a href={to('/category/info')}>相場情報</a>
              <a href={to('/category/index')}>指標まとめ</a>
              <a href={to('/category/about')}>このサイトについて</a>
            </div>
          </details>
        </div>
      </nav>

      <main className="cf-main cf-detail-main">
        <article className="cf-detail">
          <Breadcrumbs
            items={[
              { label: 'Home', href: to('/') },
              ...(primaryCategory
                ? [
                    {
                      label: primaryCategory.name,
                      href: to(`/category/${primaryCategory.slug || primaryCategory.id}`)
                    }
                  ]
                : []),
              { label: post.title }
            ]}
          />
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
              <a key={cat.id} href={to(`/category/${cat.slug || cat.id}`)}>
                {cat.name}
              </a>
            ))}
            {(post.tags || []).map((tag) => (
              <a key={tag.id} href={to(`/tag/${tag.slug || tag.id}`)}>
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
                  <h4>
                    <a href={to(`/blog/${item.slug || item.id}`)}>{item.title}</a>
                  </h4>
                  <p>{item.excerpt || '詳しくは記事本文をご覧ください。'}</p>
                  <a href={to(`/blog/${item.slug || item.id}`)}>読む</a>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <footer className="cf-footer">
        <p className="cf-footer-links">
          <a href={to('/category/about')}>このサイトについて</a>
          <span> / </span>
          <a href={to('/blog/privacypolicy')}>プライバシーポリシー</a>
          <span> / </span>
          <a href={to('/blog/disclaimer')}>免責事項</a>
        </p>
        <p>© 2026 Copper for me. All Rights Reserved.</p>
      </footer>
    </div>
  );
}
