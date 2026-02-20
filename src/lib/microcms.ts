import { cache } from 'react';

import type {
  Announcement,
  Category,
  ListResponse,
  Post,
  SiteSettings,
  StaticPage,
  Tag
} from '@/types/cms';

export type SiteKey = 'a' | 'b' | 'c';

const defaultConfig = {
  serviceDomain: process.env.MICROCMS_SERVICE_DOMAIN,
  apiKey: process.env.MICROCMS_READ_API_KEY,
  endpoints: {
    posts: process.env.MICROCMS_POSTS_ENDPOINT || 'news',
    categories: process.env.MICROCMS_CATEGORIES_ENDPOINT || 'categories',
    tags: process.env.MICROCMS_TAGS_ENDPOINT || 'tags',
    pages: process.env.MICROCMS_PAGES_ENDPOINT || 'pages',
    siteSettings: process.env.MICROCMS_SITE_SETTINGS_ENDPOINT || 'site_settings',
    announcements: process.env.MICROCMS_ANNOUNCEMENTS_ENDPOINT || 'announcements'
  }
};

const revalidateSeconds = 300;
const CATEGORY_SLUG_ALIASES: Record<string, string> = {
  'c9tqej8cew-6': 'other',
  onbpjgauf3: 'about',
  ftgnlrwvf1v: 'index',
  iugrmdnyi6: 'info'
};

function normalizeSite(site?: string): SiteKey {
  const value = String(site || 'a').toLowerCase();
  if (value === 'a' || value === 'b' || value === 'c') return value;
  return 'a';
}

function getSiteConfig(site?: string) {
  const key = normalizeSite(site);
  const upper = key.toUpperCase();
  const domain = process.env[`MICROCMS_SERVICE_DOMAIN_${upper}`] || defaultConfig.serviceDomain;
  const apiKey = process.env[`MICROCMS_READ_API_KEY_${upper}`] || defaultConfig.apiKey;
  return {
    key,
    serviceDomain: domain,
    apiKey,
    endpoints: {
      posts: process.env[`MICROCMS_POSTS_ENDPOINT_${upper}`] || defaultConfig.endpoints.posts,
      categories:
        process.env[`MICROCMS_CATEGORIES_ENDPOINT_${upper}`] || defaultConfig.endpoints.categories,
      tags: process.env[`MICROCMS_TAGS_ENDPOINT_${upper}`] || defaultConfig.endpoints.tags,
      pages: process.env[`MICROCMS_PAGES_ENDPOINT_${upper}`] || defaultConfig.endpoints.pages,
      siteSettings:
        process.env[`MICROCMS_SITE_SETTINGS_ENDPOINT_${upper}`] || defaultConfig.endpoints.siteSettings,
      announcements:
        process.env[`MICROCMS_ANNOUNCEMENTS_ENDPOINT_${upper}`] || defaultConfig.endpoints.announcements
    }
  };
}

function hasEnv(site?: string) {
  const config = getSiteConfig(site);
  return Boolean(config.serviceDomain && config.apiKey);
}

function buildUrl(serviceDomain: string, endpoint: string, query = '') {
  const suffix = query ? `?${query}` : '';
  return `https://${serviceDomain}.microcms.io/api/v1/${endpoint}${suffix}`;
}

function stripHtml(input: string) {
  return input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeCategory(raw: any): Category {
  const id = String(raw?.id || raw?.slug || '');
  const mappedSlug = CATEGORY_SLUG_ALIASES[id];
  const fallbackSlug = String(raw?.name || raw?.title || '')
    .trim()
    .toLowerCase();
  return {
    id,
    name: String(raw?.name || raw?.title || 'Category'),
    slug: String(raw?.slug || mappedSlug || fallbackSlug || id)
  };
}

function normalizeTag(raw: any): Tag {
  return {
    id: String(raw?.id || raw?.slug || ''),
    name: String(raw?.name || raw?.title || 'Tag'),
    slug: String(raw?.slug || raw?.id || '')
  };
}

function normalizePost(raw: any): Post {
  const body = String(raw?.body || raw?.content || '');
  const excerpt =
    String(raw?.excerpt || '').trim() || (body ? stripHtml(body).slice(0, 140) : undefined);
  const categoriesRaw = Array.isArray(raw?.categories)
    ? raw.categories
    : raw?.category
      ? [raw.category]
      : [];

  return {
    id: String(raw?.id || ''),
    title: String(raw?.title || 'Untitled'),
    slug: String(raw?.slug || raw?.id || ''),
    excerpt,
    body,
    coverImage: raw?.coverImage || raw?.eyecatch,
    publishedAt: String(raw?.publishedAt || raw?.createdAt || new Date().toISOString()),
    seoTitle: raw?.seoTitle,
    seoDescription: raw?.seoDescription,
    canonicalUrl: raw?.canonicalUrl ? String(raw.canonicalUrl) : undefined,
    noindex: raw?.noindex === true,
    status: raw?.status === 'draft' ? 'draft' : 'published',
    categories: categoriesRaw.map(normalizeCategory),
    tags: Array.isArray(raw?.tags) ? raw.tags.map(normalizeTag) : [],
    author: raw?.author
  };
}

async function cmsFetch<T>(site: string | undefined, endpoint: string, query = ''): Promise<T> {
  const config = getSiteConfig(site);
  if (!config.serviceDomain || !config.apiKey) {
    throw new Error(`microCMS env is missing for site: ${config.key}`);
  }
  const url = buildUrl(config.serviceDomain, endpoint, query);
  const res = await fetch(url, {
    headers: {
      'X-MICROCMS-API-KEY': config.apiKey
    },
    next: { revalidate: revalidateSeconds }
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`microCMS fetch failed (${res.status}): ${body}`);
  }

  return (await res.json()) as T;
}

async function cmsFetchPostById(site: string | undefined, endpoint: string, id: string): Promise<any | null> {
  const config = getSiteConfig(site);
  if (!config.serviceDomain || !config.apiKey || !id) return null;
  const url = buildUrl(config.serviceDomain, `${endpoint}/${encodeURIComponent(id)}`, 'depth=2');
  const res = await fetch(url, {
    headers: {
      'X-MICROCMS-API-KEY': config.apiKey
    },
    next: { revalidate: revalidateSeconds }
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`microCMS fetch by id failed (${res.status}): ${body}`);
  }
  return res.json();
}

export const getPosts = cache(async (limit = 12, site: string = 'c') => {
  const config = getSiteConfig(site);
  if (!hasEnv(site)) {
    return { contents: [], totalCount: 0, offset: 0, limit };
  }
  const data = await cmsFetch<ListResponse<any>>(
    site,
    config.endpoints.posts,
    `orders=-publishedAt&limit=${limit}&depth=2`
  );
  return {
    ...data,
    contents: data.contents.map(normalizePost)
  } as ListResponse<Post>;
});

export const getPostBySlug = cache(async (slug: string, site: string = 'c') => {
  const config = getSiteConfig(site);
  if (!hasEnv(site)) return null;

  // 1) Most reliable path: contentId direct lookup.
  const byId = await cmsFetchPostById(site, config.endpoints.posts, slug).catch(() => null);
  if (byId) return normalizePost(byId);

  // 2) If slug field exists in schema, resolve by filters.
  try {
    const bySlug = await cmsFetch<ListResponse<any>>(
      site,
      config.endpoints.posts,
      `filters=slug[equals]${encodeURIComponent(slug)}&limit=1&depth=2`
    );
    if (bySlug.contents?.[0]) return normalizePost(bySlug.contents[0]);
  } catch {
    // Some schemas may not have slug field. Fallback to list scan below.
  }

  // 3) Fallback for old schemas: scan a wider range.
  const data = await cmsFetch<ListResponse<any>>(
    site,
    config.endpoints.posts,
    `orders=-publishedAt&limit=1000&depth=2`
  );
  const posts = data.contents.map(normalizePost);
  return posts.find((post) => post.slug === slug || post.id === slug) ?? null;
});

export const getPostsByCategorySlug = cache(async (slug: string, site: string = 'c') => {
  const config = getSiteConfig(site);
  if (!hasEnv(site)) {
    return { contents: [], totalCount: 0, offset: 0, limit: 0 };
  }
  const data = await cmsFetch<ListResponse<any>>(
    site,
    config.endpoints.posts,
    `orders=-publishedAt&limit=100&depth=2`
  );
  const q = decodeURIComponent(String(slug || '')).trim().toLowerCase();
  const contents = data.contents
    .map(normalizePost)
    .filter((post) =>
      (post.categories || []).some((cat) => {
        const catSlug = String(cat.slug || '').trim().toLowerCase();
        const catId = String(cat.id || '').trim().toLowerCase();
        const catName = String(cat.name || '').trim().toLowerCase();
        return catSlug === q || catId === q || catName === q;
      })
    );
  return { ...data, contents } as ListResponse<Post>;
});

export const getPostsByTagSlug = cache(async (slug: string, site: string = 'c') => {
  const config = getSiteConfig(site);
  if (!hasEnv(site)) {
    return { contents: [], totalCount: 0, offset: 0, limit: 0 };
  }
  const data = await cmsFetch<ListResponse<any>>(
    site,
    config.endpoints.posts,
    `orders=-publishedAt&limit=100&depth=2`
  );
  const contents = data.contents
    .map(normalizePost)
    .filter((post) => (post.tags || []).some((tag) => tag.slug === slug || tag.id === slug));
  return { ...data, contents } as ListResponse<Post>;
});

export const getCategories = cache(async (site: string = 'c') => {
  const config = getSiteConfig(site);
  if (!hasEnv(site)) {
    return { contents: [], totalCount: 0, offset: 0, limit: 0 };
  }
  try {
    const data = await cmsFetch<ListResponse<any>>(
      site,
      config.endpoints.categories,
      'orders=name&limit=100'
    );
    return {
      ...data,
      contents: (data.contents || []).map(normalizeCategory)
    } as ListResponse<Category>;
  } catch {
    return { contents: [], totalCount: 0, offset: 0, limit: 0 };
  }
});

export const getTags = cache(async (site: string = 'c') => {
  const config = getSiteConfig(site);
  if (!hasEnv(site)) {
    return { contents: [], totalCount: 0, offset: 0, limit: 0 };
  }
  try {
    const data = await cmsFetch<ListResponse<any>>(site, config.endpoints.tags, 'orders=name&limit=100');
    return {
      ...data,
      contents: (data.contents || []).map(normalizeTag)
    } as ListResponse<Tag>;
  } catch {
    return { contents: [], totalCount: 0, offset: 0, limit: 0 };
  }
});

export const getStaticPageBySlug = cache(async (slug: string, site: string = 'c') => {
  const config = getSiteConfig(site);
  if (!hasEnv(site)) return null;
  const data = await cmsFetch<ListResponse<StaticPage>>(
    site,
    config.endpoints.pages,
    `filters=slug[equals]${encodeURIComponent(slug)}&limit=1`
  );
  return data.contents[0] ?? null;
});

export const getRelatedPosts = cache(async (post: Post, limit = 4, site: string = 'c') => {
  const config = getSiteConfig(site);
  if (!hasEnv(site)) return { contents: [] as Post[] };
  const tags = post.tags || [];
  if (!tags.length) {
    return { contents: [] as Post[] };
  }
  const firstTag = tags[0];
  const data = await cmsFetch<ListResponse<any>>(
    site,
    config.endpoints.posts,
    `orders=-publishedAt&limit=100&depth=2`
  );
  const contents = data.contents
    .map(normalizePost)
    .filter((item) => item.id !== post.id && (item.tags || []).some((tag) => tag.id === firstTag.id))
    .slice(0, limit);
  return { contents };
});

function normalizeAnnouncement(raw: any): Announcement {
  return {
    id: String(raw?.id || ''),
    title: String(raw?.title || raw?.name || ''),
    body: String(raw?.body || raw?.content || '').trim() || undefined,
    link: String(raw?.link || raw?.url || '').trim() || undefined,
    publishedAt: String(raw?.publishedAt || raw?.createdAt || '').trim() || undefined,
    startAt: String(raw?.startAt || raw?.startDate || '').trim() || undefined,
    endAt: String(raw?.endAt || raw?.endDate || '').trim() || undefined,
    active:
      raw?.active === true ||
      raw?.isActive === true ||
      raw?.enabled === true ||
      raw?.status === 'active'
  };
}

function normalizeSiteSettings(raw: any): SiteSettings {
  return {
    id: String(raw?.id || '').trim() || undefined,
    adEnabled:
      raw?.adEnabled === true ||
      raw?.adsEnabled === true ||
      raw?.showAds === true ||
      raw?.enableAds === true,
    cookieConsentText:
      String(raw?.cookieConsentText || raw?.consentText || '').trim() || undefined,
    contactEmail: String(raw?.contactEmail || raw?.email || '').trim() || undefined,
    snsX: String(raw?.snsX || raw?.xUrl || raw?.x || '').trim() || undefined,
    snsInstagram: String(raw?.snsInstagram || raw?.instagramUrl || raw?.instagram || '').trim() || undefined
  };
}

export const getSiteSettings = cache(async (site: string = 'c'): Promise<SiteSettings | null> => {
  const config = getSiteConfig(site);
  if (!hasEnv(site)) return null;

  try {
    const data = await cmsFetch<any>(site, config.endpoints.siteSettings, '');
    if (data && typeof data === 'object' && !Array.isArray(data) && !('contents' in data)) {
      return normalizeSiteSettings(data);
    }
    if (Array.isArray(data?.contents) && data.contents[0]) {
      return normalizeSiteSettings(data.contents[0]);
    }
    return null;
  } catch {
    return null;
  }
});

export const getAnnouncements = cache(async (limit = 5, site: string = 'c'): Promise<Announcement[]> => {
  const config = getSiteConfig(site);
  if (!hasEnv(site)) return [];
  try {
    const data = await cmsFetch<ListResponse<any>>(
      site,
      config.endpoints.announcements,
      `orders=-publishedAt&limit=${limit}`
    );
    const now = new Date();
    return (data.contents || [])
      .map(normalizeAnnouncement)
      .filter((item) => {
        if (item.active === false) return false;
        if (item.startAt && new Date(item.startAt) > now) return false;
        if (item.endAt && new Date(item.endAt) < now) return false;
        return true;
      });
  } catch {
    return [];
  }
});
