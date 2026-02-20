import type { Metadata } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';

import CookieConsentBanner from '@/components/CookieConsentBanner';
import './globals.css';

const baseUrl = process.env.SITE_URL || 'http://localhost:3000';
const metadataBase = (() => {
  try {
    return new URL(baseUrl);
  } catch {
    return new URL('http://localhost:3000');
  }
})();

export const metadata: Metadata = {
  metadataBase,
  title: process.env.NEXT_PUBLIC_SITE_NAME || 'AI Content Media',
  description: 'AI自動生成と人の承認を組み合わせたメディアサイト',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png'
  },
  alternates: {
    canonical: '/'
  },
  robots: {
    index: true,
    follow: true
  },
  openGraph: {
    type: 'website',
    url: baseUrl,
    title: process.env.NEXT_PUBLIC_SITE_NAME || 'AI Content Media',
    description: 'AI自動生成と人の承認を組み合わせたメディアサイト'
  },
  twitter: {
    card: 'summary_large_image',
    title: process.env.NEXT_PUBLIC_SITE_NAME || 'AI Content Media',
    description: 'AI自動生成と人の承認を組み合わせたメディアサイト'
  }
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const adsenseClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: process.env.NEXT_PUBLIC_SITE_NAME || 'AI Content Media',
    url: baseUrl
  };
  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: process.env.NEXT_PUBLIC_SITE_NAME || 'AI Content Media',
    url: baseUrl
  };

  return (
    <html lang="ja">
      <body>
        <Script id="jsonld-website" type="application/ld+json">
          {JSON.stringify(websiteJsonLd)}
        </Script>
        <Script id="jsonld-organization" type="application/ld+json">
          {JSON.stringify(orgJsonLd)}
        </Script>
        {adsenseClient ? (
          <Script
            id="adsense"
            async
            strategy="afterInteractive"
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
          />
        ) : null}

        {children}
        <CookieConsentBanner />
      </body>
    </html>
  );
}
