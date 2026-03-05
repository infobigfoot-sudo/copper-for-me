import type { CSSProperties } from 'react';

export type NavKey =
  | 'top'
  | 'lme'
  | 'tatene'
  | 'indicators'
  | 'supply-chain'
  | 'prediction'
  | 'article'
  | 'tatene-calculator';

export type NavIconKey =
  | 'overview'
  | 'lme'
  | 'tatene'
  | 'indicators'
  | 'other'
  | 'supply'
  | 'prediction'
  | 'article'
  | 'calculator';

export type NativeNavLink = {
  href: string;
  key: NavKey;
  label: string;
  icon: NavIconKey;
};

export const PRIMARY_NAV_LINKS: NativeNavLink[] = [
  { href: '/', key: 'top', label: '概要', icon: 'overview' },
  { href: '/lme', key: 'lme', label: 'LME', icon: 'lme' },
  { href: '/tatene', key: 'tatene', label: '建値', icon: 'tatene' },
  { href: '/indicators', key: 'indicators', label: '指標', icon: 'indicators' },
];

export const OTHER_NAV_LINKS: NativeNavLink[] = [
  { href: '/supply-chain', key: 'supply-chain', label: '供給と需要', icon: 'supply' },
  { href: '/prediction', key: 'prediction', label: '予測', icon: 'prediction' },
  { href: '/article', key: 'article', label: '記事', icon: 'article' },
  { href: '/tatene-calculator', key: 'tatene-calculator', label: '建値計算', icon: 'calculator' },
];

export function isOtherNavKey(key: NavKey): boolean {
  return key === 'supply-chain' || key === 'prediction' || key === 'article' || key === 'tatene-calculator';
}

export function isOtherNavPath(pathname: string): boolean {
  const path = String(pathname || '/');
  return OTHER_NAV_LINKS.some((item) => path === item.href || path.startsWith(`${item.href}/`));
}

export function NativeNavIcon({
  icon,
  className,
  style,
  strokeWidth = 1.9,
}: {
  icon: NavIconKey;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}) {
  if (icon === 'overview') {
    return (
      <svg viewBox="0 0 24 24" className={className} style={style} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3.5 10.2 12 3.8l8.5 6.4" />
        <path d="M5.5 9.8V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.8" />
        <path d="M9.3 20v-5.4a1 1 0 0 1 1-1h3.4a1 1 0 0 1 1 1V20" />
      </svg>
    );
  }
  if (icon === 'lme') {
    return (
      <svg viewBox="0 0 24 24" className={className} style={style} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 16.5h16" />
        <path d="m5.5 14.5 4.2-4.2 3.1 3.1 5.7-6.1" />
      </svg>
    );
  }
  if (icon === 'tatene') {
    return (
      <svg viewBox="0 0 24 24" className={className} style={style} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 4.2v15.6" />
        <path d="M8.2 8.8h7.6" />
        <path d="M7.5 12h9" />
        <path d="M7.8 19.2h8.4" />
      </svg>
    );
  }
  if (icon === 'indicators') {
    return (
      <svg viewBox="0 0 24 24" className={className} style={style} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3.5" y="5" width="17" height="14" rx="1.8" />
        <path d="M8 15v-4" />
        <path d="M12 15V9" />
        <path d="M16 15v-6" />
      </svg>
    );
  }
  if (icon === 'supply') {
    return (
      <svg viewBox="0 0 24 24" className={className} style={style} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 8h16" />
        <path d="M7 8V5.8h10V8" />
        <path d="M6.2 18h11.6" />
        <path d="M8.2 8v10" />
        <path d="M12 8v10" />
        <path d="M15.8 8v10" />
      </svg>
    );
  }
  if (icon === 'prediction') {
    return (
      <svg viewBox="0 0 24 24" className={className} style={style} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 17h16" />
        <path d="m6 14 4-4 3 2 5-6" />
        <path d="m16.5 6 1.5-.2-.2 1.5" />
      </svg>
    );
  }
  if (icon === 'article') {
    return (
      <svg viewBox="0 0 24 24" className={className} style={style} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="4.5" width="14" height="15" rx="1.8" />
        <path d="M8 9h8" />
        <path d="M8 12.5h8" />
        <path d="M8 16h5" />
      </svg>
    );
  }
  if (icon === 'calculator') {
    return (
      <svg viewBox="0 0 24 24" className={className} style={style} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="6" y="3.5" width="12" height="17" rx="1.8" />
        <rect x="8.5" y="6.5" width="7" height="3.5" rx="0.8" />
        <path d="M9 13h1.2" />
        <path d="M12 13h1.2" />
        <path d="M15 13h.1" />
        <path d="M9 16.2h1.2" />
        <path d="M12 16.2h1.2" />
        <path d="M15 16.2h.1" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.5" y="5" width="15" height="14" rx="1.8" />
      <path d="M8 10h8" />
      <path d="M8 14h8" />
    </svg>
  );
}
