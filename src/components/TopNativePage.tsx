import Link from 'next/link';

import CurrentJstTime from '@/components/CurrentJstTime';
import MobileBottomNavClient from '@/components/native/MobileBottomNavClient';
import { OTHER_NAV_LINKS, PRIMARY_NAV_LINKS } from '@/components/native/nav';
import TopTrendChart from '@/components/native/TopTrendChart';
import TopTrendDataTable from '@/components/native/TopTrendDataTable';
import DataDisclaimerBlock from '@/components/native/DataDisclaimerBlock';
import { convertJpyMtSeriesToJpyKg, convertUsdMtSeriesToJpyKg } from '@/lib/copper_units';
import { getPosts } from '@/lib/microcms';
import { normalizeSeries, readMergedPublishSeriesBundle } from '@/lib/publish_series_bundle';
import { readPredictionSummary } from '@/lib/prediction_summary';

type SeriesPoint = { date: string; value: number };

function fmtNum(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return '-';
  return value.toLocaleString('ja-JP', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function roundImpactsToTateneDiff(
  tateneDiffMtRaw: number | null,
  lmeImpactMtRaw: number | null,
  fxImpactMtRaw: number | null,
  costImpactMtRaw: number | null
): {
  tateneDiffMt: number | null;
  lmeImpactMt: number | null;
  fxImpactMt: number | null;
  costImpactMt: number | null;
} {
  const hasAll =
    tateneDiffMtRaw !== null &&
    lmeImpactMtRaw !== null &&
    fxImpactMtRaw !== null &&
    costImpactMtRaw !== null &&
    Number.isFinite(tateneDiffMtRaw) &&
    Number.isFinite(lmeImpactMtRaw) &&
    Number.isFinite(fxImpactMtRaw) &&
    Number.isFinite(costImpactMtRaw);
  if (!hasAll) {
    return {
      tateneDiffMt: tateneDiffMtRaw !== null && Number.isFinite(tateneDiffMtRaw) ? Math.round(tateneDiffMtRaw) : null,
      lmeImpactMt: lmeImpactMtRaw !== null && Number.isFinite(lmeImpactMtRaw) ? Math.round(lmeImpactMtRaw) : null,
      fxImpactMt: fxImpactMtRaw !== null && Number.isFinite(fxImpactMtRaw) ? Math.round(fxImpactMtRaw) : null,
      costImpactMt: costImpactMtRaw !== null && Number.isFinite(costImpactMtRaw) ? Math.round(costImpactMtRaw) : null,
    };
  }
  const tateneDiffMt = Math.round(tateneDiffMtRaw);
  const lmeImpactMt = Math.round(lmeImpactMtRaw);
  const fxImpactMt = Math.round(fxImpactMtRaw);
  // 表示丸め後も「建値差分 = LME + 為替 + 諸コスト」が必ず成立するよう残差を吸収。
  const costImpactMt = tateneDiffMt - lmeImpactMt - fxImpactMt;
  return { tateneDiffMt, lmeImpactMt, fxImpactMt, costImpactMt };
}

function latestPair(rows: SeriesPoint[]): {
  latest: SeriesPoint | null;
  prev: SeriesPoint | null;
} {
  if (!rows.length) return { latest: null, prev: null };
  return {
    latest: rows[rows.length - 1] ?? null,
    prev: rows.length > 1 ? rows[rows.length - 2] : null
  };
}

function miniBar(values: number[], type: 'up' | 'down') {
  const v = values.length ? values : [0, 0, 0, 0, 0, 0];
  const max = Math.max(...v.map((x) => Math.abs(x))) || 1;
  return v.map((n, i) => {
    const h = Math.max(22, Math.round((Math.abs(n) / max) * 95));
    const cls = i === v.length - 1 ? (type === 'up' ? 'bg-[#0f6d6a]' : 'bg-[#c08a73]') : 'bg-[#e3ddd4]';
    return <div key={i} className={`${cls} flex-1 rounded-sm`} style={{ height: `${h}%` }} />;
  });
}

const BADGE_NEUTRAL = 'text-[#5f6b7a] bg-[#f2eee8] border border-[#ddd5ca]';
const BADGE_GREEN = 'text-[#0f6d6a] bg-[#e8f1ee] border border-[#cfe0da]';
const BADGE_RED = 'text-[#b86d53] bg-[#f6ece8] border border-[#e6d1c9]';

type BadgeDecision = { text: string; className: string };

function tateneDirectionBadge(tateneDiffMt: number | null): BadgeDecision {
  if (tateneDiffMt === null || !Number.isFinite(tateneDiffMt)) return { text: '-', className: BADGE_NEUTRAL };
  if (tateneDiffMt >= 0) return { text: 'UP↑', className: BADGE_GREEN };
  return { text: 'DOWN↓', className: BADGE_RED };
}

function impactContributionBadge(impactMt: number | null, tateneDiffMt: number | null): BadgeDecision {
  if (impactMt === null || !Number.isFinite(impactMt)) {
    return { text: '-', className: BADGE_NEUTRAL };
  }
  if (impactMt >= 0) {
    if (tateneDiffMt !== null && Number.isFinite(tateneDiffMt) && tateneDiffMt < 0) {
      return { text: '下支え↑', className: BADGE_GREEN };
    }
    return { text: '上昇要因↑', className: BADGE_GREEN };
  }
  return { text: '下降要因↓', className: BADGE_RED };
}

function scoreFromPct(pct: number | null): number {
  if (pct === null || !Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, Math.abs(pct)));
}

function monthKey(dateText: string): string {
  return String(dateText || '').slice(0, 7);
}

function normalizeYm(ym: string): string {
  const [yText, mText] = ym.split('-');
  const year = Number(yText);
  const month = Number(mText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return ym;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

function previousMonthYm(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const prevMonth = month - 1;
  if (prevMonth >= 1) return `${String(year).padStart(4, '0')}-${String(prevMonth).padStart(2, '0')}`;
  return `${String(year - 1).padStart(4, '0')}-12`;
}

function toMonthlyAverage(rows: SeriesPoint[]): SeriesPoint[] {
  const cutoffYm = previousMonthYm();
  const buckets = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    const ym = normalizeYm(String(row.date || '').slice(0, 7));
    if (!/^\d{4}-\d{2}$/.test(ym) || !Number.isFinite(row.value)) continue;
    if (ym > cutoffYm) continue;
    const bucket = buckets.get(ym) ?? { sum: 0, count: 0 };
    bucket.sum += row.value;
    bucket.count += 1;
    buckets.set(ym, bucket);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => ({ date, value: bucket.sum / bucket.count }))
    .filter((row) => Number.isFinite(row.value));
}

function toMonthlyAverageForwardFilled(rows: SeriesPoint[]): SeriesPoint[] {
  const cutoffYm = previousMonthYm();
  const normalized = rows
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(String(row.date || '')) && Number.isFinite(row.value))
    .map((row) => ({ date: row.date, value: row.value }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!normalized.length) return [];

  const valueByDate = new Map<string, number>();
  for (const row of normalized) valueByDate.set(row.date, row.value);

  const firstDate = normalized[0].date;
  const cutoffDate = `${cutoffYm}-31`;
  const monthBuckets = new Map<string, { sum: number; count: number }>();
  let carry: number | null = null;

  const start = new Date(`${firstDate}T00:00:00Z`);
  const end = new Date(`${cutoffDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const date = `${y}-${m}-${day}`;
    const ym = `${y}-${m}`;
    if (ym > cutoffYm) break;

    const direct = valueByDate.get(date);
    if (direct !== undefined) carry = direct;
    if (carry === null) continue;

    const bucket = monthBuckets.get(ym) ?? { sum: 0, count: 0 };
    bucket.sum += carry;
    bucket.count += 1;
    monthBuckets.set(ym, bucket);
  }

  return Array.from(monthBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => ({ date, value: bucket.sum / bucket.count }))
    .filter((row) => Number.isFinite(row.value));
}

function toMonthlyRows(rows: SeriesPoint[]): SeriesPoint[] {
  const cutoffYm = previousMonthYm();
  const map = new Map<string, number>();
  for (const row of rows) {
    const ym = normalizeYm(String(row.date || '').slice(0, 7));
    if (!/^\d{4}-\d{2}$/.test(ym) || !Number.isFinite(row.value)) continue;
    if (ym > cutoffYm) continue;
    // 同月に複数点があれば後勝ち。
    map.set(ym, row.value);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
}

function mergeMonthlySeries(baseRows: SeriesPoint[], overrideRows: SeriesPoint[]): SeriesPoint[] {
  const map = new Map<string, number>();
  for (const row of baseRows) map.set(row.date, row.value);
  for (const row of overrideRows) map.set(row.date, row.value);
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
}

function sumSeriesByDate(rowsList: SeriesPoint[][]): SeriesPoint[] {
  const map = new Map<string, number>();
  for (const rows of rowsList) {
    for (const row of rows) {
      if (!row?.date || !Number.isFinite(row.value)) continue;
      map.set(row.date, (map.get(row.date) || 0) + row.value);
    }
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
}

function pointAtOrBeforeDate(rows: SeriesPoint[], date: string): SeriesPoint | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].date <= date) return rows[i];
  }
  return null;
}

export default async function TopNativePage() {
  const [bundle, prediction, latestPosts] = await Promise.all([
    readMergedPublishSeriesBundle(),
    readPredictionSummary(),
    getPosts(1, 'a')
      .then((res) => (res?.contents?.length ? res : getPosts(1).catch(() => ({ contents: [] as Array<{ title?: string; slug?: string; id?: string }> }))))
      .catch(() => getPosts(1).catch(() => ({ contents: [] as Array<{ title?: string; slug?: string; id?: string }> }))),
  ]);
  const series = bundle?.series || {};
  const latestArticle = latestPosts?.contents?.[0] || null;
  const latestArticleTitle = String(latestArticle?.title || '-');
  const latestArticleHref =
    latestArticle?.slug || latestArticle?.id ? `/blog/${latestArticle?.slug || latestArticle?.id}` : null;
  const usdjpyRows = normalizeSeries(series.america_dexjpus);
  const usdjpyNakaneRows = normalizeSeries(series.japan_usd_jpy_nakane_daily);
  const impactFxRows = usdjpyNakaneRows.length ? usdjpyNakaneRows : usdjpyRows;
  const lmeCashUsdRows = normalizeSeries(series.lme_copper_cash_usd_t);
  const lme3mUsdRows = normalizeSeries(series.lme_copper_3month_usd_t).map((row) => ({
    ...row,
    value: row.value > 200000 ? row.value / 100 : row.value,
  }));
  const lmeCashRows = convertUsdMtSeriesToJpyKg(lmeCashUsdRows, usdjpyRows);
  const lme3mRows = convertUsdMtSeriesToJpyKg(lme3mUsdRows, usdjpyRows);
  const rawMaterialExportRows = normalizeSeries(series.trade_raw_material_export_wan_t);
  const chileRawMaterialExportRows = normalizeSeries(series.trade_chile_hs2603_export_wan_t);
  const peruRawMaterialExportRows = normalizeSeries(series.trade_peru_hs2603_export_wan_t);
  const worldRawMaterialExportRows = normalizeSeries(series.trade_world_raw_material_export_wan_t);
  const topRawMaterialExportRows = rawMaterialExportRows.length
    ? rawMaterialExportRows
    : chileRawMaterialExportRows.length || peruRawMaterialExportRows.length
      ? sumSeriesByDate([chileRawMaterialExportRows, peruRawMaterialExportRows])
      : worldRawMaterialExportRows;
  const japanDomesticDemandRows = normalizeSeries(
    series.trade_japan_hs7403_11_import_wan_t || series.trade_japan_hs7403_import_wan_t
  );
  const tateneMtRows = normalizeSeries(series.japan_tatene_jpy_t);
  const tateneMonthlyAvgRows = normalizeSeries(series.japan_tatene_monthly_avg_jpy_t);
  const wbCopperUsdRows = normalizeSeries(series.cmo_pink_sheet_copper_usd_t);
  const tateRows = convertJpyMtSeriesToJpyKg(tateneMtRows);
  const topTrendTateneRows = tateneMonthlyAvgRows.length
    ? toMonthlyRows(tateneMonthlyAvgRows)
    : toMonthlyAverageForwardFilled(tateneMtRows);
  const topTrendLmeUsdRows = mergeMonthlySeries(
    toMonthlyRows(wbCopperUsdRows),
    toMonthlyAverage(lmeCashUsdRows)
  );
  const topTrendUsdJpyRows = toMonthlyAverage(usdjpyRows);

  const tate = latestPair(tateRows);

  const marketAnchorDate = tate.latest?.date ?? null;
  const marketPrevAnchorDate = tate.prev?.date ?? null;
  const lmeAtAnchorPoint = marketAnchorDate ? pointAtOrBeforeDate(lmeCashUsdRows, marketAnchorDate) : null;
  const lmeAtPrevAnchorPoint = marketPrevAnchorDate
    ? pointAtOrBeforeDate(lmeCashUsdRows, marketPrevAnchorDate)
    : null;
  const fxAtAnchorPoint = marketAnchorDate ? pointAtOrBeforeDate(impactFxRows, marketAnchorDate) : null;
  const fxAtPrevAnchorPoint = marketPrevAnchorDate
    ? pointAtOrBeforeDate(impactFxRows, marketPrevAnchorDate)
    : null;
  const lmeAtAnchor = lmeAtAnchorPoint?.value ?? null;
  const lmeAtPrevAnchor = lmeAtPrevAnchorPoint?.value ?? null;
  const fxAtAnchor = fxAtAnchorPoint?.value ?? null;
  const fxAtPrevAnchor = fxAtPrevAnchorPoint?.value ?? null;
  const lmeImpactDateLabel = lmeAtAnchorPoint?.date ?? '-';
  const fxImpactDateLabel = fxAtAnchorPoint?.date ?? '-';
  const costImpactDateLabel = marketAnchorDate ?? '-';
  const tateneDiff =
    tate.latest && tate.prev && Number.isFinite(tate.latest.value) && Number.isFinite(tate.prev.value)
      ? tate.latest.value - tate.prev.value
      : null;
  const lmeMarketImpact =
    lmeAtAnchor !== null && lmeAtPrevAnchor !== null && fxAtPrevAnchor !== null
      ? ((lmeAtAnchor - lmeAtPrevAnchor) * fxAtPrevAnchor) / 1000
      : null;
  const fxImpact =
    lmeAtAnchor !== null && fxAtAnchor !== null && fxAtPrevAnchor !== null
      ? (lmeAtAnchor * (fxAtAnchor - fxAtPrevAnchor)) / 1000
      : null;
  const costImpact =
    tate.latest && tate.prev && lmeAtAnchor !== null && fxAtAnchor !== null && lmeAtPrevAnchor !== null && fxAtPrevAnchor !== null
      ? (tate.latest.value - (lmeAtAnchor * fxAtAnchor) / 1000) -
        (tate.prev.value - (lmeAtPrevAnchor * fxAtPrevAnchor) / 1000)
      : null;
  const tateneDiffMtRaw = tateneDiff !== null ? tateneDiff * 1000 : null;
  const lmeMarketImpactMtRaw = lmeMarketImpact !== null ? lmeMarketImpact * 1000 : null;
  const fxImpactMtRaw = fxImpact !== null ? fxImpact * 1000 : null;
  const costImpactMtRaw = costImpact !== null ? costImpact * 1000 : null;
  const roundedImpacts = roundImpactsToTateneDiff(
    tateneDiffMtRaw,
    lmeMarketImpactMtRaw,
    fxImpactMtRaw,
    costImpactMtRaw
  );
  const tateneDiffMt = roundedImpacts.tateneDiffMt;
  const lmeMarketImpactMt = roundedImpacts.lmeImpactMt;
  const fxImpactMt = roundedImpacts.fxImpactMt;
  const costImpactMt = roundedImpacts.costImpactMt;
  const tateneDiffBadge = tateneDirectionBadge(tateneDiffMt);
  const lmeImpactBadge = impactContributionBadge(lmeMarketImpactMt, tateneDiffMt);
  const fxImpactBadge = impactContributionBadge(fxImpactMt, tateneDiffMt);
  const costImpactBadge = impactContributionBadge(costImpactMt, tateneDiffMt);
  const rawExportRows = Array.from(
    new Map(
      topRawMaterialExportRows
        .map((row) => [monthKey(row.date), row.value] as const)
    ).entries()
  )
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ym, value]) => ({ ym, value }))
    .filter((row) => Number.isFinite(row.value));
  const rawExportLatest = rawExportRows.length ? rawExportRows[rawExportRows.length - 1] : null;
  const rawExportPrev = rawExportRows.length >= 2 ? rawExportRows[rawExportRows.length - 2] : null;
  const rawExportDeltaPct =
    rawExportLatest && rawExportPrev && rawExportPrev.value !== 0
      ? ((rawExportLatest.value - rawExportPrev.value) / Math.abs(rawExportPrev.value)) * 100
      : null;
  const rawExportScore = scoreFromPct(rawExportDeltaPct);
  const rawExportUp = rawExportDeltaPct !== null && rawExportDeltaPct >= 0;

  const domesticDemandRows = japanDomesticDemandRows
    .map((r) => ({ ym: monthKey(r.date), value: r.value }))
    .sort((a, b) => a.ym.localeCompare(b.ym));
  const domesticDemandLatest =
    domesticDemandRows.length ? domesticDemandRows[domesticDemandRows.length - 1] : null;
  const domesticDemandPrev =
    domesticDemandRows.length >= 2 ? domesticDemandRows[domesticDemandRows.length - 2] : null;
  const domesticDemandByYm = new Map(domesticDemandRows.map((row) => [normalizeYm(row.ym), row.value] as const));
  const domesticDemandJan2026 = domesticDemandByYm.get('2026-01');
  const domesticDemandDec2025 = domesticDemandByYm.get('2025-12');
  const hasPinnedDomesticDemandPair =
    domesticDemandJan2026 !== undefined &&
    domesticDemandDec2025 !== undefined &&
    Number.isFinite(domesticDemandJan2026) &&
    Number.isFinite(domesticDemandDec2025);
  const domesticDemandLatestForDelta = hasPinnedDomesticDemandPair
    ? { ym: '2026-01', value: domesticDemandJan2026 }
    : domesticDemandLatest;
  const domesticDemandPrevForDelta = hasPinnedDomesticDemandPair
    ? { ym: '2025-12', value: domesticDemandDec2025 }
    : domesticDemandPrev;
  const domesticDemandDeltaPct =
    domesticDemandLatestForDelta && domesticDemandPrevForDelta && domesticDemandPrevForDelta.value !== 0
      ? ((domesticDemandLatestForDelta.value - domesticDemandPrevForDelta.value) / Math.abs(domesticDemandPrevForDelta.value)) * 100
      : null;
  const domesticDemandScore = scoreFromPct(domesticDemandDeltaPct);
  const domesticDemandUp = domesticDemandDeltaPct !== null && domesticDemandDeltaPct >= 0;
  const rawExportPeriodText =
    rawExportPrev && rawExportLatest
      ? `期間：${rawExportPrev.ym}〜${rawExportLatest.ym}`
      : '期間：-';
  const domesticDemandPeriodText =
    domesticDemandPrevForDelta && domesticDemandLatestForDelta
      ? `期間：${normalizeYm(domesticDemandPrevForDelta.ym)}〜${normalizeYm(domesticDemandLatestForDelta.ym)}`
      : '期間：-';

  const lmeMaeDiffPct =
    prediction?.premiumProxyDevPct !== null && prediction?.premiumProxyDevPct !== undefined
      ? Number(prediction.premiumProxyDevPct) * 100
      : null;
  const lmeMaeScore = scoreFromPct(lmeMaeDiffPct);
  const lmeMaeUp = lmeMaeDiffPct !== null && lmeMaeDiffPct >= 0;
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f7f3ec] via-[#efe7dc] to-[#f9f6f0] text-[#0f172a]">
      <nav className="sticky top-0 z-50 border-b border-[#e6dfd3] bg-[#f3f1ed]/95 backdrop-blur-xl">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
          <div className="flex w-full items-center gap-4">
            <div className="flex flex-col">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-off-white">
                <Link href="/">COPPER FOR ME</Link>
              </h1>
              <span className="text-[9px] uppercase tracking-[0.4em] text-cool-grey font-bold">daily copper learning</span>
            </div>
            <div className="hidden md:flex flex-1 items-center justify-end gap-6 text-xs font-bold uppercase tracking-widest text-cool-grey">
              {PRIMARY_NAV_LINKS.map((item) => (
                <Link
                  key={`top-nav-${item.href}`}
                  href={item.href}
                  className={item.href === '/' ? 'nav-link-active' : 'hover:text-positive transition-all'}
                >
                  {item.label}
                </Link>
              ))}
              <details className="relative group">
                <summary className="list-none cursor-pointer select-none [&::-webkit-details-marker]:hidden hover:text-positive transition-all">
                  その他
                </summary>
                <div className="absolute right-0 top-full mt-3 w-44 rounded-xl border border-[#d9d2c6] bg-[#f9f7f3] p-2 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                  {OTHER_NAV_LINKS.map((item) => (
                    <Link
                      key={`top-other-${item.href}`}
                      href={item.href}
                      className="block rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-cool-grey hover:bg-white/70 hover:text-[#1f3a5f]"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </details>
              <Link
                href="/tatene-calculator"
                className="inline-flex items-center justify-center rounded-lg border border-[#285949] bg-[#2f6d5a] px-4 py-2 text-[10px] font-black tracking-[0.2em] text-white"
              >
                国内建値計算
              </Link>
            </div>
          </div>
        </div>
      </nav>
      <main className="main-unified-14 max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 pb-24 md:pb-4">
        <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,460px)] lg:items-end">
          <div className="max-w-3xl">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 leading-tight text-off-white">
              Copper Insights
            </h2>
            <p className="text-cool-grey text-base sm:text-lg max-w-2xl leading-relaxed">
              銅市場を読み解く主要指標を統合表示。
              <br />
              LME・国内建値・為替・需給データをもとに、相場変動の背景を可視化。
            </p>
          </div>
          <div className="w-full">
            <div className="glass-card p-4 rounded-xl min-w-0 text-left sm:text-right">
              <p className="text-[10px] font-bold text-cool-grey uppercase tracking-tighter mb-1">基準時刻</p>
              <CurrentJstTime />
            </div>
          </div>
        </div>

        <div className="mb-4 glass-card rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <p className="flex-1 text-xs sm:text-sm font-medium text-cool-grey text-left line-clamp-1">
            最新記事：
            {latestArticleHref ? (
              <Link href={latestArticleHref} className="ml-1 font-bold text-[#1f3a5f] hover:text-positive hover:underline">
                {latestArticleTitle}
              </Link>
            ) : (
              <span className="ml-1">{latestArticleTitle}</span>
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="glass-card glass-card-hover relative p-4 sm:p-6 rounded-2xl transition-all group">
            <div className={`metric-badge-top-right text-right text-xs sm:text-sm font-bold px-2 sm:px-3 py-1 rounded-full ${tateneDiffBadge.className}`}>{tateneDiffBadge.text}</div>
            <div className="mb-6 pt-7 sm:pt-8 min-h-[3.2rem]">
              <span
                title="国内建値の増減"
                className="block text-[14px] leading-snug font-black text-cool-grey uppercase tracking-[0.2em] break-words overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]"
              >
                国内建値の増減
              </span>
            </div>
            <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-baseline sm:gap-4 mb-4 sm:mb-6">
              <h4 className="text-xl sm:text-3xl font-bold tracking-tight text-off-white">{fmtNum(tateneDiffMt, 0)}</h4>
              <span className="text-cool-grey text-[10px] sm:text-xs font-medium">JPY/mt</span>
            </div>
            <div className="h-12 w-full flex items-end gap-4 opacity-60">{miniBar(tateRows.slice(-7).map((r) => r.value), tateneDiff !== null && tateneDiff >= 0 ? 'up' : 'down')}</div>
            <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-cool-grey text-right">{tate.latest?.date || '-'}</p>
          </div>
          <div className="glass-card glass-card-hover relative p-4 sm:p-6 rounded-2xl transition-all group">
            <div className={`metric-badge-top-right text-right text-xs sm:text-sm font-bold px-2 sm:px-3 py-1 rounded-full ${lmeImpactBadge.className}`}>{lmeImpactBadge.text}</div>
            <div className="mb-6 pt-7 sm:pt-8 min-h-[3.2rem]">
              <span
                title="LME市場の影響"
                className="block text-[14px] leading-snug font-black text-cool-grey uppercase tracking-[0.2em] break-words overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]"
              >
                ①LMEの影響
              </span>
            </div>
            <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-baseline sm:gap-4 mb-4 sm:mb-6">
              <h4 className="text-xl sm:text-3xl font-bold tracking-tight text-off-white">{fmtNum(lmeMarketImpactMt, 0)}</h4>
              <span className="text-cool-grey text-[10px] sm:text-xs font-medium">JPY/mt</span>
            </div>
            <div className="h-12 w-full flex items-end gap-4 opacity-60">{miniBar(lmeCashRows.slice(-7).map((r) => r.value), lmeMarketImpactMt !== null && lmeMarketImpactMt >= 0 ? 'up' : 'down')}</div>
            <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-cool-grey text-right">{lmeImpactDateLabel}</p>
          </div>
          <div className="glass-card glass-card-hover relative p-4 sm:p-6 rounded-2xl transition-all group">
            <div className={`metric-badge-top-right text-right text-xs sm:text-sm font-bold px-2 sm:px-3 py-1 rounded-full ${fxImpactBadge.className}`}>{fxImpactBadge.text}</div>
            <div className="mb-6 pt-7 sm:pt-8 min-h-[3.2rem]">
              <span
                title="USD/JPYの影響"
                className="block text-[14px] leading-snug font-black text-cool-grey uppercase tracking-[0.2em] break-words overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]"
              >
                ②為替の影響
              </span>
            </div>
            <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-baseline sm:gap-4 mb-4 sm:mb-6">
              <h4 className="text-xl sm:text-3xl font-bold tracking-tight text-off-white">{fmtNum(fxImpactMt, 0)}</h4>
              <span className="text-cool-grey text-[10px] sm:text-xs font-medium">JPY/mt</span>
            </div>
            <div className="h-12 w-full flex items-end gap-4 opacity-60">{miniBar(lme3mRows.slice(-7).map((r) => r.value), fxImpactMt !== null && fxImpactMt >= 0 ? 'up' : 'down')}</div>
            <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-cool-grey text-right">{fxImpactDateLabel}</p>
          </div>
          <div className="glass-card glass-card-hover relative p-4 sm:p-6 rounded-2xl transition-all group">
            <div className={`metric-badge-top-right text-right text-xs sm:text-sm font-bold px-2 sm:px-3 py-1 rounded-full ${costImpactBadge.className}`}>{costImpactBadge.text}</div>
            <div className="mb-6 pt-7 sm:pt-8 min-h-[3.2rem]">
              <span
                title="諸コスト"
                className="block text-[14px] leading-snug font-black text-cool-grey uppercase tracking-[0.2em] break-words overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]"
              >
                ③諸コストの影響
              </span>
            </div>
            <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-baseline sm:gap-4 mb-4 sm:mb-6">
              <h4 className="text-xl sm:text-3xl font-bold tracking-tight text-off-white">{fmtNum(costImpactMt, 0)}</h4>
              <span className="text-cool-grey text-[10px] sm:text-xs font-medium">JPY/mt</span>
            </div>
            <div className="h-12 w-full flex items-end gap-4 opacity-60">{miniBar(usdjpyRows.slice(-7).map((r) => r.value), costImpactMt !== null && costImpactMt >= 0 ? 'up' : 'down')}</div>
            <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-cool-grey text-right">{costImpactDateLabel}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <TopTrendChart
            tateneRows={topTrendTateneRows}
            lmeUsdRows={topTrendLmeUsdRows}
            usdJpyRows={topTrendUsdJpyRows}
            predictionLower={prediction?.lower ?? null}
            predictionUpper={prediction?.upper ?? null}
          />
          <TopTrendDataTable
            tateneRows={topTrendTateneRows}
            lmeUsdRows={topTrendLmeUsdRows}
            usdJpyRows={topTrendUsdJpyRows}
          />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              title: '原料輸出',
              score: rawExportScore,
              scoreText: rawExportDeltaPct === null ? '-' : `${rawExportDeltaPct >= 0 ? '+' : ''}${rawExportDeltaPct.toFixed(1)}%`,
              label: rawExportDeltaPct === null ? 'データなし' : rawExportUp ? '輸出増' : '輸出減',
              periodText: rawExportPeriodText,
              tone:
                rawExportDeltaPct === null
                  ? 'text-[#94a3b8]'
                  : rawExportUp
                    ? 'text-[#0f6d6a]'
                    : 'text-[#b86d53]',
              toneLabel:
                rawExportDeltaPct === null
                  ? 'text-[#94a3b8]'
                  : rawExportUp
                    ? 'text-[#0f6d6a]'
                    : 'text-[#b86d53]'
            },
            {
              title: '国内需要(7403.11)',
              score: domesticDemandScore,
              scoreText:
                domesticDemandDeltaPct === null
                  ? '-'
                  : `${domesticDemandDeltaPct >= 0 ? '+' : ''}${domesticDemandDeltaPct.toFixed(1)}%`,
              label:
                domesticDemandDeltaPct === null
                  ? 'データなし'
                  : domesticDemandUp
                    ? '需要増'
                    : '需要減',
              periodText: domesticDemandPeriodText,
              tone:
                domesticDemandDeltaPct === null
                  ? 'text-[#94a3b8]'
                  : domesticDemandUp
                    ? 'text-[#0f6d6a]'
                    : 'text-[#b86d53]',
              toneLabel:
                domesticDemandDeltaPct === null
                  ? 'text-[#94a3b8]'
                  : domesticDemandUp
                    ? 'text-[#0f6d6a]'
                    : 'text-[#b86d53]'
            },
            {
              title: 'LME MAE差',
              score: lmeMaeScore,
              scoreText: lmeMaeDiffPct === null ? '-' : `${Math.abs(lmeMaeDiffPct).toFixed(0)}%`,
              label: lmeMaeDiffPct === null ? 'データなし' : lmeMaeUp ? '上昇' : '低下',
              periodText: null,
              tone: 'text-[#1b4f63]',
              toneLabel: 'text-[#1b4f63]'
            }
          ].map((g) => {
            const r = 58;
            const c = 2 * Math.PI * r;
            const dashOffset = c * (1 - g.score / 100);
            return (
              <div key={g.title} className="glass-card relative p-4 pb-10 sm:p-8 sm:pb-12 rounded-3xl flex flex-col items-center border border-[#e6dfd3]">
                <h5 className="text-[14px] font-black text-cool-grey uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-6">{g.title}</h5>
                <div className="relative w-28 h-28 sm:w-40 sm:h-40 flex items-center justify-center rounded-full border-2 sm:border-4 border-[#ece7df]">
                  <svg className="w-24 h-24 sm:w-32 sm:h-32 -rotate-90" viewBox="0 0 128 128">
                    <circle className="text-[#dbd6cf]" cx="64" cy="64" fill="transparent" r={r} stroke="currentColor" strokeWidth="12" />
                    <circle
                      className={g.tone}
                      cx="64"
                      cy="64"
                      fill="transparent"
                      r={r}
                      stroke="currentColor"
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray={c.toFixed(1)}
                      strokeDashoffset={dashOffset.toFixed(1)}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl sm:text-3xl font-black leading-none text-off-white">{g.scoreText}</span>
                    <span className={`text-[10px] sm:text-[11px] font-black leading-none mt-1 whitespace-nowrap ${g.toneLabel}`}>
                      {g.label}
                    </span>
                  </div>
                </div>
                {g.periodText ? (
                  <p className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 text-[9px] sm:text-[10px] font-bold tracking-wide text-cool-grey">
                    {g.periodText}
                  </p>
                ) : null}
              </div>
            );
          })}
          <div className="glass-card p-4 sm:p-8 rounded-3xl flex flex-col justify-center items-center text-center border border-[#e6dfd3]">
            <h5 className="text-[14px] font-black text-cool-grey uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-6">QUICK TOOLS</h5>
            <p className="text-cool-grey text-[10px] sm:text-[11px] font-medium mb-6 leading-relaxed">
              プレミアム計算とスクラップ換算を、リアルタイムで素早く確認できます。
            </p>
            <a
              href="/tatene-calculator"
              className="w-full bg-[#2f6d5a] border border-[#285949] text-white py-3 sm:py-4 rounded-xl text-[10px] sm:text-xs font-black tracking-[0.12em] sm:tracking-widest text-center"
            >
              国内建値計算
            </a>
            <div className="mt-6 text-[9px] sm:text-[14px] font-bold text-cool-grey tracking-wide">
              参照元:
              {' '}
              <a className="hover:text-off-white underline underline-offset-2" href="https://www.lme.com/" target="_blank" rel="noreferrer">LME</a>
              {' / '}
              <a className="hover:text-off-white underline underline-offset-2" href="https://www.worldbank.org/" target="_blank" rel="noreferrer">World Bank</a>
              {' / '}
              <a className="hover:text-off-white underline underline-offset-2" href="https://data.imf.org/" target="_blank" rel="noreferrer">IMF</a>
              {' / '}
              <a className="hover:text-off-white underline underline-offset-2" href="https://comtradeplus.un.org/" target="_blank" rel="noreferrer">United Nations</a>
              {' / '}
              <a className="hover:text-off-white underline underline-offset-2" href="https://www.jx-nmm.com/cuprice/" target="_blank" rel="noreferrer">JX金属</a>
            </div>
          </div>
        </div>
      </main>
      <footer className="bg-[#f3f1ed] border-t border-[#e6dfd3] pt-4 pb-24 md:pb-4">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-16 mb-4">
            <div className="col-span-1 md:col-span-2">
              <div className="flex flex-col mb-8">
                <h1 className="text-3xl font-black tracking-tight text-off-white">COPPER FOR ME</h1>
              </div>
              <p className="text-cool-grey text-sm max-w-md leading-relaxed">
                非鉄金属業界向けに、月次の市場データと予測分析を提供します。世界中の取引所と独自のインデックスから集約されています。
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 md:col-span-3">
              <div>
                <h6 className="text-[10px] font-black text-off-white uppercase tracking-[0.3em] mb-10">Market</h6>
                <ul className="space-y-5 text-xs font-bold text-cool-grey uppercase tracking-widest">
                  <li><Link className="hover:text-positive transition-colors" href="/">概要</Link></li>
                  <li><Link className="hover:text-positive transition-colors" href="/lme">LME</Link></li>
                  <li><Link className="hover:text-positive transition-colors" href="/tatene">建値</Link></li>
                  <li><Link className="hover:text-positive transition-colors" href="/scrap">スクラップ</Link></li>
                </ul>
              </div>
              <div>
                <h6 className="text-[10px] font-black text-off-white uppercase tracking-[0.3em] mb-10">Analytics</h6>
                <ul className="space-y-5 text-xs font-bold text-cool-grey uppercase tracking-widest">
                  <li><Link className="hover:text-positive transition-colors" href="/prediction">予測</Link></li>
                  <li><Link className="hover:text-positive transition-colors" href="/article">記事</Link></li>
                  <li><Link className="hover:text-positive transition-colors" href="/tatene-calculator">建値計算</Link></li>
                </ul>
              </div>
              <div>
                <h6 className="text-[10px] font-black text-off-white uppercase tracking-[0.3em] mb-10">Information</h6>
                <ul className="space-y-5 text-xs font-bold text-cool-grey uppercase tracking-widest">
                  <li><Link className="hover:text-positive transition-colors" href="/blog/privacypolicy">プライバシーポリシーについて</Link></li>
                  <li><Link className="hover:text-positive transition-colors" href="/blog/disclaimer">免責事項</Link></li>
                  <li><Link className="hover:text-positive transition-colors" href="/blog/about">このサイトについて</Link></li>
                </ul>
              </div>
            </div>
          </div>
          <DataDisclaimerBlock />
        </div>
      </footer>
      <MobileBottomNavClient />
    </div>
  );
}
