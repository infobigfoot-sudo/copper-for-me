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
    description: '銅市場・建値・為替などの関連データを整理して発信するメディアサイト'
  },
  twitter: {
    card: 'summary_large_image',
    title: process.env.NEXT_PUBLIC_SITE_NAME || 'Copper-for-me',
    description: '銅市場・建値・為替などの関連データを整理して発信するメディアサイト'
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
    <html lang="ja">
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
        <CookieConsentBanner />
      </body>
    </html>
  );
}
