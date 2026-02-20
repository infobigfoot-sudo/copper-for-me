import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const host = (req.headers.get('host') || '').toLowerCase();
  const primaryDomain = (process.env.PRIMARY_DOMAIN || '').toLowerCase().trim();

  // Force canonical host in production (e.g. www.copper-for-me.com).
  if (
    process.env.NODE_ENV === 'production' &&
    primaryDomain &&
    host &&
    host !== primaryDomain &&
    host !== `www.${primaryDomain}` &&
    !host.includes('localhost') &&
    !host.startsWith('127.0.0.1')
  ) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.protocol = 'https';
    redirectUrl.host = primaryDomain;
    redirectUrl.pathname = pathname;
    redirectUrl.search = search;
    return NextResponse.redirect(redirectUrl, 308);
  }

  // Canonical: always hide /a prefix for this project.
  if (pathname === '/a' || pathname.startsWith('/a/')) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = pathname === '/a' ? '/' : pathname.slice(2);
    redirectUrl.search = search;
    return NextResponse.redirect(redirectUrl, 308);
  }

  // Block/normalize other site prefixes to root namespace.
  if (pathname === '/b' || pathname === '/c' || pathname.startsWith('/b/') || pathname.startsWith('/c/')) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = pathname.replace(/^\/[bc]/, '') || '/';
    redirectUrl.search = search;
    return NextResponse.redirect(redirectUrl, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|robots.txt|sitemap.xml).*)']
};
