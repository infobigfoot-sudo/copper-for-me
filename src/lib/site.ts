const fixedSite = 'a';

export const SITE_KEYS = [fixedSite] as const;
export type SiteKey = (typeof SITE_KEYS)[number];

export function normalizeSite(value?: string): SiteKey {
  const v = String(value || fixedSite).toLowerCase();
  if (v === fixedSite) return fixedSite;
  return fixedSite;
}

export function siteLabel(site: SiteKey): string {
  if (site === 'a') return 'A: 非鉄金属・株価・市況';
  if (site === 'b') return 'B: EC・アフィリエイト・SNS';
  return 'C: やさしいニュース解説';
}
