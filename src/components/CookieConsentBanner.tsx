'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

const CONSENT_KEY = 'cf_cookie_consent_v1';

type ConsentValue = 'accepted' | 'rejected';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function loadGaOnce(measurementId: string) {
  if (typeof window === 'undefined') return;
  if (!measurementId) return;
  if (document.getElementById('ga4-script')) return;

  const script = document.createElement('script');
  script.id = 'ga4-script';
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag(...args: unknown[]) {
    window.dataLayer?.push(args);
  };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, { anonymize_ip: true });
}

export default function CookieConsentBanner() {
  const pathname = usePathname();
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '';
  const hasGa = useMemo(() => Boolean(measurementId), [measurementId]);
  const [consent, setConsent] = useState<ConsentValue | null>(null);
  const firstSeg = (pathname || '/').split('/').filter(Boolean)[0];
  const policyHref = firstSeg ? `/${firstSeg}/blog/privacypolicy` : '/blog/privacypolicy';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(CONSENT_KEY);
    if (saved === 'accepted' || saved === 'rejected') {
      setConsent(saved);
      if (saved === 'accepted' && hasGa) {
        loadGaOnce(measurementId);
      }
    }
  }, [hasGa, measurementId]);

  const handleAccept = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CONSENT_KEY, 'accepted');
    }
    setConsent('accepted');
    if (hasGa) {
      loadGaOnce(measurementId);
    }
  };

  const handleReject = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CONSENT_KEY, 'rejected');
    }
    setConsent('rejected');
  };

  if (consent) return null;

  return (
    <aside className="cf-cookie-banner" role="dialog" aria-live="polite" aria-label="Cookie同意設定">
      <p className="cf-cookie-text">
        当サイトは、利用状況の分析と改善のためにCookieを使用します。詳細は
        {' '}
        <a href={policyHref}>プライバシーポリシー</a>
        {' '}
        を確認してください。
      </p>
      <div className="cf-cookie-actions">
        <button type="button" className="cf-cookie-btn ghost" onClick={handleReject}>
          同意しない
        </button>
        <button type="button" className="cf-cookie-btn primary" onClick={handleAccept}>
          同意する
        </button>
      </div>
    </aside>
  );
}
