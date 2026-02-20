import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

type SiteKey = 'a' | 'b' | 'c';

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/:\d+$/, '');
}

function parseHostSiteMap(raw: string | undefined): Record<string, SiteKey> {
  const map: Record<string, SiteKey> = {};
  const text = String(raw || '').trim();
  if (!text) return map;

  for (const pair of text.split(',')) {
    const [hostRaw, siteRaw] = pair.split(':').map((v) => (v || '').trim().toLowerCase());
    if (!hostRaw) continue;
    if (siteRaw !== 'a' && siteRaw !== 'b' && siteRaw !== 'c') continue;
    map[normalizeHost(hostRaw)] = siteRaw;
  }
  return map;
}

function getSiteFromHost(req: NextRequest): SiteKey | null {
  const host = normalizeHost(req.headers.get('host') || '');
  const hostMap = parseHostSiteMap(process.env.HOST_SITE_MAP);
  return hostMap[host] || null;
}

function hasSitePrefix(pathname: string): boolean {
  return pathname === '/a' || pathname === '/b' || pathname === '/c' || /^\/[abc]\//.test(pathname);
}

function parseSitePrefix(pathname: string): { site: SiteKey; rest: string } | null {
  const m = pathname.match(/^\/([abc])(\/.*)?$/);
  if (!m) return null;
  const site = m[1] as SiteKey;
  const rest = m[2] || '';
  return { site, rest };
}

export function middleware(req: NextRequest) {
  const site = getSiteFromHost(req);
  if (!site) {
    return NextResponse.next();
  }

  const { pathname, search } = req.nextUrl;
  const prefixed = parseSitePrefix(pathname);
  if (prefixed) {
    // Lock each host to its own site namespace.
    if (prefixed.site !== site) {
      const rewriteUrl = req.nextUrl.clone();
      rewriteUrl.pathname = `/${site}${prefixed.rest}`;
      rewriteUrl.search = search;
      return NextResponse.rewrite(rewriteUrl);
    }
    // Keep canonical path without /a|/b|/c on mapped host.
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = prefixed.rest || '/';
    redirectUrl.search = search;
    return NextResponse.redirect(redirectUrl);
  }

  if (hasSitePrefix(pathname)) {
    return NextResponse.next();
  }

  const rewriteUrl = req.nextUrl.clone();
  rewriteUrl.pathname = `/${site}${pathname === '/' ? '' : pathname}`;
  rewriteUrl.search = search;
  return NextResponse.rewrite(rewriteUrl);
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|robots.txt|sitemap.xml).*)']
};
