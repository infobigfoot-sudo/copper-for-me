'use client';

import { useEffect, useMemo, useState } from 'react';

const CONSENT_KEY = 'cf_cookie_consent_v1';

type ConsentValue = 'accepted' | 'rejected';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function updateGaConsent(measurementId: string, granted: boolean) {
  if (typeof window === 'undefined' || !measurementId || !window.gtag) return;
  window.gtag?.('consent', 'update', {
    analytics_storage: granted ? 'granted' : 'denied',
  });
  if (granted) {
    window.gtag?.('config', measurementId, {
      anonymize_ip: true,
      page_location: window.location.href,
      page_path: window.location.pathname,
      page_title: document.title,
    });
  }
}

function readSavedConsent(): ConsentValue | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = window.localStorage.getItem(CONSENT_KEY);
    return saved === 'accepted' || saved === 'rejected' ? saved : null;
  } catch {
    return null;
  }
}

function saveConsent(value: ConsentValue) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // ignore storage failures and keep in-memory consent for this session
  }
}

export default function CookieConsentBanner() {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '';
  const hasGa = useMemo(() => Boolean(measurementId), [measurementId]);
  const [checked, setChecked] = useState(false);
  const [consent, setConsent] = useState<ConsentValue | null>(null);
  const policyHref = '/blog/privacypolicy';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = readSavedConsent();
    if (saved) {
      setConsent(saved);
      if (hasGa) {
        updateGaConsent(measurementId, saved === 'accepted');
      }
    }
    setChecked(true);
  }, [hasGa, measurementId]);

  const handleAccept = () => {
    saveConsent('accepted');
    setConsent('accepted');
    if (hasGa) {
      updateGaConsent(measurementId, true);
    }
  };

  const handleReject = () => {
    saveConsent('rejected');
    setConsent('rejected');
    if (hasGa) {
      updateGaConsent(measurementId, false);
    }
  };

  if (!checked || consent) return null;

  return (
    <aside
      className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] md:bottom-4 z-[1200] w-[min(560px,calc(100vw-32px))] rounded-xl border border-slate-200 bg-white/95 p-4 text-slate-900 shadow-2xl backdrop-blur"
      role="dialog"
      aria-live="polite"
      aria-label="Cookie同意設定"
    >
      <p className="m-0 text-xs leading-relaxed text-slate-600">
        当サイトは、利用状況の分析と改善のために解析 Cookie を使用します。同意内容はこのブラウザに保存されます。詳細は
        {' '}
        <a href={policyHref} className="text-cyan-700 underline underline-offset-2 hover:text-cyan-600">プライバシーポリシー</a>
        {' '}
        を確認してください。
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-200"
          onClick={handleReject}
        >
          同意しない
        </button>
        <button
          type="button"
          className="rounded-lg border border-emerald-300 bg-emerald-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-600"
          onClick={handleAccept}
        >
          同意する
        </button>
      </div>
    </aside>
  );
}
