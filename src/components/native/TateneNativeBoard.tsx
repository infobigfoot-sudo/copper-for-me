'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { LinePlot, MetricCard, SectionCard, buildPolyline, calcChange, fmtNum, latestPair } from '@/components/native/NativeWidgets';
import type { SeriesPoint } from '@/lib/selected_series_bundle';

type SpanKey = '1m' | '3m' | '6m' | '1y' | '3y';
type MarketArticle = { title: string; href: string };
type TateneDataTabKey = 'tatene' | 'premium';
type TrendPairKey = 'tatene_premium' | 'tatene_usd' | 'premium_usd';

const SPANS: Array<{ key: SpanKey; label: string; days: number }> = [
  { key: '1m', label: '1M', days: 31 },
  { key: '3m', label: '3M', days: 93 },
  { key: '6m', label: '6M', days: 186 },
  { key: '1y', label: '1Y', days: 365 },
  { key: '3y', label: '3Y', days: 365 * 3 },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcMs(dateText: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
  const parsed = Date.parse(`${dateText}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function filterByPeriodDays(rows: SeriesPoint[], days: number): SeriesPoint[] {
  if (!rows.length) return [];
  const latestDate = rows.at(-1)?.date || '';
  const latestMs = toUtcMs(latestDate);
  if (latestMs === null) return rows.slice(-Math.min(days, rows.length));
  const safeDays = Math.max(1, days);
  const cutoff = latestMs - (safeDays - 1) * DAY_MS;
  const filtered = rows.filter((row) => {
    const ms = toUtcMs(row.date);
    return ms !== null && ms >= cutoff;
  });
  return filtered.length ? filtered : rows.slice(-Math.min(days, rows.length));
}

function valueAtOrBefore(series: SeriesPoint[], date: string): number | null {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (series[i].date <= date) return series[i].value;
  }
  return null;
}

function idxRows(rows: SeriesPoint[]): SeriesPoint[] {
  const base = rows[0]?.value || 1;
  return rows.map((r) => ({ ...r, value: (r.value / base) * 100 }));
}

type TateneTrendPlotProps = {
  tateneRows: SeriesPoint[];
  premiumRows: SeriesPoint[];
  usdRows: SeriesPoint[];
  xLabels: [string, string, string];
  visible: {
    tatene: boolean;
    premium: boolean;
    usd: boolean;
  };
};

type Scale = { min: number; range: number };

const PLOT_W = 800;
const PLOT_H = 320;
const PLOT_PAD_X = 12;
const PLOT_TOP = 18;
const PLOT_BOTTOM = PLOT_H - 18;
const TATENE_PRICE_COLOR = '#355c7d';
const TATENE_PREMIUM_COLOR = '#7aa6c2';
const TATENE_USD_COLOR = '#ca83cc';

function alignSeriesByDate(baseRows: SeriesPoint[], rows: SeriesPoint[]): Array<number | null> {
  if (!baseRows.length || !rows.length) return baseRows.map(() => null);
  let j = 0;
  return baseRows.map((base) => {
    while (j + 1 < rows.length && rows[j + 1].date <= base.date) j += 1;
    const curr = rows[j];
    return curr && curr.date <= base.date && Number.isFinite(curr.value) ? curr.value : null;
  });
}

function scaleOf(values: Array<number | null>): Scale {
  const safe = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!safe.length) return { min: 0, range: 1 };
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  return { min, range: max - min || 1 };
}

function buildSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function TateneTrendPlot({ tateneRows, premiumRows, usdRows, xLabels, visible }: TateneTrendPlotProps) {
  const baseRows = usdRows.length >= 2 ? usdRows : [{ date: '-', value: 0 }, { date: '-', value: 0 }];
  const [activeIndex, setActiveIndex] = useState(baseRows.length - 1);

  useEffect(() => {
    setActiveIndex(baseRows.length - 1);
  }, [baseRows.length]);

  const shape = useMemo(() => {
    const plotW = PLOT_W - PLOT_PAD_X * 2;
    const xAt = (i: number) => PLOT_PAD_X + (plotW * i) / Math.max(baseRows.length - 1, 1);
    const tateneVals = alignSeriesByDate(baseRows, tateneRows);
    const premiumVals = alignSeriesByDate(baseRows, premiumRows);
    const usdVals = baseRows.map((r) => r.value);
    const tateneScale = scaleOf(tateneVals);
    const premiumScale = scaleOf(premiumVals);
    const usdScale = scaleOf(usdVals);
    const yAt = (value: number | null, scale: Scale) => {
      if (value === null || !Number.isFinite(value)) return PLOT_BOTTOM;
      return PLOT_BOTTOM - ((value - scale.min) / scale.range) * (PLOT_BOTTOM - PLOT_TOP);
    };
    const tatenePoints = tateneVals.map((v, i) => ({ x: xAt(i), y: yAt(v, tateneScale) }));
    const premiumPoints = premiumVals.map((v, i) => ({ x: xAt(i), y: yAt(v, premiumScale) }));
    const usdPoints = usdVals.map((v, i) => ({ x: xAt(i), y: yAt(v, usdScale) }));
    return {
      tatenePoints,
      premiumPoints,
      usdPoints,
      tatenePath: buildSmoothPath(tatenePoints),
      premiumPath: buildSmoothPath(premiumPoints),
      usdPath: buildSmoothPath(usdPoints),
      active: {
        date: baseRows.at(Math.max(0, Math.min(activeIndex, baseRows.length - 1)))?.date || '-',
        tatene: tateneVals.at(Math.max(0, Math.min(activeIndex, tateneVals.length - 1))) ?? null,
        premium: premiumVals.at(Math.max(0, Math.min(activeIndex, premiumVals.length - 1))) ?? null,
        usd: usdVals.at(Math.max(0, Math.min(activeIndex, usdVals.length - 1))) ?? null,
      },
    };
  }, [activeIndex, baseRows, tateneRows, premiumRows]);

  const clampedIndex = Math.max(0, Math.min(activeIndex, baseRows.length - 1));
  const activeX = shape.tatenePoints[clampedIndex]?.x ?? PLOT_PAD_X;

  const handleMove = (clientX: number, left: number, width: number) => {
    if (width <= 0) return;
    const svgX = ((clientX - left) / width) * PLOT_W;
    let nearest = 0;
    let dist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < shape.tatenePoints.length; i += 1) {
      const d = Math.abs(shape.tatenePoints[i].x - svgX);
      if (d < dist) {
        dist = d;
        nearest = i;
      }
    }
    setActiveIndex(nearest);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-4 text-[10px] font-black uppercase tracking-[0.14em] text-cool-grey">
        <span className="text-[#64748b]">{shape.active.date}</span>
        {visible.tatene ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TATENE_PRICE_COLOR }} />
            国内建値 <span style={{ color: TATENE_PRICE_COLOR }}>{fmtNum(shape.active.tatene, 0)}</span>
          </span>
        ) : null}
        {visible.premium ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TATENE_PREMIUM_COLOR }} />
            諸コスト <span style={{ color: TATENE_PREMIUM_COLOR }}>{fmtNum(shape.active.premium, 0)}</span>
          </span>
        ) : null}
        {visible.usd ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TATENE_USD_COLOR }} />
            USD/JPY <span className="text-[#6f8196]">{fmtNum(shape.active.usd, 2)}</span>
          </span>
        ) : null}
      </div>
      <div className="h-[340px] w-full chart-grid rounded-xl border border-white/5 relative">
        <svg
          viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            handleMove(e.clientX, rect.left, rect.width);
          }}
          onTouchMove={(e) => {
            const touch = e.touches[0];
            if (!touch) return;
            const rect = e.currentTarget.getBoundingClientRect();
            handleMove(touch.clientX, rect.left, rect.width);
          }}
        >
          <line x1={PLOT_PAD_X} y1={PLOT_BOTTOM} x2={PLOT_W - PLOT_PAD_X} y2={PLOT_BOTTOM} stroke="rgba(100,116,139,0.24)" />
          <line x1={PLOT_PAD_X} y1={(PLOT_TOP + PLOT_BOTTOM) / 2} x2={PLOT_W - PLOT_PAD_X} y2={(PLOT_TOP + PLOT_BOTTOM) / 2} stroke="rgba(100,116,139,0.16)" strokeDasharray="4 4" />

          {visible.tatene ? (
            <path d={shape.tatenePath} fill="none" stroke={TATENE_PRICE_COLOR} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          ) : null}
          {visible.premium ? (
            <path d={shape.premiumPath} fill="none" stroke={TATENE_PREMIUM_COLOR} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          ) : null}
          {visible.usd ? (
            <path d={shape.usdPath} fill="none" stroke={TATENE_USD_COLOR} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          ) : null}

          <line x1={activeX.toFixed(2)} y1={PLOT_TOP.toFixed(2)} x2={activeX.toFixed(2)} y2={PLOT_BOTTOM.toFixed(2)} stroke="rgba(53,92,125,0.25)" strokeDasharray="4 3" />
          {visible.tatene ? (
            <circle cx={(shape.tatenePoints[clampedIndex]?.x || 0).toFixed(2)} cy={(shape.tatenePoints[clampedIndex]?.y || 0).toFixed(2)} r="4.2" fill={TATENE_PRICE_COLOR} />
          ) : null}
          {visible.premium ? (
            <circle cx={(shape.premiumPoints[clampedIndex]?.x || 0).toFixed(2)} cy={(shape.premiumPoints[clampedIndex]?.y || 0).toFixed(2)} r="3.6" fill={TATENE_PREMIUM_COLOR} />
          ) : null}
          {visible.usd ? (
            <circle cx={(shape.usdPoints[clampedIndex]?.x || 0).toFixed(2)} cy={(shape.usdPoints[clampedIndex]?.y || 0).toFixed(2)} r="3.2" fill={TATENE_USD_COLOR} />
          ) : null}
        </svg>
      </div>
      <div className="flex justify-between mt-4 text-[9px] sm:text-[14px] text-cool-grey font-black uppercase tracking-[0.2em]">
        <span>{xLabels[0]}</span>
        <span>{xLabels[1]}</span>
        <span>{xLabels[2]}</span>
      </div>
    </>
  );
}

export default function TateneNativeBoard({
  priceSeries,
  usdJpySeries,
  tateneSeries,
  marketArticles,
}: {
  priceSeries: SeriesPoint[];
  usdJpySeries: SeriesPoint[];
  tateneSeries: SeriesPoint[];
  marketArticles: MarketArticle[];
}) {
  const [span, setSpan] = useState<SpanKey>('3m');
  const [dataTab, setDataTab] = useState<TateneDataTabKey>('tatene');
  const [trendPair, setTrendPair] = useState<TrendPairKey>('tatene_premium');
  const spanDays = SPANS.find((x) => x.key === span)?.days ?? 93;

  const rows = useMemo(() => {
    return tateneSeries
      .map((row) => {
        const lme = valueAtOrBefore(priceSeries, row.date);
        const usd = valueAtOrBefore(usdJpySeries, row.date);
        if (lme === null || usd === null) return null;
        const model = lme * usd;
        return { date: row.date, tatene: row.value, lme, usd, model, premium: row.value - model };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [tateneSeries, priceSeries, usdJpySeries]);

  const tatenePair = latestPair(tateneSeries);
  const usdPair = latestPair(usdJpySeries);
  const lmePair = latestPair(priceSeries);
  const premiumLatest = rows.at(-1)?.premium ?? null;
  const premiumPrev = rows.length >= 2 ? rows[rows.length - 2].premium : null;
  const tateneChg = calcChange(tatenePair.latest?.value ?? null, tatenePair.prev?.value ?? null);
  const usdChg = calcChange(usdPair.latest?.value ?? null, usdPair.prev?.value ?? null);
  const lmeChg = calcChange(lmePair.latest?.value ?? null, lmePair.prev?.value ?? null);
  const premiumChg = calcChange(premiumLatest, premiumPrev);
  const endDate = tatenePair.latest?.date || '-';
  const latestRow = rows.at(-1);
  const prevRow = rows.length >= 2 ? rows[rows.length - 2] : null;
  const premiumSeries = useMemo(() => rows.map((r) => ({ date: r.date, value: r.premium })), [rows]);

  const tateneSpan = useMemo(() => filterByPeriodDays(tateneSeries, spanDays), [tateneSeries, spanDays]);
  const usdAxisSpan = useMemo(() => filterByPeriodDays(usdJpySeries, spanDays), [usdJpySeries, spanDays]);
  const axisStart = usdAxisSpan.at(0)?.date || '-';
  const axisMid = usdAxisSpan.at(Math.floor(usdAxisSpan.length / 2))?.date || '-';
  const axisEnd = usdAxisSpan.at(-1)?.date || '-';

  const oneYearTateneRows = useMemo(() => filterByPeriodDays(tateneSeries, 365).slice().reverse(), [tateneSeries]);
  const oneYearPremiumRows = useMemo(() => filterByPeriodDays(premiumSeries, 365).slice().reverse(), [premiumSeries]);
  const visibleRows = 10;
  const tabTableViewportPx = 40 + visibleRows * 36;
  const relTateneSpan = useMemo(() => filterByPeriodDays(tateneSeries, 365), [tateneSeries]);
  const relPremiumSpan = useMemo(() => filterByPeriodDays(premiumSeries, 365), [premiumSeries]);
  const relUsdSpan = useMemo(() => filterByPeriodDays(usdJpySeries, 365), [usdJpySeries]);
  const relAxisStart = relTateneSpan.at(0)?.date || '-';
  const relAxisMid = relTateneSpan.at(Math.floor(relTateneSpan.length / 2))?.date || '-';
  const relAxisEnd = relTateneSpan.at(-1)?.date || '-';
  const relTatene = idxRows(relTateneSpan);
  const relPremium = idxRows(relPremiumSpan);
  const relUsd = idxRows(relUsdSpan);
  const contributionPeriodRows = useMemo(() => {
    if (!rows.length) return [];
    const latestDate = rows.at(-1)?.date || '';
    const latestMs = toUtcMs(latestDate);
    if (latestMs === null) return rows.slice(-Math.min(rows.length, 366));
    const cutoff = latestMs - 365 * DAY_MS;
    const filtered = rows.filter((row) => {
      const ms = toUtcMs(row.date);
      return ms !== null && ms >= cutoff;
    });
    return filtered.length >= 2 ? filtered : rows.slice(-Math.min(rows.length, 2));
  }, [rows]);
  const firstContribRow = contributionPeriodRows.at(0) ?? null;
  const lastContribRow = contributionPeriodRows.at(-1) ?? null;
  const deltaLme = firstContribRow && lastContribRow ? lastContribRow.lme - firstContribRow.lme : null;
  const deltaUsd = firstContribRow && lastContribRow ? lastContribRow.usd - firstContribRow.usd : null;
  const crossTerm = deltaLme !== null && deltaUsd !== null ? deltaLme * deltaUsd : null;
  const lmeContrib = firstContribRow && deltaLme !== null && crossTerm !== null ? firstContribRow.usd * deltaLme + crossTerm * 0.5 : null;
  const usdContrib = firstContribRow && deltaUsd !== null && crossTerm !== null ? firstContribRow.lme * deltaUsd + crossTerm * 0.5 : null;
  const costContrib = firstContribRow && lastContribRow ? lastContribRow.premium - firstContribRow.premium : null;
  const absSumContrib = Math.abs(lmeContrib ?? 0) + Math.abs(usdContrib ?? 0) + Math.abs(costContrib ?? 0);
  const fallbackShare = 100 / 3;
  const lmeShare = absSumContrib > 0 ? (Math.abs(lmeContrib ?? 0) / absSumContrib) * 100 : fallbackShare;
  const usdShare = absSumContrib > 0 ? (Math.abs(usdContrib ?? 0) / absSumContrib) * 100 : fallbackShare;
  const costShare = absSumContrib > 0 ? (Math.abs(costContrib ?? 0) / absSumContrib) * 100 : fallbackShare;
  const contribCandidates = [
    { label: 'LME', share: lmeShare, color: TATENE_PRICE_COLOR },
    { label: 'USD/JPY', share: usdShare, color: TATENE_USD_COLOR },
    { label: '諸コスト', share: costShare, color: TATENE_PREMIUM_COLOR },
  ];
  const dominantContrib = contribCandidates.slice().sort((a, b) => b.share - a.share)[0];
  const contribRowShares = useMemo(() => {
    const rounded = contribCandidates.map((item) => Number(item.share.toFixed(1)));
    const current = rounded.reduce((sum, v) => sum + v, 0);
    const diff = Number((100 - current).toFixed(1));
    const out = [...rounded];
    if (out.length) out[out.length - 1] = Number((out[out.length - 1] + diff).toFixed(1));
    return out;
  }, [contribCandidates]);
  const ringR = 52;
  const ringLen = 2 * Math.PI * ringR;
  const ringOffset = ringLen * (1 - (dominantContrib?.share ?? 0) / 100);
  const trendVisible = {
    tatene: trendPair === 'tatene_premium' || trendPair === 'tatene_usd',
    premium: trendPair === 'tatene_premium' || trendPair === 'premium_usd',
    usd: trendPair === 'tatene_usd' || trendPair === 'premium_usd',
  };

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <MetricCard
          label="国内銅建値"
          change={tateneChg}
          value={fmtNum(tatenePair.latest?.value ?? null, 0)}
          unit="JPY/mt"
          polyline={buildPolyline(tateneSeries.slice(-7).map((r) => r.value))}
          gaugeRangeValues={tateneSeries.slice(-31).map((r) => r.value)}
          gaugeCurrentChange={tateneChg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={endDate}
        />
        <MetricCard
          label="諸コスト"
          change={premiumChg}
          value={fmtNum(premiumLatest, 0)}
          unit="JPY/mt"
          polyline={buildPolyline(rows.slice(-7).map((r) => r.premium))}
          gaugeRangeValues={rows.slice(-31).map((r) => r.premium)}
          gaugeCurrentChange={premiumChg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={endDate}
        />
        <MetricCard
          label="USD / JPY"
          change={usdChg}
          positiveWhenUp={true}
          value={fmtNum(usdPair.latest?.value ?? null, 2)}
          unit="JPY"
          polyline={buildPolyline(usdJpySeries.slice(-7).map((r) => r.value))}
          gaugeRangeValues={usdJpySeries.slice(-31).map((r) => r.value)}
          gaugeCurrentChange={usdChg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={usdPair.latest?.date || '-'}
        />
        <article className="glass-card glass-card-hover relative p-4 sm:p-6 rounded-2xl transition-all group text-left">
          <div className="mb-3 flex items-start justify-between gap-3">
            <h4 className="text-[14px] leading-snug font-black text-cool-grey uppercase tracking-[0.2em]">
              国内建値の分解
            </h4>
            <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.18em] text-cool-grey whitespace-nowrap">
              {endDate}
            </p>
          </div>

          <p className="mb-3 rounded-md border border-white/10 bg-[#f6f2eb]/70 px-2.5 py-2 text-[10px] font-black tracking-[0.08em] text-cool-grey">
            国内建値 = LME×USD/JPY + 諸コスト
          </p>

          <div className="mb-3 rounded-xl border border-white/10 bg-[#f3f1ed]/70 px-3 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-cool-grey">差分(諸コスト)</p>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <strong
                className={`text-2xl sm:text-[30px] leading-none font-black font-mono tabular-nums ${
                  premiumLatest === null ? 'text-cool-grey' : premiumLatest >= 0 ? 'text-[#0f6d6a]' : 'text-[#b86d53]'
                }`}
              >
                {fmtNum(premiumLatest, 0)}
              </strong>
              <span className="text-[10px] font-bold tracking-[0.08em] text-cool-grey">JPY/mt</span>
            </div>
          </div>

          <div className="space-y-2 text-[12px] sm:text-sm">
            <div className="flex justify-between border-b border-white/10 pb-1.5">
              <span className="text-cool-grey">国内建値</span>
              <strong className="text-off-white font-mono tabular-nums">{fmtNum(latestRow?.tatene ?? null, 0)}</strong>
            </div>
            <div className="flex justify-between border-b border-white/10 pb-1.5">
              <span className="text-cool-grey">LME×USD/JPY</span>
              <strong className="text-off-white font-mono tabular-nums">{fmtNum(latestRow?.model ?? null, 0)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-cool-grey">LME価格</span>
              <strong className="text-cool-grey font-mono tabular-nums">{fmtNum(latestRow?.lme ?? null, 0)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-cool-grey">USD/JPY</span>
              <strong className="text-cool-grey font-mono tabular-nums">{fmtNum(latestRow?.usd ?? null, 2)}</strong>
            </div>
            <p className="pt-1 text-[9px] sm:text-[10px] text-cool-grey">※建値更新時のデータを利用</p>
          </div>
        </article>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2">
          <SectionCard
            title="トレンド"
            right={
              <div className="inline-flex rounded-lg border border-white/10 overflow-hidden">
                {SPANS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`px-3 py-1.5 text-xs font-bold ${span === item.key ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`}
                    onClick={() => setSpan(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            }
          >
            <div className="mb-3 flex justify-end">
              <div className="inline-flex rounded-lg border border-white/10 overflow-hidden">
                <button
                  type="button"
                  className={`px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${trendPair === 'tatene_premium' ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`}
                  onClick={() => setTrendPair('tatene_premium')}
                >
                  建値+諸コスト
                </button>
                <button
                  type="button"
                  className={`px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${trendPair === 'tatene_usd' ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`}
                  onClick={() => setTrendPair('tatene_usd')}
                >
                  建値+USD
                </button>
                <button
                  type="button"
                  className={`px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${trendPair === 'premium_usd' ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`}
                  onClick={() => setTrendPair('premium_usd')}
                >
                  諸コスト+USD
                </button>
              </div>
            </div>
            <TateneTrendPlot tateneRows={tateneSeries} premiumRows={premiumSeries} usdRows={usdAxisSpan} xLabels={[axisStart, axisMid, axisEnd]} visible={trendVisible} />
          </SectionCard>
        </div>
        <article className="glass-card rounded-3xl p-8">
          <div className="mb-4 flex flex-col gap-3">
            <h4 className="text-[14px] font-black text-cool-grey uppercase tracking-[0.2em] sm:tracking-[0.3em] whitespace-nowrap">
              1年データ
            </h4>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                className={`px-2 py-2 text-[9px] sm:text-[10px] leading-none font-bold text-center whitespace-nowrap rounded-md border ${dataTab === 'tatene' ? 'bg-positive/20 text-positive border-positive/30' : 'text-cool-grey hover:text-off-white border-white/10'}`}
                onClick={() => setDataTab('tatene')}
              >
                国内価格
              </button>
              <button
                type="button"
                className={`px-2 py-2 text-[9px] sm:text-[10px] leading-none font-bold text-center whitespace-nowrap rounded-md border ${dataTab === 'premium' ? 'bg-positive/20 text-positive border-positive/30' : 'text-cool-grey hover:text-off-white border-white/10'}`}
                onClick={() => setDataTab('premium')}
              >
                諸コスト
              </button>
            </div>
          </div>
          <div
            className="w-full overflow-y-scroll overflow-x-hidden calm-scrollbar rounded-lg border border-white/10 bg-[#f3f1ed]/70"
            style={{ minHeight: `${tabTableViewportPx}px`, maxHeight: `${tabTableViewportPx}px`, height: `${tabTableViewportPx}px` }}
          >
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[44%]" />
                <col className="w-[28%]" />
                <col className="w-[28%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-[#ece7df]/95 backdrop-blur-sm border-b border-[#ddd5ca]">
                <tr>
                  <th className="text-left px-2.5 py-2 text-[12px] font-black uppercase tracking-[0.12em] text-cool-grey whitespace-nowrap">日付</th>
                  <th className="text-right px-2.5 py-2 text-[12px] font-black uppercase tracking-[0.12em] text-cool-grey whitespace-nowrap">
                    {dataTab === 'tatene' ? '国内価格' : '諸コスト'}
                  </th>
                  <th className="text-right px-2.5 py-2 text-[12px] font-black uppercase tracking-[0.12em] text-cool-grey whitespace-nowrap">増減</th>
                </tr>
              </thead>
              <tbody>
                {(dataTab === 'tatene' ? oneYearTateneRows : oneYearPremiumRows).map((row, idx, rows) => {
                  const prev = rows[idx + 1];
                  const diff = calcChange(row.value, prev?.value ?? null);
                  return (
                    <tr key={`${dataTab}-tab-row-${row.date}-${idx}`} className="h-9 border-t border-[#e5dfd5]">
                      <td className="px-2.5 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-cool-grey whitespace-nowrap">{row.date}</td>
                      <td className="px-2.5 py-2.5 text-right text-[13px] leading-tight text-off-white whitespace-nowrap">{fmtNum(row.value, 0)}</td>
                      <td className={`px-2.5 py-2.5 text-right text-[13px] leading-tight whitespace-nowrap ${diff === null ? 'text-cool-grey' : diff >= 0 ? 'text-[#2f6d5a]' : 'text-[#b86d53]'}`}>
                        {diff === null ? '-' : `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 items-stretch mb-4">
        <SectionCard
          title="相対変化"
          className="h-full col-span-2 lg:col-span-1"
          right={
            <div className="flex flex-wrap items-center justify-end gap-4 text-[10px] font-black uppercase tracking-[0.14em] text-cool-grey text-right">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TATENE_PRICE_COLOR }} />
                国内建値
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TATENE_PREMIUM_COLOR }} />
                諸コスト
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TATENE_USD_COLOR }} />
                USD/JPY
              </span>
            </div>
          }
        >
          <LinePlot
            lines={[
              { values: relTatene.map((r) => r.value), color: TATENE_PRICE_COLOR },
              { values: relPremium.map((r) => r.value), color: TATENE_PREMIUM_COLOR },
              { values: relUsd.map((r) => r.value), color: TATENE_USD_COLOR },
            ]}
            xLabels={[relAxisStart, relAxisMid, relAxisEnd]}
            referenceValue={100}
            scaleMode="centered_reference"
            height={220}
            overlayNote="※ 先頭データを100として指数化（期間:1年間）"
          />
        </SectionCard>

        <SectionCard title="国内建値への寄与率" className="h-full col-span-1">
          <div className="flex flex-col items-center py-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-cool-grey">期間: 1年間</p>
            <div className="relative w-32 h-32 sm:w-44 sm:h-44">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
                <circle cx="70" cy="70" r={ringR} fill="transparent" stroke="rgba(255,255,255,0.12)" strokeWidth="14" />
                <circle
                  cx="70"
                  cy="70"
                  r={ringR}
                  fill="transparent"
                  stroke={TATENE_PRICE_COLOR}
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={ringLen.toFixed(1)}
                  strokeDashoffset={ringOffset.toFixed(1)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-3xl sm:text-4xl font-black text-off-white">
                  {fmtNum(dominantContrib?.share ?? null, 1)}%
                </p>
                <p className="text-xs font-bold tracking-widest" style={{ color: TATENE_PRICE_COLOR }}>
                  {dominantContrib?.label || '-'}
                </p>
              </div>
            </div>
            <div className="mt-4 w-full space-y-1.5 text-sm">
              <p className="flex justify-between text-cool-grey"><span>LME</span><span style={{ color: TATENE_PRICE_COLOR }}>{contribRowShares[0]?.toFixed(1) ?? '0.0'}%</span></p>
              <p className="flex justify-between text-cool-grey"><span>USD/JPY</span><span style={{ color: TATENE_USD_COLOR }}>{contribRowShares[1]?.toFixed(1) ?? '0.0'}%</span></p>
              <p className="flex justify-between text-cool-grey"><span>諸コスト</span><span style={{ color: TATENE_PREMIUM_COLOR }}>{contribRowShares[2]?.toFixed(1) ?? '0.0'}%</span></p>
            </div>
          </div>
        </SectionCard>

        <article className="glass-card p-4 sm:p-8 rounded-3xl flex flex-col justify-center items-center text-center border border-[#e6dfd3] h-full col-span-1">
          <h5 className="text-[14px] font-black text-cool-grey uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-6">QUICK TOOLS</h5>
          <p className="text-cool-grey text-[10px] sm:text-[11px] font-medium mb-6 leading-relaxed">
            プレミアム計算とスクラップ換算を、リアルタイムで素早く確認できます。
          </p>
          <Link
            href="/tatene-calculator"
            className="w-full bg-[#2f6d5a] border border-[#285949] text-white py-3 sm:py-4 rounded-xl text-[10px] sm:text-xs font-black tracking-[0.12em] sm:tracking-widest text-center"
          >
            国内建値計算
          </Link>
          <div className="mt-6 text-[9px] sm:text-[14px] font-bold text-cool-grey tracking-wide">
            参照元:
            {' '}
            <a className="hover:text-off-white underline underline-offset-2" href="https://fred.stlouisfed.org/" target="_blank" rel="noreferrer">
              FRED
            </a>
            {' / '}
            <a className="hover:text-off-white underline underline-offset-2" href="https://www.alphavantage.co/" target="_blank" rel="noreferrer">
              Alpha Vantage
            </a>
            {' / '}
            <a className="hover:text-off-white underline underline-offset-2" href="https://www.jx-nmm.com/cuprice/" target="_blank" rel="noreferrer">
              JX金属
            </a>
          </div>
        </article>
      </div>
    </>
  );
}
