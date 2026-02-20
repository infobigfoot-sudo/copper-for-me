export type MicroCMSImage = {
  url: string;
  width?: number;
  height?: number;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  description?: string;
};

export type Tag = {
  id: string;
  name: string;
  slug: string;
};

export type Author = {
  id: string;
  name: string;
  slug: string;
  bio?: string;
  avatar?: MicroCMSImage;
};

export type Post = {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  body: string;
  coverImage?: MicroCMSImage;
  publishedAt: string;
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  noindex?: boolean;
  status: 'draft' | 'published';
  categories?: Category[];
  tags?: Tag[];
  author?: Author;
};

export type StaticPage = {
  id: string;
  title: string;
  slug: string;
  body: string;
  seoTitle?: string;
  seoDescription?: string;
};

export type SiteSettings = {
  id?: string;
  adEnabled?: boolean;
  cookieConsentText?: string;
  contactEmail?: string;
  snsX?: string;
  snsInstagram?: string;
};

export type Announcement = {
  id: string;
  title: string;
  body?: string;
  link?: string;
  publishedAt?: string;
  startAt?: string;
  endAt?: string;
  active?: boolean;
};

export type ListResponse<T> = {
  contents: T[];
  totalCount: number;
  offset: number;
  limit: number;
};
