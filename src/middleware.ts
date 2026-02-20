import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

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
