import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';

import CookieConsentBanner from '@/components/CookieConsentBanner';
import './globals.css';

const baseUrl = process.env.SITE_URL || 'https://copper-for-me.com';
const metadataBase = (() => {
  try {
    return new URL(baseUrl);
  } catch {
    return new URL('https://copper-for-me.com');
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

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Noto+Sans+JP:wght@300;400;500;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
        {gaMeasurementId ? (
          <>
            <Script id="ga-consent-default" strategy="beforeInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                window.gtag = window.gtag || gtag;
                gtag('consent', 'default', { analytics_storage: 'denied' });
                gtag('js', new Date());
                gtag('config', '${gaMeasurementId}', { anonymize_ip: true });
              `}
            </Script>
            <Script
              id="ga4-script"
              strategy="afterInteractive"
              src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
            />
          </>
        ) : null}
      </head>
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
