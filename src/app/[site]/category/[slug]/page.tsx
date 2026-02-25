
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Script from 'next/script';

import Breadcrumbs from '@/components/Breadcrumbs';
import SafeImage from '@/components/SafeImage';
import { getCategories, getPostsByCategorySlug } from '@/lib/microcms';
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

  const categories = await getCategories(site).catch(() => ({ contents: [] as any[] }));
  const q = decodeURIComponent(String(resolved.slug || '')).trim().toLowerCase();
  const category = categories.contents.find(
    (c: any) =>
      String(c.slug || '').trim().toLowerCase() === q ||
      String(c.id || '').trim().toLowerCase() === q ||
      String(c.name || '').trim().toLowerCase() === q
  );
  if (!category) return { title: 'Not Found' };

  const baseUrl = process.env.SITE_URL || 'http://localhost:3000';
  const canonical = siteUrl(baseUrl, site, `/category/${category.slug || category.id}`);
  const title = `${category.name} | Copper for me`;
  const description = `${category.name}カテゴリの記事一覧。銅価格・指標・市況に関する記事をまとめています。`;
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

export default async function SiteCategoryPage({
  params
}: {
  params: Promise<{ site: string; slug: string }>;
}) {
  const resolved = await params;
  const site = normalizeSite(resolved.site);
  if (site !== resolved.site) notFound();

  const [categories, posts] = await Promise.all([
    getCategories(site).catch(() => ({ contents: [] as any[] })),
    getPostsByCategorySlug(resolved.slug, site).catch(() => ({ contents: [] as any[] }))
  ]);
  const q = decodeURIComponent(String(resolved.slug || '')).trim().toLowerCase();
  const category = categories.contents.find(
    (c) =>
      String(c.slug || '').trim().toLowerCase() === q ||
      String(c.id || '').trim().toLowerCase() === q ||
      String(c.name || '').trim().toLowerCase() === q
  );
  if (!category) notFound();
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
        name: category.name,
        item: siteUrl(baseUrl, site, `/category/${category.slug || category.id}`)
      }
    ]
  };

  return (
    <div className="cf-page">
      <Script id="breadcrumb-jsonld-category" type="application/ld+json">
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
            <a href={to('/')}>HOME</a>
            <a href={to('/category/info')}>相場記事</a>
            <a href={to('/category/index')}>指標記事</a>
            <a href={to('/learn/copper-price-basics')}>銅を見るポイント</a>
            <a href={to('/supply-chain')}>サプライチェーン</a>
            <a href={to('/category/about')}>このサイトについて</a>
          </div>
          <details className="cf-nav-mobile">
            <summary>Menu</summary>
            <div className="cf-nav-mobile-panel">
              <a href={to('/')}>HOME</a>
              <a href={to('/category/info')}>相場記事</a>
              <a href={to('/category/index')}>指標記事</a>
              <a href={to('/learn/copper-price-basics')}>銅を見るポイント</a>
              <a href={to('/supply-chain')}>サプライチェーン</a>
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
              { label: category.name }
            ]}
          />
          <div className="cf-latest-head">
            <h3>{category.name}</h3>
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
