'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { LinePlot, MetricCard, SectionCard, buildPolyline, calcChange, fmtNum, latestPair } from '@/components/native/NativeWidgets';
import type { SeriesPoint } from '@/lib/selected_series_bundle';

type SpanKey = '1m' | '3m' | '6m' | '1y' | '3y';
type TrendPairKey = 'lme_usdjpy' | 'lme_usdcny' | 'premium_wti';
type IndicatorDataTabKey = 'usdjpy' | 'usdcny' | 'us10y' | 'wti';

const SPANS: Array<{ key: SpanKey; label: string; days: number }> = [
  { key: '1m', label: '1M', days: 31 },
  { key: '3m', label: '3M', days: 93 },
  { key: '6m', label: '6M', days: 186 },
  { key: '1y', label: '1Y', days: 365 },
  { key: '3y', label: '3Y', days: 365 * 3 },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const PLOT_W = 800;
const PLOT_H = 320;
const PLOT_PAD_X = 12;
const PLOT_TOP = 18;
const PLOT_BOTTOM = PLOT_H - 18;

const LME_COLOR = '#355c7d';
const USD_JPY_COLOR = '#ca83cc';
const USD_CNY_COLOR = '#7aa6c2';
const US10_COLOR = '#ef4444';
const PREMIUM_COLOR = '#b86d53';
const WTI_COLOR = '#2f6d5a';
const TATENE_COLOR = '#0f6d6a';

type ContributionItem = {
  label: string;
  color: string;
  share: number;
};

type ContributionSummary = {
  dominant: ContributionItem;
  items: ContributionItem[];
};

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

function computeContributionSummary(
  targetRows: SeriesPoint[],
  factors: Array<{ label: string; color: string; rows: SeriesPoint[] }>
): ContributionSummary {
  const sortedTarget = targetRows;
  const latest = sortedTarget.at(-1);
  const prev = sortedTarget.length >= 2 ? sortedTarget[sortedTarget.length - 2] : null;

  if (sortedTarget.length < 3) {
    const eq = factors.length ? 100 / factors.length : 0;
    const items = factors.map((f) => ({ label: f.label, color: f.color, share: eq }));
    return {
      dominant: items[0] || { label: '-', color: '#94a3b8', share: 0 },
      items,
    };
  }

  const samples: Array<{ target: number; factors: number[] }> = [];
  for (let i = 1; i < sortedTarget.length; i += 1) {
    const curr = sortedTarget[i];
    const prevTarget = sortedTarget[i - 1];
    const targetRet = calcChange(curr.value, prevTarget.value);
    if (targetRet === null || !Number.isFinite(targetRet)) continue;
    const rowFactorRets: number[] = [];
    let valid = true;
    for (const factor of factors) {
      const fv = valueAtOrBefore(factor.rows, curr.date);
      const fp = valueAtOrBefore(factor.rows, prevTarget.date);
      const fr = calcChange(fv, fp);
      if (fr === null || !Number.isFinite(fr)) {
        valid = false;
        break;
      }
      rowFactorRets.push(fr);
    }
    if (valid) samples.push({ target: targetRet, factors: rowFactorRets });
  }

  const mean = (arr: number[]) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
  const betas = factors.map((_, idx) => {
    const xs = samples.map((s) => s.factors[idx]);
    const ys = samples.map((s) => s.target);
    if (xs.length < 2) return 0;
    const mx = mean(xs);
    const my = mean(ys);
    let cov = 0;
    let vx = 0;
    for (let i = 0; i < xs.length; i += 1) {
      const dx = xs[i] - mx;
      cov += dx * (ys[i] - my);
      vx += dx * dx;
    }
    return vx > 1e-9 ? cov / vx : 0;
  });

  const latestFactorChanges = factors.map((factor) => {
    const curr = valueAtOrBefore(factor.rows, latest?.date || '');
    const prevVal = valueAtOrBefore(factor.rows, prev?.date || '');
    const chg = calcChange(curr, prevVal);
    return chg ?? 0;
  });

  const raws = latestFactorChanges.map((chg, idx) => betas[idx] * chg);
  const absSum = raws.reduce((s, v) => s + Math.abs(v), 0);

  const items = factors.map((factor, idx) => ({
    label: factor.label,
    color: factor.color,
    share: absSum > 0 ? (Math.abs(raws[idx]) / absSum) * 100 : factors.length ? 100 / factors.length : 0,
  }));
  const dominant = items.slice().sort((a, b) => b.share - a.share)[0] || {
    label: '-',
    color: '#94a3b8',
    share: 0,
  };

  return { dominant, items };
}

function alignSeriesByDate(baseRows: SeriesPoint[], rows: SeriesPoint[]): Array<number | null> {
  if (!baseRows.length || !rows.length) return baseRows.map(() => null);
  let j = 0;
  return baseRows.map((base) => {
    while (j + 1 < rows.length && rows[j + 1].date <= base.date) j += 1;
    const curr = rows[j];
    return curr && curr.date <= base.date && Number.isFinite(curr.value) ? curr.value : null;
  });
}

type Scale = { min: number; range: number };

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

type IndicatorsTrendPlotProps = {
  baseRows: SeriesPoint[];
  lmeRows: SeriesPoint[];
  usdJpyRows: SeriesPoint[];
  usdCnyRows: SeriesPoint[];
  premiumRows: SeriesPoint[];
  wtiRows: SeriesPoint[];
  xLabels: [string, string, string];
  visible: {
    lme: boolean;
    usdJpy: boolean;
    usdCny: boolean;
    premium: boolean;
    wti: boolean;
  };
};

function IndicatorsTrendPlot({
  baseRows,
  lmeRows,
  usdJpyRows,
  usdCnyRows,
  premiumRows,
  wtiRows,
  xLabels,
  visible,
}: IndicatorsTrendPlotProps) {
  const rows = baseRows.length >= 2 ? baseRows : [{ date: '-', value: 0 }, { date: '-', value: 0 }];
  const [activeIndex, setActiveIndex] = useState(rows.length - 1);

  useEffect(() => {
    setActiveIndex(rows.length - 1);
  }, [rows.length]);

  const shape = useMemo(() => {
    const plotW = PLOT_W - PLOT_PAD_X * 2;
    const xAt = (i: number) => PLOT_PAD_X + (plotW * i) / Math.max(rows.length - 1, 1);

    const lmeVals = alignSeriesByDate(rows, lmeRows);
    const usdJpyVals = alignSeriesByDate(rows, usdJpyRows);
    const usdCnyVals = alignSeriesByDate(rows, usdCnyRows);
    const premiumVals = alignSeriesByDate(rows, premiumRows);
    const wtiVals = alignSeriesByDate(rows, wtiRows);

    const lmeScale = scaleOf(lmeVals);
    const usdJpyScale = scaleOf(usdJpyVals);
    const usdCnyScale = scaleOf(usdCnyVals);
    const premiumScale = scaleOf(premiumVals);
    const wtiScale = scaleOf(wtiVals);

    const yAt = (value: number | null, scale: Scale) => {
      if (value === null || !Number.isFinite(value)) return PLOT_BOTTOM;
      return PLOT_BOTTOM - ((value - scale.min) / scale.range) * (PLOT_BOTTOM - PLOT_TOP);
    };

    const lmePoints = lmeVals.map((v, i) => ({ x: xAt(i), y: yAt(v, lmeScale) }));
    const usdJpyPoints = usdJpyVals.map((v, i) => ({ x: xAt(i), y: yAt(v, usdJpyScale) }));
    const usdCnyPoints = usdCnyVals.map((v, i) => ({ x: xAt(i), y: yAt(v, usdCnyScale) }));
    const premiumPoints = premiumVals.map((v, i) => ({ x: xAt(i), y: yAt(v, premiumScale) }));
    const wtiPoints = wtiVals.map((v, i) => ({ x: xAt(i), y: yAt(v, wtiScale) }));

    const idx = Math.max(0, Math.min(activeIndex, rows.length - 1));

    return {
      lmePoints,
      usdJpyPoints,
      usdCnyPoints,
      premiumPoints,
      wtiPoints,
      lmePath: buildSmoothPath(lmePoints),
      usdJpyPath: buildSmoothPath(usdJpyPoints),
      usdCnyPath: buildSmoothPath(usdCnyPoints),
      premiumPath: buildSmoothPath(premiumPoints),
      wtiPath: buildSmoothPath(wtiPoints),
      active: {
        date: rows.at(idx)?.date || '-',
        lme: lmeVals.at(idx) ?? null,
        usdJpy: usdJpyVals.at(idx) ?? null,
        usdCny: usdCnyVals.at(idx) ?? null,
        premium: premiumVals.at(idx) ?? null,
        wti: wtiVals.at(idx) ?? null,
      },
    };
  }, [activeIndex, rows, lmeRows, usdJpyRows, usdCnyRows, premiumRows, wtiRows]);

  const clampedIndex = Math.max(0, Math.min(activeIndex, rows.length - 1));
  const activeX = shape.lmePoints[clampedIndex]?.x ?? PLOT_PAD_X;

  const handleMove = (clientX: number, left: number, width: number) => {
    if (width <= 0) return;
    const svgX = ((clientX - left) / width) * PLOT_W;
    let nearest = 0;
    let dist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < shape.lmePoints.length; i += 1) {
      const d = Math.abs(shape.lmePoints[i].x - svgX);
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
        {visible.lme ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: LME_COLOR }} />
            LME <span style={{ color: LME_COLOR }}>{fmtNum(shape.active.lme, 0)}</span>
          </span>
        ) : null}
        {visible.usdJpy ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: USD_JPY_COLOR }} />
            USD/JPY <span style={{ color: USD_JPY_COLOR }}>{fmtNum(shape.active.usdJpy, 2)}</span>
          </span>
        ) : null}
        {visible.usdCny ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: USD_CNY_COLOR }} />
            USD/CNY <span style={{ color: USD_CNY_COLOR }}>{fmtNum(shape.active.usdCny, 3)}</span>
          </span>
        ) : null}
        {visible.premium ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PREMIUM_COLOR }} />
            諸コスト <span style={{ color: PREMIUM_COLOR }}>{fmtNum(shape.active.premium, 0)}</span>
          </span>
        ) : null}
        {visible.wti ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: WTI_COLOR }} />
            WTI <span style={{ color: WTI_COLOR }}>{fmtNum(shape.active.wti, 2)}</span>
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

          {visible.lme ? <path d={shape.lmePath} fill="none" stroke={LME_COLOR} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {visible.usdJpy ? <path d={shape.usdJpyPath} fill="none" stroke={USD_JPY_COLOR} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {visible.usdCny ? <path d={shape.usdCnyPath} fill="none" stroke={USD_CNY_COLOR} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {visible.premium ? <path d={shape.premiumPath} fill="none" stroke={PREMIUM_COLOR} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {visible.wti ? <path d={shape.wtiPath} fill="none" stroke={WTI_COLOR} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /> : null}

          <line x1={activeX.toFixed(2)} y1={PLOT_TOP.toFixed(2)} x2={activeX.toFixed(2)} y2={PLOT_BOTTOM.toFixed(2)} stroke="rgba(53,92,125,0.25)" strokeDasharray="4 3" />

          {visible.lme ? <circle cx={(shape.lmePoints[clampedIndex]?.x || 0).toFixed(2)} cy={(shape.lmePoints[clampedIndex]?.y || 0).toFixed(2)} r="4.2" fill={LME_COLOR} /> : null}
          {visible.usdJpy ? <circle cx={(shape.usdJpyPoints[clampedIndex]?.x || 0).toFixed(2)} cy={(shape.usdJpyPoints[clampedIndex]?.y || 0).toFixed(2)} r="3.2" fill={USD_JPY_COLOR} /> : null}
          {visible.usdCny ? <circle cx={(shape.usdCnyPoints[clampedIndex]?.x || 0).toFixed(2)} cy={(shape.usdCnyPoints[clampedIndex]?.y || 0).toFixed(2)} r="3.6" fill={USD_CNY_COLOR} /> : null}
          {visible.premium ? <circle cx={(shape.premiumPoints[clampedIndex]?.x || 0).toFixed(2)} cy={(shape.premiumPoints[clampedIndex]?.y || 0).toFixed(2)} r="3.6" fill={PREMIUM_COLOR} /> : null}
          {visible.wti ? <circle cx={(shape.wtiPoints[clampedIndex]?.x || 0).toFixed(2)} cy={(shape.wtiPoints[clampedIndex]?.y || 0).toFixed(2)} r="3.6" fill={WTI_COLOR} /> : null}
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

function ContributionBody({
  summary,
}: {
  summary: ContributionSummary;
}) {
  const ringR = 52;
  const ringLen = 2 * Math.PI * ringR;
  const ringOffset = ringLen * (1 - summary.dominant.share / 100);
  const rowShares = useMemo(() => {
    if (!summary.items.length) return [];
    const rounded = summary.items.map((item) => Number(item.share.toFixed(1)));
    const current = rounded.reduce((sum, v) => sum + v, 0);
    const diff = Number((100 - current).toFixed(1));
    const out = [...rounded];
    out[out.length - 1] = Number((out[out.length - 1] + diff).toFixed(1));
    return out;
  }, [summary.items]);

  return (
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
            stroke={LME_COLOR}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={ringLen.toFixed(1)}
            strokeDashoffset={ringOffset.toFixed(1)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-3xl sm:text-4xl font-black text-off-white">{fmtNum(summary.dominant.share, 1)}%</p>
          <p className="text-xs font-bold tracking-widest" style={{ color: LME_COLOR }}>
            {summary.dominant.label}
          </p>
        </div>
      </div>
      <div className="mt-4 w-full space-y-1.5 text-sm">
        {summary.items.map((item, idx) => (
          <p key={`contrib-${item.label}`} className="flex justify-between text-cool-grey">
            <span>{item.label}</span>
            <span style={{ color: item.color }}>{rowShares[idx]?.toFixed(1) ?? '0.0'}%</span>
          </p>
        ))}
      </div>
    </div>
  );
}

export default function IndicatorsNativeBoard({
  usdJpySeries,
  usdCnySeries,
  dgs10Series,
  wtiSeries,
  lmeSeries,
  tateneSeries,
}: {
  usdJpySeries: SeriesPoint[];
  usdCnySeries: SeriesPoint[];
  dgs10Series: SeriesPoint[];
  wtiSeries: SeriesPoint[];
  lmeSeries: SeriesPoint[];
  tateneSeries: SeriesPoint[];
}) {
  const [span, setSpan] = useState<SpanKey>('3m');
  const [trendPair, setTrendPair] = useState<TrendPairKey>('lme_usdjpy');
  const [dataTab, setDataTab] = useState<IndicatorDataTabKey>('usdjpy');
  const [relativeTab, setRelativeTab] = useState<'lme' | 'tatene'>('lme');
  const [contributionTab, setContributionTab] = useState<'lme' | 'tatene'>('lme');

  const jpy = latestPair(usdJpySeries);
  const cny = latestPair(usdCnySeries);
  const us10 = latestPair(dgs10Series);
  const wti = latestPair(wtiSeries);
  const jpyChg = calcChange(jpy.latest?.value ?? null, jpy.prev?.value ?? null);
  const cnyChg = calcChange(cny.latest?.value ?? null, cny.prev?.value ?? null);
  const us10Chg = calcChange(us10.latest?.value ?? null, us10.prev?.value ?? null);
  const wtiChg = calcChange(wti.latest?.value ?? null, wti.prev?.value ?? null);

  const spanDays = SPANS.find((x) => x.key === span)?.days ?? 93;
  const jpySpan = useMemo(() => filterByPeriodDays(usdJpySeries, spanDays), [usdJpySeries, spanDays]);
  const cnySpan = useMemo(() => filterByPeriodDays(usdCnySeries, spanDays), [usdCnySeries, spanDays]);
  const us10Span = useMemo(() => filterByPeriodDays(dgs10Series, spanDays), [dgs10Series, spanDays]);
  const wtiSpan = useMemo(() => filterByPeriodDays(wtiSeries, spanDays), [wtiSeries, spanDays]);
  const lmeSpan = useMemo(() => filterByPeriodDays(lmeSeries, spanDays), [lmeSeries, spanDays]);

  const premiumSeries = useMemo(
    () =>
      tateneSeries
        .map((row) => {
          const lme = valueAtOrBefore(lmeSeries, row.date);
          const usd = valueAtOrBefore(usdJpySeries, row.date);
          if (lme === null || usd === null) return null;
          return { date: row.date, value: row.value - lme * usd };
        })
        .filter((r): r is SeriesPoint => r !== null),
    [tateneSeries, lmeSeries, usdJpySeries]
  );
  const premiumSpan = useMemo(() => filterByPeriodDays(premiumSeries, spanDays), [premiumSeries, spanDays]);

  const trendBase = useMemo(() => {
    if (trendPair === 'lme_usdcny') {
      return cnySpan.length >= 2 ? cnySpan : lmeSpan;
    }
    if (trendPair === 'premium_wti') {
      return wtiSpan.length >= 2 ? wtiSpan : premiumSpan;
    }
    return jpySpan.length >= 2 ? jpySpan : lmeSpan;
  }, [trendPair, jpySpan, cnySpan, lmeSpan, wtiSpan, premiumSpan]);

  const axisStart = trendBase.at(0)?.date || '-';
  const axisMid = trendBase.at(Math.floor(trendBase.length / 2))?.date || '-';
  const axisEnd = trendBase.at(-1)?.date || '-';

  const trendVisible = {
    lme: trendPair === 'lme_usdjpy' || trendPair === 'lme_usdcny',
    usdJpy: trendPair === 'lme_usdjpy',
    usdCny: trendPair === 'lme_usdcny',
    premium: trendPair === 'premium_wti',
    wti: trendPair === 'premium_wti',
  };

  const relJpySpan = useMemo(() => filterByPeriodDays(usdJpySeries, 365), [usdJpySeries]);
  const relCnySpan = useMemo(() => filterByPeriodDays(usdCnySeries, 365), [usdCnySeries]);
  const relUs10Span = useMemo(() => filterByPeriodDays(dgs10Series, 365), [dgs10Series]);
  const relWtiSpan = useMemo(() => filterByPeriodDays(wtiSeries, 365), [wtiSeries]);
  const relLmeSpan = useMemo(() => filterByPeriodDays(lmeSeries, 365), [lmeSeries]);
  const relTateneSpan = useMemo(() => filterByPeriodDays(tateneSeries, 365), [tateneSeries]);
  const relJpy = idxRows(relJpySpan);
  const relCny = idxRows(relCnySpan);
  const relUs10 = idxRows(relUs10Span);
  const relWti = idxRows(relWtiSpan);
  const relLme = idxRows(relLmeSpan);
  const relTatene = idxRows(relTateneSpan);
  const relBase = relativeTab === 'lme'
    ? (relLmeSpan.length >= 2 ? relLmeSpan : relJpySpan)
    : (relTateneSpan.length >= 2 ? relTateneSpan : relJpySpan);
  const relAxisStart = relBase.at(0)?.date || '-';
  const relAxisMid = relBase.at(Math.floor(relBase.length / 2))?.date || '-';
  const relAxisEnd = relBase.at(-1)?.date || '-';
  const relativeLines = relativeTab === 'lme'
    ? [
      { values: relLme.map((r) => r.value), color: LME_COLOR },
      { values: relJpy.map((r) => r.value), color: USD_JPY_COLOR },
      { values: relCny.map((r) => r.value), color: USD_CNY_COLOR },
      { values: relUs10.map((r) => r.value), color: US10_COLOR },
      { values: relWti.map((r) => r.value), color: WTI_COLOR },
    ]
    : [
      { values: relTatene.map((r) => r.value), color: TATENE_COLOR },
      { values: relJpy.map((r) => r.value), color: USD_JPY_COLOR },
      { values: relCny.map((r) => r.value), color: USD_CNY_COLOR },
      { values: relUs10.map((r) => r.value), color: US10_COLOR },
      { values: relWti.map((r) => r.value), color: WTI_COLOR },
    ];
  const contributionFactors = useMemo(
    () => [
      { label: 'USD/JPY', color: USD_JPY_COLOR, rows: usdJpySeries },
      { label: 'USD/CNY', color: USD_CNY_COLOR, rows: usdCnySeries },
      { label: '米10年金利', color: US10_COLOR, rows: dgs10Series },
      { label: 'WTI', color: WTI_COLOR, rows: wtiSeries },
    ],
    [usdJpySeries, usdCnySeries, dgs10Series, wtiSeries]
  );
  const contributionPeriodDays = 365;
  const lmeContribution = useMemo(
    () => computeContributionSummary(filterByPeriodDays(lmeSeries, contributionPeriodDays), contributionFactors),
    [lmeSeries, contributionFactors]
  );
  const tateneContribution = useMemo(
    () => computeContributionSummary(filterByPeriodDays(tateneSeries, contributionPeriodDays), contributionFactors),
    [tateneSeries, contributionFactors]
  );
  const oneYearJpyRows = useMemo(() => filterByPeriodDays(usdJpySeries, 365).slice().reverse(), [usdJpySeries]);
  const oneYearCnyRows = useMemo(() => filterByPeriodDays(usdCnySeries, 365).slice().reverse(), [usdCnySeries]);
  const oneYearUs10Rows = useMemo(() => filterByPeriodDays(dgs10Series, 365).slice().reverse(), [dgs10Series]);
  const oneYearWtiRows = useMemo(() => filterByPeriodDays(wtiSeries, 365).slice().reverse(), [wtiSeries]);
  const visibleRows = 10;
  const tabTableViewportPx = 40 + visibleRows * 36;
  const oneYearRows =
    dataTab === 'usdjpy'
      ? oneYearJpyRows
      : dataTab === 'usdcny'
        ? oneYearCnyRows
        : dataTab === 'us10y'
          ? oneYearUs10Rows
          : oneYearWtiRows;
  const dataValueDigits = dataTab === 'usdjpy' ? 2 : dataTab === 'usdcny' ? 3 : 2;
  const dataLabel = dataTab === 'usdjpy' ? 'USD / JPY' : dataTab === 'usdcny' ? 'USD / CNY' : dataTab === 'us10y' ? '米10年金利' : 'WTI';

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <MetricCard
          label="USD / JPY"
          change={jpyChg}
          positiveWhenUp={true}
          value={fmtNum(jpy.latest?.value ?? null, 2)}
          unit="JPY"
          polyline={buildPolyline(usdJpySeries.slice(-7).map((r) => r.value))}
          gaugeRangeValues={usdJpySeries.slice(-31).map((r) => r.value)}
          gaugeCurrentChange={jpyChg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={jpy.latest?.date || '-'}
        />
        <MetricCard
          label="USD / CNY"
          change={cnyChg}
          positiveWhenUp={false}
          value={fmtNum(cny.latest?.value ?? null, 3)}
          unit="CNY"
          polyline={buildPolyline(usdCnySeries.slice(-7).map((r) => r.value))}
          gaugeRangeValues={usdCnySeries.slice(-31).map((r) => r.value)}
          gaugeCurrentChange={cnyChg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={cny.latest?.date || '-'}
        />
        <MetricCard
          label="米10年金利"
          change={us10Chg}
          positiveWhenUp={false}
          value={fmtNum(us10.latest?.value ?? null, 2)}
          unit="%"
          polyline={buildPolyline(dgs10Series.slice(-7).map((r) => r.value))}
          gaugeRangeValues={dgs10Series.slice(-31).map((r) => r.value)}
          gaugeCurrentChange={us10Chg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={us10.latest?.date || '-'}
        />
        <MetricCard
          label="WTI"
          change={wtiChg}
          positiveWhenUp={true}
          value={fmtNum(wti.latest?.value ?? null, 2)}
          unit="USD"
          polyline={buildPolyline(wtiSeries.slice(-7).map((r) => r.value))}
          gaugeRangeValues={wtiSeries.slice(-31).map((r) => r.value)}
          gaugeCurrentChange={wtiChg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={wti.latest?.date || '-'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2">
          <SectionCard
            title="トレンド"
            right={
              <div className="inline-flex rounded-lg border border-white/10 overflow-hidden">
                {SPANS.map((item) => (
                  <button key={item.key} type="button" className={`px-3 py-1.5 text-xs font-bold ${span === item.key ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`} onClick={() => setSpan(item.key)}>
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
                  className={`px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${trendPair === 'lme_usdjpy' ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`}
                  onClick={() => setTrendPair('lme_usdjpy')}
                >
                  LME+USD/JPY
                </button>
                <button
                  type="button"
                  className={`px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${trendPair === 'lme_usdcny' ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`}
                  onClick={() => setTrendPair('lme_usdcny')}
                >
                  LME+USD/CNY
                </button>
                <button
                  type="button"
                  className={`px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${trendPair === 'premium_wti' ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`}
                  onClick={() => setTrendPair('premium_wti')}
                >
                  諸コスト+WTI
                </button>
              </div>
            </div>
            <IndicatorsTrendPlot
              baseRows={trendBase}
              lmeRows={lmeSpan}
              usdJpyRows={jpySpan}
              usdCnyRows={cnySpan}
              premiumRows={premiumSpan}
              wtiRows={wtiSpan}
              xLabels={[axisStart, axisMid, axisEnd]}
              visible={trendVisible}
            />
          </SectionCard>
        </div>
        <article className="glass-card rounded-3xl p-8">
          <div className="mb-4 flex flex-col gap-3">
            <h4 className="text-[14px] font-black text-cool-grey uppercase tracking-[0.2em] sm:tracking-[0.3em] whitespace-nowrap">
              1年データ
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              <button
                type="button"
                className={`px-2 py-2 text-[9px] sm:text-[10px] leading-none font-bold text-center whitespace-nowrap rounded-md border ${dataTab === 'usdjpy' ? 'bg-positive/20 text-positive border-positive/30' : 'text-cool-grey hover:text-off-white border-white/10'}`}
                onClick={() => setDataTab('usdjpy')}
              >
                USD / JPY
              </button>
              <button
                type="button"
                className={`px-2 py-2 text-[9px] sm:text-[10px] leading-none font-bold text-center whitespace-nowrap rounded-md border ${dataTab === 'usdcny' ? 'bg-positive/20 text-positive border-positive/30' : 'text-cool-grey hover:text-off-white border-white/10'}`}
                onClick={() => setDataTab('usdcny')}
              >
                USD / CNY
              </button>
              <button
                type="button"
                className={`px-2 py-2 text-[9px] sm:text-[10px] leading-none font-bold text-center whitespace-nowrap rounded-md border ${dataTab === 'us10y' ? 'bg-positive/20 text-positive border-positive/30' : 'text-cool-grey hover:text-off-white border-white/10'}`}
                onClick={() => setDataTab('us10y')}
              >
                米10年金利
              </button>
              <button
                type="button"
                className={`px-2 py-2 text-[9px] sm:text-[10px] leading-none font-bold text-center whitespace-nowrap rounded-md border ${dataTab === 'wti' ? 'bg-positive/20 text-positive border-positive/30' : 'text-cool-grey hover:text-off-white border-white/10'}`}
                onClick={() => setDataTab('wti')}
              >
                WTI
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
                    {dataLabel}
                  </th>
                  <th className="text-right px-2.5 py-2 text-[12px] font-black uppercase tracking-[0.12em] text-cool-grey whitespace-nowrap">増減</th>
                </tr>
              </thead>
              <tbody>
                {oneYearRows.map((row, idx, rows) => {
                  const prev = rows[idx + 1];
                  const diff = calcChange(row.value, prev?.value ?? null);
                  return (
                    <tr key={`${dataTab}-tab-row-${row.date}-${idx}`} className="h-9 border-t border-[#e5dfd5]">
                      <td className="px-2.5 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-cool-grey whitespace-nowrap">{row.date}</td>
                      <td className="px-2.5 py-2.5 text-right text-[13px] leading-tight text-off-white whitespace-nowrap">{fmtNum(row.value, dataValueDigits)}</td>
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

      <div className="grid grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 items-stretch">
        <SectionCard
          title="相対変化"
          className="h-full col-span-2 lg:col-span-1"
          titleClassName="whitespace-nowrap"
          right={(
            <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end">
              <div className="inline-flex rounded-lg border border-white/10 overflow-hidden">
                <button
                  type="button"
                  className={`px-3 py-1.5 text-xs font-bold whitespace-nowrap ${relativeTab === 'lme' ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`}
                  onClick={() => setRelativeTab('lme')}
                >
                  LME
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 text-xs font-bold whitespace-nowrap ${relativeTab === 'tatene' ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`}
                  onClick={() => setRelativeTab('tatene')}
                >
                  国内建値
                </button>
              </div>
              <div className="flex w-full flex-wrap items-center justify-start gap-3 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.14em] text-cool-grey sm:justify-end sm:text-right">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: relativeTab === 'lme' ? LME_COLOR : TATENE_COLOR }} />
                  {relativeTab === 'lme' ? 'LME' : '国内建値'}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: USD_JPY_COLOR }} />
                  USD/JPY
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: USD_CNY_COLOR }} />
                  USD/CNY
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: US10_COLOR }} />
                  米10年金利
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: WTI_COLOR }} />
                  WTI
                </span>
              </div>
            </div>
          )}
        >
          <LinePlot
            lines={relativeLines}
            xLabels={[relAxisStart, relAxisMid, relAxisEnd]}
            referenceValue={100}
            scaleMode="centered_reference"
            height={220}
            overlayNote={`※ 先頭データを100として指数化（${relativeTab === 'lme' ? 'LME' : '国内建値'} / 期間:1年間）`}
          />
        </SectionCard>

        <SectionCard
          title="寄与率"
          className="h-full col-span-1"
          titleClassName="whitespace-nowrap"
          right={(
            <div className="inline-flex rounded-lg border border-white/10 overflow-hidden">
              <button
                type="button"
                className={`px-2.5 py-1.5 text-[11px] font-bold whitespace-nowrap ${contributionTab === 'lme' ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`}
                onClick={() => setContributionTab('lme')}
              >
                LME
              </button>
              <button
                type="button"
                className={`px-2.5 py-1.5 text-[11px] font-bold whitespace-nowrap ${contributionTab === 'tatene' ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`}
                onClick={() => setContributionTab('tatene')}
              >
                国内建値
              </button>
            </div>
          )}
        >
          <ContributionBody summary={contributionTab === 'lme' ? lmeContribution : tateneContribution} />
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
            <a className="hover:text-off-white underline underline-offset-2" href="https://www.lme.com/" target="_blank" rel="noreferrer">
              LME
            </a>
            {' / '}
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
