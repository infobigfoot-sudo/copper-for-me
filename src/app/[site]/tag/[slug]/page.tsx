
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Script from 'next/script';

import Breadcrumbs from '@/components/Breadcrumbs';
import SafeImage from '@/components/SafeImage';
import { getPostsByTagSlug, getTags } from '@/lib/microcms';
import { normalizeSite, sitePath, siteUrl } from '@/lib/site';

function formatDate(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ site: string; slug: string }>;
}): Promise<Metadata> {
  const resolved = await params;
  const site = normalizeSite(resolved.site);
  if (site !== resolved.site) return { title: 'Not Found' };

  const tags = await getTags(site).catch(() => ({ contents: [] as any[] }));
  const q = decodeURIComponent(String(resolved.slug || '')).trim().toLowerCase();
  const tag = tags.contents.find(
    (t: any) =>
      String(t.slug || '').trim().toLowerCase() === q ||
      String(t.id || '').trim().toLowerCase() === q ||
      String(t.name || '').trim().toLowerCase() === q
  );
  if (!tag) return { title: 'Not Found' };

  const baseUrl = process.env.SITE_URL || 'http://localhost:3000';
  const canonical = siteUrl(baseUrl, site, `/tag/${tag.slug || tag.id}`);
  const title = `${tag.name} | Copper for me`;
  const description = `${tag.name}タグの記事一覧。関連する銅価格・指標・市況の記事を掲載。`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website'
    },
    twitter: {
      card: 'summary',
      title,
      description
    }
  };
}

export default async function SiteTagPage({
  params
}: {
  params: Promise<{ site: string; slug: string }>;
}) {
  const resolved = await params;
  const site = normalizeSite(resolved.site);
  if (site !== resolved.site) notFound();

  const [tags, posts] = await Promise.all([
    getTags(site).catch(() => ({ contents: [] as any[] })),
    getPostsByTagSlug(resolved.slug, site).catch(() => ({ contents: [] as any[] }))
  ]);
  const tag = tags.contents.find((t) => t.slug === resolved.slug || t.id === resolved.slug);
  if (!tag) notFound();
  const baseUrl = process.env.SITE_URL || 'http://localhost:3000';
  const to = (path: string) => sitePath(site, path);
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
      {
        '@type': 'ListItem',
        position: 2,
        name: `#${tag.name}`,
        item: siteUrl(baseUrl, site, `/tag/${tag.slug || tag.id}`)
      }
    ]
  };

  return (
    <div className="cf-page">
      <Script id="breadcrumb-jsonld-tag" type="application/ld+json">
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
      <main className="cf-main">
        <section className="cf-latest">
          <Breadcrumbs
            items={[
              { label: 'Home', href: to('/') },
              { label: `#${tag.name}` }
            ]}
          />
          <div className="cf-latest-head">
            <h3>#{tag.name}</h3>
          </div>
          <div className="cf-grid">
            {posts.contents.map((post) => (
              <article key={post.id} className="cf-card">
                <div className="cf-card-image">
                  <SafeImage
                    src={post.coverImage?.url}
                    fallback="/images/article-placeholder.svg"
                    alt={post.title}
                  />
                </div>
                <div className="cf-meta">
                  <span>{post.categories?.[0]?.name || 'Article'}</span>
                  <small>{formatDate(post.publishedAt)}</small>
                </div>
                <h4>
                  <a href={to(`/blog/${post.slug || post.id}`)}>{post.title}</a>
                </h4>
                <p>{post.excerpt || '詳しくは記事本文をご覧ください。'}</p>
                <a href={to(`/blog/${post.slug || post.id}`)}>読む</a>
              </article>
            ))}
          </div>
        </section>
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
