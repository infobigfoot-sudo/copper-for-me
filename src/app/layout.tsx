import type { Metadata } from 'next';
import { IBM_Plex_Sans_JP, Noto_Sans_JP } from 'next/font/google';
import Script from 'next/script';
import type { ReactNode } from 'react';

import CookieConsentBanner from '@/components/CookieConsentBanner';
import './globals.css';

const notoSansJp = Noto_Sans_JP({
  subsets: ['latin'],
  variable: '--font-body-jp',
  weight: ['400', '500', '700']
});

const ibmPlexSansJp = IBM_Plex_Sans_JP({
  subsets: ['latin'],
  variable: '--font-kpi-jp',
  weight: ['400', '500', '600', '700']
});

const baseUrl = process.env.SITE_URL || 'http://localhost:3000';
const metadataBase = (() => {
  try {
    return new URL(baseUrl);
  } catch {
    return new URL('http://localhost:3000');
  }
})();
const defaultOgImage = '/og-default.png';

export const metadata: Metadata = {
  metadataBase,
  title: process.env.NEXT_PUBLIC_SITE_NAME || 'Copper-for-me',
  description: '銅市場・建値・為替などの関連データを整理して発信するメディアサイト',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png'
  },
  appleWebApp: {
    title: process.env.NEXT_PUBLIC_SITE_NAME || 'Copper-for-me',
    capable: true,
    statusBarStyle: 'default'
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
    title: process.env.NEXT_PUBLIC_SITE_NAME || 'Copper-for-me',
    description: '銅市場・建値・為替などの関連データを整理して発信するメディアサイト',
    images: [
      {
        url: defaultOgImage,
        width: 1200,
        height: 630,
        alt: process.env.NEXT_PUBLIC_SITE_NAME || 'Copper-for-me'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: process.env.NEXT_PUBLIC_SITE_NAME || 'Copper-for-me',
    description: '銅市場・建値・為替などの関連データを整理して発信するメディアサイト',
    images: [defaultOgImage]
  }
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const adsenseClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: process.env.NEXT_PUBLIC_SITE_NAME || 'Copper-for-me',
    url: baseUrl
  };
  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: process.env.NEXT_PUBLIC_SITE_NAME || 'Copper-for-me',
    url: baseUrl
  };

  return (
    <html lang="ja" className={`${notoSansJp.variable} ${ibmPlexSansJp.variable}`}>
      <body>
        {gaMeasurementId ? (
          <>
            <Script
              id="gtag-src"
              async
              strategy="afterInteractive"
              src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
            />
            <Script id="gtag-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaMeasurementId}');
              `}
            </Script>
          </>
        ) : null}
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
        <a href="#" className="cf-scroll-top cf-scroll-top--always" aria-label="ページ上部へ戻る">
          ↑
        </a>
        <CookieConsentBanner />
      </body>
    </html>
  );
}
