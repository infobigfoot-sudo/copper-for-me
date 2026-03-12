'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { LinePlot, MetricCard, SectionCard, buildPolyline, calcChange, fmtNum, latestPair } from '@/components/native/NativeWidgets';
import { convertJpyMtSeriesToJpyKg, toJpyKgFromUsdMt, valueAtOrBefore } from '@/lib/copper_units';
import type { SeriesPoint } from '@/lib/selected_series_bundle';

type SpanKey = '1y' | '3y' | '5y';
type TrendPairKey = 'tatene_export' | 'tatene_import' | 'tatene_estimate' | 'volume_bars';
type IndicatorDataTabKey = 'yield_export' | 'yield_import' | 'yield_estimate';
type ScrapRelativeKey = 'export' | 'import' | 'net' | 'estimate';

const SPANS: Array<{ key: SpanKey; label: string; days: number }> = [
  { key: '1y', label: '1Y', days: 365 },
  { key: '3y', label: '3Y', days: 365 * 3 },
  { key: '5y', label: '5Y', days: 365 * 5 },
];
const SPAN_MONTHS: Record<SpanKey, number> = {
  '1y': 12,
  '3y': 36,
  '5y': 60,
};

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
const SCRAP_PAIR_COLOR = '#4f7d6a';
const SCRAP_NET_COLOR = '#b86d53';
const SCRAP_ESTIMATE_COLOR = '#2f6d5a';

const SCRAP_RELATIVE_OPTION_TABS: Array<{ key: ScrapRelativeKey; label: string; color: string }> = [
  { key: 'export', label: '輸出', color: LME_COLOR },
  { key: 'import', label: '輸入', color: SCRAP_PAIR_COLOR },
  { key: 'net', label: 'スクラップ', color: SCRAP_NET_COLOR },
  { key: 'estimate', label: '推定', color: SCRAP_ESTIMATE_COLOR },
];

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

function endOfMonthMsFromYm(ym: string): number | null {
  if (!/^\d{4}-\d{2}$/.test(ym)) return null;
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return Date.UTC(year, month, 0, 23, 59, 59, 999);
}

function toYmLabel(dateText: string): string {
  if (/^\d{4}-\d{2}$/.test(dateText)) return dateText;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return dateText.slice(0, 7);
  return dateText;
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

function filterByPeriodDaysEndingAt(rows: SeriesPoint[], days: number, endDate: string): SeriesPoint[] {
  if (!rows.length) return [];
  const endYm = toYmLabel(endDate);
  const endMs = endOfMonthMsFromYm(endYm) ?? toUtcMs(endDate);
  if (endMs === null) return filterByPeriodDays(rows, days);
  const safeDays = Math.max(1, days);
  const cutoff = endMs - (safeDays - 1) * DAY_MS;
  const filtered = rows.filter((row) => {
    const ms = toUtcMs(row.date);
    return ms !== null && ms >= cutoff && ms <= endMs;
  });
  return filtered.length ? filtered : [];
}

function filterByRecentMonthsEndingAt(rows: SeriesPoint[], months: number, endDate: string): SeriesPoint[] {
  if (!rows.length) return [];
  const endYm = toYmLabel(endDate);
  if (!/^\d{4}-\d{2}$/.test(endYm)) return rows;
  const y = Number(endYm.slice(0, 4));
  const m = Number(endYm.slice(5, 7));
  const total = y * 12 + (m - 1);
  const startTotal = total - Math.max(1, months) + 1;
  return rows.filter((row) => {
    const ym = toYmLabel(row.date);
    if (!/^\d{4}-\d{2}$/.test(ym)) return false;
    const ry = Number(ym.slice(0, 4));
    const rm = Number(ym.slice(5, 7));
    const rTotal = ry * 12 + (rm - 1);
    return rTotal >= startTotal && rTotal <= total;
  });
}

function toMonthlyAverage(rows: SeriesPoint[]): SeriesPoint[] {
  if (!rows.length) return [];
  const acc = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    const ym = row.date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym) || !Number.isFinite(row.value)) continue;
    const prev = acc.get(ym);
    if (prev) {
      prev.sum += row.value;
      prev.count += 1;
    } else {
      acc.set(ym, { sum: row.value, count: 1 });
    }
  }
  return Array.from(acc.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, s]) => ({ date, value: s.sum / Math.max(1, s.count) }));
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

function relativeChangePctFromStartRows(baseRows: SeriesPoint[], rows: SeriesPoint[]): SeriesPoint[] {
  if (!baseRows.length) return [];
  if (!rows.length) return baseRows.map((base) => ({ date: base.date, value: 0 }));
  let j = 0;
  let last: number | null = null;
  let baseline: number | null = null;
  return baseRows.map((base) => {
    while (j < rows.length && rows[j].date <= base.date) {
      if (Number.isFinite(rows[j].value)) last = rows[j].value;
      j += 1;
    }
    if (baseline === null && last !== null && Number.isFinite(last)) {
      baseline = last;
    }
    if (last === null || !Number.isFinite(last) || baseline === null || !Number.isFinite(baseline) || baseline === 0) {
      return { date: base.date, value: 0 };
    }
    return { date: base.date, value: ((last - baseline) / Math.abs(baseline)) * 100 };
  });
}

function filterByYmRange(rows: SeriesPoint[], startYm: string, endYm: string): SeriesPoint[] {
  return rows.filter((row) => {
    const ym = toYmLabel(row.date);
    return /^\d{4}-\d{2}$/.test(ym) && ym >= startYm && ym <= endYm;
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
  primaryLabel: string;
  secondaryLabel: string;
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
  primaryLabel,
  secondaryLabel,
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

    const visibleValues: Array<number | null> = [];
    if (visible.lme) visibleValues.push(...lmeVals);
    if (visible.usdJpy) visibleValues.push(...usdJpyVals);
    if (visible.usdCny) visibleValues.push(...usdCnyVals);
    if (visible.premium) visibleValues.push(...premiumVals);
    if (visible.wti) visibleValues.push(...wtiVals);
    const commonScale = scaleOf(visibleValues);

    const yAt = (value: number | null) => {
      if (value === null || !Number.isFinite(value)) return PLOT_BOTTOM;
      return PLOT_BOTTOM - ((value - commonScale.min) / commonScale.range) * (PLOT_BOTTOM - PLOT_TOP);
    };

    const lmePoints = lmeVals.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
    const usdJpyPoints = usdJpyVals.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
    const usdCnyPoints = usdCnyVals.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
    const premiumPoints = premiumVals.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
    const wtiPoints = wtiVals.map((v, i) => ({ x: xAt(i), y: yAt(v) }));

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
  const jan2025Idx = rows.findIndex((row) => row.date.startsWith('2025-01'));
  const splitX = jan2025Idx > 0 ? shape.lmePoints[jan2025Idx]?.x ?? null : null;

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
        <span className="text-[#64748b]">{toYmLabel(shape.active.date)}</span>
        {visible.lme ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: LME_COLOR }} />
            {primaryLabel} <span style={{ color: LME_COLOR }}>{fmtNum(shape.active.lme, 0)}</span>
          </span>
        ) : null}
        {visible.usdJpy ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SCRAP_PAIR_COLOR }} />
            {secondaryLabel} <span style={{ color: SCRAP_PAIR_COLOR }}>{fmtNum(shape.active.usdJpy, 0)}</span>
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
          {visible.usdJpy ? <path d={shape.usdJpyPath} fill="none" stroke={SCRAP_PAIR_COLOR} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {visible.usdCny ? <path d={shape.usdCnyPath} fill="none" stroke={USD_CNY_COLOR} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {visible.premium ? <path d={shape.premiumPath} fill="none" stroke={PREMIUM_COLOR} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {visible.wti ? <path d={shape.wtiPath} fill="none" stroke={WTI_COLOR} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /> : null}

          {splitX !== null ? (
            <line
              x1={splitX.toFixed(2)}
              y1={PLOT_TOP.toFixed(2)}
              x2={splitX.toFixed(2)}
              y2={PLOT_BOTTOM.toFixed(2)}
              stroke="rgba(100,116,139,0.55)"
              strokeDasharray="5 4"
            />
          ) : null}
          {splitX !== null ? (
            <text
              x={(splitX + 6).toFixed(2)}
              y={(PLOT_TOP + 12).toFixed(2)}
              fill="rgba(100,116,139,0.95)"
              fontSize="10"
              fontWeight="700"
            >
              2025-01 7404細分化
            </text>
          ) : null}
          <line x1={activeX.toFixed(2)} y1={PLOT_TOP.toFixed(2)} x2={activeX.toFixed(2)} y2={PLOT_BOTTOM.toFixed(2)} stroke="rgba(53,92,125,0.25)" strokeDasharray="4 3" />

          {visible.lme ? <circle cx={(shape.lmePoints[clampedIndex]?.x || 0).toFixed(2)} cy={(shape.lmePoints[clampedIndex]?.y || 0).toFixed(2)} r="4.2" fill={LME_COLOR} /> : null}
          {visible.usdJpy ? <circle cx={(shape.usdJpyPoints[clampedIndex]?.x || 0).toFixed(2)} cy={(shape.usdJpyPoints[clampedIndex]?.y || 0).toFixed(2)} r="3.2" fill={SCRAP_PAIR_COLOR} /> : null}
          {visible.usdCny ? <circle cx={(shape.usdCnyPoints[clampedIndex]?.x || 0).toFixed(2)} cy={(shape.usdCnyPoints[clampedIndex]?.y || 0).toFixed(2)} r="3.6" fill={USD_CNY_COLOR} /> : null}
          {visible.premium ? <circle cx={(shape.premiumPoints[clampedIndex]?.x || 0).toFixed(2)} cy={(shape.premiumPoints[clampedIndex]?.y || 0).toFixed(2)} r="3.6" fill={PREMIUM_COLOR} /> : null}
          {visible.wti ? <circle cx={(shape.wtiPoints[clampedIndex]?.x || 0).toFixed(2)} cy={(shape.wtiPoints[clampedIndex]?.y || 0).toFixed(2)} r="3.6" fill={WTI_COLOR} /> : null}
        </svg>
      </div>

      <div className="flex justify-between mt-4 text-[9px] sm:text-[14px] text-cool-grey font-black uppercase tracking-[0.2em]">
        <span>{toYmLabel(xLabels[0])}</span>
        <span>{toYmLabel(xLabels[1])}</span>
        <span>{toYmLabel(xLabels[2])}</span>
      </div>
    </>
  );
}

function IndicatorsVolumeBarPlot({
  rows,
  exportRows,
  importRows,
  xLabels,
}: {
  rows: SeriesPoint[];
  exportRows: SeriesPoint[];
  importRows: SeriesPoint[];
  xLabels: [string, string, string];
}) {
  const baseRows = useMemo(() => {
    const all = [...rows, ...exportRows, ...importRows];
    const ymSet = new Set<string>();
    for (const row of all) {
      const ym = toYmLabel(row.date);
      if (/^\d{4}-\d{2}$/.test(ym)) ymSet.add(ym);
    }
    const sorted = Array.from(ymSet).sort((a, b) => a.localeCompare(b));
    if (!sorted.length) return [{ date: '-', value: 0 }, { date: '-', value: 0 }];
    return sorted.map((ym) => ({ date: `${ym}-01`, value: 0 }));
  }, [rows, exportRows, importRows]);
  const [activeIndex, setActiveIndex] = useState(baseRows.length - 1);

  useEffect(() => {
    setActiveIndex(baseRows.length - 1);
  }, [baseRows.length]);

  const expMap = useMemo(() => {
    const out = new Map<string, number>();
    for (const row of exportRows) {
      const ym = toYmLabel(row.date);
      if (/^\d{4}-\d{2}$/.test(ym) && Number.isFinite(row.value)) out.set(ym, row.value);
    }
    return out;
  }, [exportRows]);
  const impMap = useMemo(() => {
    const out = new Map<string, number>();
    for (const row of importRows) {
      const ym = toYmLabel(row.date);
      if (/^\d{4}-\d{2}$/.test(ym) && Number.isFinite(row.value)) out.set(ym, row.value);
    }
    return out;
  }, [importRows]);
  const expVals = baseRows.map((row) => {
    const v = expMap.get(toYmLabel(row.date));
    return v !== undefined && Number.isFinite(v) ? v : null;
  });
  const impVals = baseRows.map((row) => {
    const v = impMap.get(toYmLabel(row.date));
    return v !== undefined && Number.isFinite(v) ? v : null;
  });
  const safe = [...expVals, ...impVals].filter((v): v is number => v !== null && Number.isFinite(v));
  const maxVal = safe.length ? Math.max(...safe) : 1;
  const plotW = PLOT_W - PLOT_PAD_X * 2;
  const groupW = plotW / Math.max(baseRows.length, 1);
  const barW = Math.max(2, Math.min(10, groupW * 0.32));
  const clampedIndex = Math.max(0, Math.min(activeIndex, baseRows.length - 1));
  const xAt = (i: number) => PLOT_PAD_X + groupW * i + groupW * 0.5;
  const activeX = xAt(clampedIndex);
  const yAt = (v: number | null) =>
    v === null || !Number.isFinite(v) ? PLOT_BOTTOM : PLOT_BOTTOM - (v / maxVal) * (PLOT_BOTTOM - PLOT_TOP);
  const jan2025Idx = baseRows.findIndex((row) => row.date.startsWith('2025-01'));
  const splitX = jan2025Idx > 0 ? xAt(jan2025Idx) - groupW / 2 : null;

  const handleMove = (clientX: number, left: number, width: number) => {
    if (width <= 0) return;
    const svgX = ((clientX - left) / width) * PLOT_W;
    let nearest = 0;
    let dist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < baseRows.length; i += 1) {
      const d = Math.abs(xAt(i) - svgX);
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
        <span className="text-[#64748b]">{toYmLabel(baseRows[clampedIndex]?.date || '-')}</span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: LME_COLOR }} />
          輸出量(t) <span style={{ color: LME_COLOR }}>{fmtNum(expVals[clampedIndex] ?? null, 0)}</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SCRAP_PAIR_COLOR }} />
          輸入量(t) <span style={{ color: SCRAP_PAIR_COLOR }}>{fmtNum(impVals[clampedIndex] ?? null, 0)}</span>
        </span>
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
          {baseRows.map((row, idx) => {
            const xCenter = xAt(idx);
            const expY = yAt(expVals[idx]);
            const impY = yAt(impVals[idx]);
            return (
              <g key={`vol-${row.date}-${idx}`}>
                <rect x={xCenter - barW - 1} y={expY} width={barW} height={Math.max(0, PLOT_BOTTOM - expY)} fill={LME_COLOR} rx="1.5" />
                <rect x={xCenter + 1} y={impY} width={barW} height={Math.max(0, PLOT_BOTTOM - impY)} fill={SCRAP_PAIR_COLOR} rx="1.5" />
              </g>
            );
          })}
          {splitX !== null ? (
            <line
              x1={splitX.toFixed(2)}
              y1={PLOT_TOP.toFixed(2)}
              x2={splitX.toFixed(2)}
              y2={PLOT_BOTTOM.toFixed(2)}
              stroke="rgba(100,116,139,0.55)"
              strokeDasharray="5 4"
            />
          ) : null}
          {splitX !== null ? (
            <text
              x={(splitX + 6).toFixed(2)}
              y={(PLOT_TOP + 12).toFixed(2)}
              fill="rgba(100,116,139,0.95)"
              fontSize="10"
              fontWeight="700"
            >
              2025-01 7404細分化
            </text>
          ) : null}
          <line x1={activeX.toFixed(2)} y1={PLOT_TOP.toFixed(2)} x2={activeX.toFixed(2)} y2={PLOT_BOTTOM.toFixed(2)} stroke="rgba(53,92,125,0.25)" strokeDasharray="4 3" />
        </svg>
      </div>
      <div className="flex justify-between mt-4 text-[9px] sm:text-[14px] text-cool-grey font-black uppercase tracking-[0.2em]">
        <span>{toYmLabel(xLabels[0])}</span>
        <span>{toYmLabel(xLabels[1])}</span>
        <span>{toYmLabel(xLabels[2])}</span>
      </div>
    </>
  );
}

function ContributionBody({
  summary,
  periodLabel,
}: {
  summary: ContributionSummary;
  periodLabel: string;
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
      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-cool-grey">期間: {periodLabel}</p>
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
  lmeMonthlySeries,
  tateneSeries,
  usdJpyMonthlySeries,
  scrapExportUnitSeries,
  scrapImportUnitSeries,
  scrapExportWanSeries,
  scrapImportWanSeries,
  scrapNetImportSeries,
}: {
  usdJpySeries: SeriesPoint[];
  usdCnySeries: SeriesPoint[];
  dgs10Series: SeriesPoint[];
  wtiSeries: SeriesPoint[];
  lmeSeries: SeriesPoint[];
  lmeMonthlySeries: SeriesPoint[];
  tateneSeries: SeriesPoint[];
  usdJpyMonthlySeries: SeriesPoint[];
  scrapExportUnitSeries: SeriesPoint[];
  scrapImportUnitSeries: SeriesPoint[];
  scrapExportWanSeries: SeriesPoint[];
  scrapImportWanSeries: SeriesPoint[];
  scrapNetImportSeries: SeriesPoint[];
}) {
  const latestYm = (d?: string | null) => (d && d.length >= 7 ? d.slice(0, 7) : '-');
  const [span, setSpan] = useState<SpanKey>('5y');
  const [trendPair, setTrendPair] = useState<TrendPairKey>('tatene_export');
  const [dataTab, setDataTab] = useState<IndicatorDataTabKey>('yield_export');
  const [relativeSelection, setRelativeSelection] = useState<Record<ScrapRelativeKey, boolean>>({
    export: true,
    import: true,
    net: true,
    estimate: true,
  });
  const lmeJpyKgSeries = useMemo(
    () =>
      lmeSeries
        .map((row) => {
          const usd = valueAtOrBefore(usdJpySeries, row.date);
          if (usd === null || !Number.isFinite(usd)) return null;
          return { date: row.date, value: toJpyKgFromUsdMt(row.value, usd) };
        })
        .filter((row): row is SeriesPoint => row !== null),
    [lmeSeries, usdJpySeries]
  );
  const tateneJpyKgSeries = useMemo(() => convertJpyMtSeriesToJpyKg(tateneSeries), [tateneSeries]);

  const pairedScrapSeries = useMemo(() => {
    const toMonthlyMap = (rows: SeriesPoint[]) => {
      const out = new Map<string, number>();
      for (const row of rows) {
        const ym = row.date.slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(ym) || !Number.isFinite(row.value)) continue;
        out.set(ym, row.value);
      }
      return out;
    };
    const expMap = toMonthlyMap(scrapExportUnitSeries);
    const impMap = toMonthlyMap(scrapImportUnitSeries);
    const netMap = toMonthlyMap(scrapNetImportSeries);
    const commonTradeDates = Array.from(expMap.keys())
      .filter((d) => impMap.has(d))
      .sort((a, b) => a.localeCompare(b));
    const exportRows = commonTradeDates
      .map((ym) => ({ date: `${ym}-01`, value: expMap.get(ym) }))
      .filter((r): r is SeriesPoint => Number.isFinite(r.value));
    const importRows = commonTradeDates
      .map((ym) => ({ date: `${ym}-01`, value: impMap.get(ym) }))
      .filter((r): r is SeriesPoint => Number.isFinite(r.value));
    const netRows = commonTradeDates
      .map((ym) => ({ date: `${ym}-01`, value: netMap.get(ym) }))
      .filter((r): r is SeriesPoint => Number.isFinite(r.value));
    return {
      exportRows,
      importRows,
      netRows,
      commonTradeDates: commonTradeDates.map((ym) => `${ym}-01`),
    };
  }, [scrapExportUnitSeries, scrapImportUnitSeries, scrapNetImportSeries]);
  const scrapNetImportTonSeries = useMemo(
    () => pairedScrapSeries.netRows.map((r) => ({ date: r.date, value: r.value * 10000 })),
    [pairedScrapSeries.netRows]
  );
  const scrapExportTonSeries = useMemo(
    () => toMonthlyAverage(scrapExportWanSeries).map((r) => ({ date: `${r.date}-01`, value: r.value * 10000 })),
    [scrapExportWanSeries]
  );
  const scrapImportTonSeries = useMemo(
    () => toMonthlyAverage(scrapImportWanSeries).map((r) => ({ date: `${r.date}-01`, value: r.value * 10000 })),
    [scrapImportWanSeries]
  );
  const latestCommonVolumeDate = useMemo(() => {
    if (!scrapExportTonSeries.length || !scrapImportTonSeries.length) return null;
    const exportYm = new Set(scrapExportTonSeries.map((r) => toYmLabel(r.date)));
    const common = scrapImportTonSeries
      .map((r) => toYmLabel(r.date))
      .filter((ym) => exportYm.has(ym))
      .sort((a, b) => a.localeCompare(b));
    const latestYm = common.at(-1);
    return latestYm ? `${latestYm}-01` : null;
  }, [scrapExportTonSeries, scrapImportTonSeries]);
  const scrapPurchasePriceSeries = useMemo(() => {
    const lmeMonthly = toMonthlyAverage(lmeMonthlySeries);
    const fxMonthly = toMonthlyAverage(usdJpyMonthlySeries);
    const fxByYm = new Map(fxMonthly.map((r) => [r.date.slice(0, 7), r.value]));
    return lmeMonthly
      .map((row) => {
        const ym = row.date.slice(0, 7);
        const fx = fxByYm.get(ym);
        if (!Number.isFinite(row.value) || fx === undefined || !Number.isFinite(fx)) return null;
        return { date: `${ym}-01`, value: row.value * fx * 0.9 };
      })
      .filter((row): row is SeriesPoint => row !== null && Number.isFinite(row.value));
  }, [lmeMonthlySeries, usdJpyMonthlySeries]);
  const scrapUnit = latestPair(pairedScrapSeries.exportRows);
  const scrapImportUnit = latestPair(pairedScrapSeries.importRows);
  const latestCommonTradeDate = pairedScrapSeries.commonTradeDates.at(-1) ?? null;
  const prevCommonTradeDate =
    pairedScrapSeries.commonTradeDates.length >= 2
      ? pairedScrapSeries.commonTradeDates[pairedScrapSeries.commonTradeDates.length - 2]
      : null;
  const scrapPurchasePrice = {
    latest: latestCommonTradeDate
      ? { date: latestCommonTradeDate, value: valueAtOrBefore(scrapPurchasePriceSeries, latestCommonTradeDate) }
      : null,
    prev: prevCommonTradeDate
      ? { date: prevCommonTradeDate, value: valueAtOrBefore(scrapPurchasePriceSeries, prevCommonTradeDate) }
      : null,
  };
  const scrapUnitChg = calcChange(scrapUnit.latest?.value ?? null, scrapUnit.prev?.value ?? null);
  const scrapImportUnitChg = calcChange(scrapImportUnit.latest?.value ?? null, scrapImportUnit.prev?.value ?? null);
  const oneYearNetRows = useMemo(
    () =>
      latestCommonTradeDate
        ? filterByPeriodDaysEndingAt(scrapNetImportTonSeries, 365, latestCommonTradeDate)
        : filterByPeriodDays(scrapNetImportTonSeries, 365),
    [scrapNetImportTonSeries, latestCommonTradeDate]
  );
  const scrapNetLatest = latestPair(scrapNetImportTonSeries);
  const scrapNetChg = calcChange(scrapNetLatest.latest?.value ?? null, scrapNetLatest.prev?.value ?? null);
  const scrapPurchasePriceChg = calcChange(
    scrapPurchasePrice.latest?.value ?? null,
    scrapPurchasePrice.prev?.value ?? null
  );

  const spanDays = SPANS.find((x) => x.key === span)?.days ?? 93;
  const spanMonths = SPAN_MONTHS[span] ?? 12;
  const scopedByCommonLatest = (rows: SeriesPoint[], days: number) =>
    latestCommonTradeDate ? filterByPeriodDaysEndingAt(rows, days, latestCommonTradeDate) : filterByPeriodDays(rows, days);
  const jpySpan = useMemo(() => filterByPeriodDays(usdJpySeries, spanDays), [usdJpySeries, spanDays]);
  const cnySpan = useMemo(() => filterByPeriodDays(usdCnySeries, spanDays), [usdCnySeries, spanDays]);
  const us10Span = useMemo(() => filterByPeriodDays(dgs10Series, spanDays), [dgs10Series, spanDays]);
  const wtiSpan = useMemo(() => filterByPeriodDays(wtiSeries, spanDays), [wtiSeries, spanDays]);
  const lmeSpan = useMemo(() => filterByPeriodDays(lmeJpyKgSeries, spanDays), [lmeJpyKgSeries, spanDays]);
  const tateneTrendSpan = useMemo(
    () => scopedByCommonLatest(tateneSeries, spanDays),
    [tateneSeries, spanDays, latestCommonTradeDate]
  );
  const scrapExportSpan = useMemo(
    () => scopedByCommonLatest(pairedScrapSeries.exportRows, spanDays),
    [pairedScrapSeries.exportRows, spanDays, latestCommonTradeDate]
  );
  const scrapImportSpan = useMemo(
    () => scopedByCommonLatest(pairedScrapSeries.importRows, spanDays),
    [pairedScrapSeries.importRows, spanDays, latestCommonTradeDate]
  );

  const premiumSeries = useMemo(
    () =>
      tateneSeries
        .map((row) => {
          const lme = valueAtOrBefore(lmeSeries, row.date);
          const usd = valueAtOrBefore(usdJpySeries, row.date);
          if (lme === null || usd === null) return null;
          return { date: row.date, value: row.value / 1000 - toJpyKgFromUsdMt(lme, usd) };
        })
        .filter((r): r is SeriesPoint => r !== null),
    [tateneSeries, lmeSeries, usdJpySeries]
  );
  const premiumSpan = useMemo(() => filterByPeriodDays(premiumSeries, spanDays), [premiumSeries, spanDays]);

  const scrapEstimateSpan = useMemo(
    () => scopedByCommonLatest(scrapPurchasePriceSeries, spanDays),
    [scrapPurchasePriceSeries, spanDays, latestCommonTradeDate]
  );
  const volumeExportSpan = useMemo(
    () =>
      latestCommonVolumeDate
        ? filterByRecentMonthsEndingAt(scrapExportTonSeries, spanMonths, latestCommonVolumeDate)
        : scrapExportTonSeries,
    [scrapExportTonSeries, spanMonths, latestCommonVolumeDate]
  );
  const volumeImportSpan = useMemo(
    () =>
      latestCommonVolumeDate
        ? filterByRecentMonthsEndingAt(scrapImportTonSeries, spanMonths, latestCommonVolumeDate)
        : scrapImportTonSeries,
    [scrapImportTonSeries, spanMonths, latestCommonVolumeDate]
  );
  const trendPrimaryRows = trendPair === 'volume_bars' ? volumeExportSpan : tateneTrendSpan;
  const trendSecondaryRows = useMemo(() => {
    if (trendPair === 'tatene_export') return scrapExportSpan;
    if (trendPair === 'tatene_import') return scrapImportSpan;
    if (trendPair === 'volume_bars') return volumeImportSpan;
    return scrapEstimateSpan;
  }, [trendPair, scrapExportSpan, scrapImportSpan, scrapEstimateSpan, volumeImportSpan]);
  const trendPrimaryLabel = trendPair === 'volume_bars' ? '輸出量(t)' : '国内建値(JPY/mt)';
  const trendSecondaryLabel =
    trendPair === 'tatene_export'
      ? '輸出単価(JPY/mt)'
      : trendPair === 'tatene_import'
        ? '輸入単価(JPY/mt)'
        : trendPair === 'volume_bars'
          ? '輸入量(t)'
        : '推定単価(JPY/mt)';
  const trendPrimaryMonthlyRows = useMemo(() => toMonthlyAverage(trendPrimaryRows), [trendPrimaryRows]);
  const trendSecondaryMonthlyRows = useMemo(() => toMonthlyAverage(trendSecondaryRows), [trendSecondaryRows]);

  const trendBase = useMemo(() => {
    if (trendPair !== 'volume_bars' && trendSecondaryMonthlyRows.length >= 2) return trendSecondaryMonthlyRows;
    if (trendPrimaryMonthlyRows.length >= 2) return trendPrimaryMonthlyRows;
    if (trendSecondaryMonthlyRows.length >= 2) return trendSecondaryMonthlyRows;
    return trendPrimaryMonthlyRows.length ? trendPrimaryMonthlyRows : trendSecondaryMonthlyRows;
  }, [trendPair, trendPrimaryMonthlyRows, trendSecondaryMonthlyRows]);

  const axisStart = trendBase.at(0)?.date || '-';
  const axisMid = trendBase.at(Math.floor(trendBase.length / 2))?.date || '-';
  const axisEnd = trendBase.at(-1)?.date || '-';

  const trendVisible = {
    lme: true,
    usdJpy: true,
    usdCny: false,
    premium: false,
    wti: false,
  };

  const threeYearTateneMonthly = useMemo(
    () => toMonthlyAverage(scopedByCommonLatest(tateneSeries, 365 * 3)),
    [tateneSeries, latestCommonTradeDate]
  );
  const threeYearExportYieldRows = useMemo(
    () =>
      filterByPeriodDays(pairedScrapSeries.exportRows, 365 * 3)
        .map((row) => {
          const tatene = valueAtOrBefore(threeYearTateneMonthly, row.date);
          if (tatene === null || !Number.isFinite(tatene) || tatene === 0) return null;
          return { date: row.date.slice(0, 7), value: (row.value / tatene) * 100 };
        })
        .filter((row): row is SeriesPoint => row !== null && Number.isFinite(row.value)),
    [pairedScrapSeries.exportRows, threeYearTateneMonthly]
  );
  const threeYearExportDetailRows = useMemo(() => {
    const tateneByYm = new Map(threeYearTateneMonthly.map((r) => [r.date.slice(0, 7), r.value]));
    return toMonthlyAverage(scopedByCommonLatest(pairedScrapSeries.exportRows, 365 * 3))
      .map((row) => {
        const ym = row.date.slice(0, 7);
        const tatene = tateneByYm.get(ym);
        if (tatene === undefined || !Number.isFinite(tatene) || tatene === 0 || !Number.isFinite(row.value)) return null;
        return {
          date: ym,
          tatene,
          exportUnit: row.value,
          yieldPct: (row.value / tatene) * 100,
        };
      })
      .filter((row): row is { date: string; tatene: number; exportUnit: number; yieldPct: number } => row !== null);
  }, [pairedScrapSeries.exportRows, threeYearTateneMonthly, latestCommonTradeDate]);
  const threeYearExportDetailDesc = useMemo(() => threeYearExportDetailRows.slice().reverse(), [threeYearExportDetailRows]);
  const threeYearImportYieldRows = useMemo(
    () =>
      filterByPeriodDays(pairedScrapSeries.importRows, 365 * 3)
        .map((row) => {
          const tatene = valueAtOrBefore(threeYearTateneMonthly, row.date);
          if (tatene === null || !Number.isFinite(tatene) || tatene === 0) return null;
          return { date: row.date.slice(0, 7), value: (row.value / tatene) * 100 };
        })
        .filter((row): row is SeriesPoint => row !== null && Number.isFinite(row.value)),
    [pairedScrapSeries.importRows, threeYearTateneMonthly]
  );
  const threeYearImportDetailRows = useMemo(() => {
    const tateneByYm = new Map(threeYearTateneMonthly.map((r) => [r.date.slice(0, 7), r.value]));
    return toMonthlyAverage(scopedByCommonLatest(pairedScrapSeries.importRows, 365 * 3))
      .map((row) => {
        const ym = row.date.slice(0, 7);
        const tatene = tateneByYm.get(ym);
        if (tatene === undefined || !Number.isFinite(tatene) || tatene === 0 || !Number.isFinite(row.value)) return null;
        return {
          date: ym,
          tatene,
          importUnit: row.value,
          yieldPct: (row.value / tatene) * 100,
        };
      })
      .filter((row): row is { date: string; tatene: number; importUnit: number; yieldPct: number } => row !== null);
  }, [pairedScrapSeries.importRows, threeYearTateneMonthly, latestCommonTradeDate]);
  const threeYearEstimateDetailRows = useMemo(() => {
    const tateneByYm = new Map(threeYearTateneMonthly.map((r) => [r.date.slice(0, 7), r.value]));
    return toMonthlyAverage(scopedByCommonLatest(scrapPurchasePriceSeries, 365 * 3))
      .map((row) => {
        const ym = row.date.slice(0, 7);
        const tatene = tateneByYm.get(ym);
        if (tatene === undefined || !Number.isFinite(tatene) || tatene === 0 || !Number.isFinite(row.value)) return null;
        return {
          date: ym,
          tatene,
          estimateUnit: row.value,
          yieldPct: (row.value / tatene) * 100,
        };
      })
      .filter((row): row is { date: string; tatene: number; estimateUnit: number; yieldPct: number } => row !== null);
  }, [scrapPurchasePriceSeries, threeYearTateneMonthly, latestCommonTradeDate]);

  const relBase = useMemo(
    () =>
      toMonthlyAverage(
        latestCommonTradeDate
          ? filterByPeriodDaysEndingAt(tateneSeries, 365, latestCommonTradeDate)
          : filterByPeriodDays(tateneSeries, 365)
      ).map((row) => ({ date: `${row.date}-01`, value: row.value })),
    [tateneSeries, latestCommonTradeDate]
  );
  const relTatene = useMemo(() => relativeChangePctFromStartRows(relBase, relBase), [relBase]);
  const relExport = useMemo(
    () => relativeChangePctFromStartRows(relBase, pairedScrapSeries.exportRows),
    [relBase, pairedScrapSeries.exportRows]
  );
  const relImport = useMemo(
    () => relativeChangePctFromStartRows(relBase, pairedScrapSeries.importRows),
    [relBase, pairedScrapSeries.importRows]
  );
  const relNet = useMemo(
    () => relativeChangePctFromStartRows(relBase, scrapNetImportTonSeries),
    [relBase, scrapNetImportTonSeries]
  );
  const relEstimate = useMemo(
    () => relativeChangePctFromStartRows(relBase, scrapPurchasePriceSeries),
    [relBase, scrapPurchasePriceSeries]
  );
  const relAxisStart = toYmLabel(relBase.at(0)?.date || '-');
  const relAxisMid = toYmLabel(relBase.at(Math.floor(relBase.length / 2))?.date || '-');
  const relAxisEnd = toYmLabel(relBase.at(-1)?.date || '-');
  const relativeLines = [
    { values: relTatene.map((r) => r.value), color: TATENE_COLOR },
    ...(relativeSelection.export ? [{ values: relExport.map((r) => r.value), color: LME_COLOR }] : []),
    ...(relativeSelection.import ? [{ values: relImport.map((r) => r.value), color: SCRAP_PAIR_COLOR }] : []),
    ...(relativeSelection.net ? [{ values: relNet.map((r) => r.value), color: SCRAP_NET_COLOR }] : []),
    ...(relativeSelection.estimate ? [{ values: relEstimate.map((r) => r.value), color: SCRAP_ESTIMATE_COLOR }] : []),
  ];
  const contributionStartYm = '2025-01';
  const contributionEndYm = '2025-12';
  const tateneContributionBase = useMemo(
    () => filterByYmRange(toMonthlyAverage(tateneSeries).map((row) => ({ date: `${row.date}-01`, value: row.value })), contributionStartYm, contributionEndYm),
    [tateneSeries]
  );
  const contributionFactors = useMemo(
    () => [
      { label: '輸出単価', color: LME_COLOR, rows: filterByYmRange(pairedScrapSeries.exportRows, contributionStartYm, contributionEndYm) },
      { label: '輸入単価', color: SCRAP_PAIR_COLOR, rows: filterByYmRange(pairedScrapSeries.importRows, contributionStartYm, contributionEndYm) },
      { label: '純輸入量', color: SCRAP_NET_COLOR, rows: filterByYmRange(scrapNetImportTonSeries, contributionStartYm, contributionEndYm) },
    ],
    [pairedScrapSeries.exportRows, pairedScrapSeries.importRows, scrapNetImportTonSeries]
  );
  const tateneContribution = useMemo(
    () => computeContributionSummary(tateneContributionBase, contributionFactors),
    [tateneContributionBase, contributionFactors]
  );
  const threeYearExportYieldDesc = useMemo(() => threeYearExportYieldRows.slice().reverse(), [threeYearExportYieldRows]);
  const threeYearImportYieldDesc = useMemo(() => threeYearImportYieldRows.slice().reverse(), [threeYearImportYieldRows]);
  const threeYearImportDetailDesc = useMemo(() => threeYearImportDetailRows.slice().reverse(), [threeYearImportDetailRows]);
  const threeYearEstimateDetailDesc = useMemo(() => threeYearEstimateDetailRows.slice().reverse(), [threeYearEstimateDetailRows]);
  const visibleRows = 10;
  const tabTableViewportPx = 40 + visibleRows * 36;
  const oneYearRows =
    dataTab === 'yield_export'
      ? threeYearExportYieldDesc
      : dataTab === 'yield_import'
        ? threeYearImportYieldDesc
        : [];
  const dataValueDigits = 2;
  const dataLabel =
    dataTab === 'yield_export'
      ? '建値+輸出 歩留率(輸出/建値, %)'
      : dataTab === 'yield_import'
        ? '建値+輸入 歩留率(輸入/建値, %)'
        : '建値+推定単価 歩留率(推定/建値, %)';
  const isExportPending =
    Boolean(latestCommonTradeDate && latestCommonTradeDate.slice(0, 7) >= '2025-01') &&
    (scrapUnit.latest?.value ?? null) === 0;
  const exportCardValue = isExportPending ? '待機中' : fmtNum(scrapUnit.latest?.value ?? null, 0);
  const exportCardUnit = isExportPending ? '' : 'JPY/mt';

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <MetricCard
          label="7404 輸出単価（日本）"
          labelNote={`~2024:7404合計 / 2025~:明細 / 最新:${latestYm(latestCommonTradeDate)}`}
          change={scrapUnitChg}
          positiveWhenUp={true}
          value={exportCardValue}
          unit={exportCardUnit}
          polyline={buildPolyline(pairedScrapSeries.exportRows.slice(-7).map((r) => r.value))}
          gaugeRangeValues={pairedScrapSeries.exportRows.slice(-31).map((r) => r.value)}
          gaugeCurrentChange={scrapUnitChg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={latestYm(latestCommonTradeDate)}
        />
        <MetricCard
          label="7404 輸入単価（日本）"
          labelNote={`~2024:7404合計 / 2025~:明細 / 最新:${latestYm(latestCommonTradeDate)}`}
          change={scrapImportUnitChg}
          positiveWhenUp={false}
          value={fmtNum(scrapImportUnit.latest?.value ?? null, 0)}
          unit="JPY/mt"
          polyline={buildPolyline(pairedScrapSeries.importRows.slice(-7).map((r) => r.value))}
          gaugeRangeValues={pairedScrapSeries.importRows.slice(-31).map((r) => r.value)}
          gaugeCurrentChange={scrapImportUnitChg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={latestYm(latestCommonTradeDate)}
        />
        <MetricCard
          label="スクラップ純輸入量"
          labelNote={`~2024:7404合計 / 2025~:明細差分 / 最新:${latestYm(latestCommonTradeDate)}`}
          change={scrapNetChg}
          positiveWhenUp={true}
          value={fmtNum(scrapNetLatest.latest?.value ?? null, 0)}
          unit="t"
          polyline={buildPolyline(scrapNetImportTonSeries.slice(-7).map((r) => r.value))}
          gaugeRangeValues={oneYearNetRows.map((r) => r.value)}
          gaugeCurrentChange={scrapNetChg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={latestYm(latestCommonTradeDate)}
        />
        <MetricCard
          label="推定・直接取引相場"
          labelNote="推定単価"
          change={scrapPurchasePriceChg}
          positiveWhenUp={true}
          value={fmtNum(scrapPurchasePrice.latest?.value ?? null, 0)}
          unit="JPY/mt"
          polyline={buildPolyline(scrapPurchasePriceSeries.slice(-7).map((r) => r.value))}
          gaugeRangeValues={scrapPurchasePriceSeries.slice(-31).map((r) => r.value)}
          gaugeCurrentChange={scrapPurchasePriceChg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={latestYm(latestCommonTradeDate)}
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
                  className={`px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${trendPair === 'tatene_export' ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`}
                  onClick={() => setTrendPair('tatene_export')}
                >
                  建値+輸出
                </button>
                <button
                  type="button"
                  className={`px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${trendPair === 'tatene_import' ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`}
                  onClick={() => setTrendPair('tatene_import')}
                >
                  建値+輸入
                </button>
                <button
                  type="button"
                  className={`px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${trendPair === 'volume_bars' ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`}
                  onClick={() => setTrendPair('volume_bars')}
                >
                  輸入量+輸出量
                </button>
                <button
                  type="button"
                  className={`px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${trendPair === 'tatene_estimate' ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`}
                  onClick={() => setTrendPair('tatene_estimate')}
                >
                  建値+推定
                </button>
              </div>
            </div>
            {trendPair === 'volume_bars' ? (
              <IndicatorsVolumeBarPlot
                rows={trendBase}
                exportRows={volumeExportSpan}
                importRows={volumeImportSpan}
                xLabels={[axisStart, axisMid, axisEnd]}
              />
            ) : (
              <IndicatorsTrendPlot
                baseRows={trendBase}
                lmeRows={trendPrimaryMonthlyRows}
                usdJpyRows={trendSecondaryMonthlyRows}
                usdCnyRows={cnySpan}
                premiumRows={premiumSpan}
                wtiRows={wtiSpan}
                xLabels={[axisStart, axisMid, axisEnd]}
                primaryLabel={trendPrimaryLabel}
                secondaryLabel={trendSecondaryLabel}
                visible={trendVisible}
              />
            )}
          </SectionCard>
        </div>
        <article className="glass-card rounded-3xl p-8">
          <div className="mb-4 flex flex-col gap-3">
            <h4 className="text-[14px] font-black text-cool-grey uppercase tracking-[0.2em] sm:tracking-[0.3em] whitespace-nowrap">
              3年データ
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
              <button
                type="button"
                className={`px-2 py-2 text-[9px] sm:text-[10px] leading-none font-bold text-center whitespace-nowrap rounded-md border ${dataTab === 'yield_export' ? 'bg-positive/20 text-positive border-positive/30' : 'text-cool-grey hover:text-off-white border-white/10'}`}
                onClick={() => setDataTab('yield_export')}
              >
                建値+輸出
              </button>
              <button
                type="button"
                className={`px-2 py-2 text-[9px] sm:text-[10px] leading-none font-bold text-center whitespace-nowrap rounded-md border ${dataTab === 'yield_import' ? 'bg-positive/20 text-positive border-positive/30' : 'text-cool-grey hover:text-off-white border-white/10'}`}
                onClick={() => setDataTab('yield_import')}
              >
                建値+輸入
              </button>
                <button
                  type="button"
                className={`px-2 py-2 text-[9px] sm:text-[10px] leading-none font-bold text-center whitespace-nowrap rounded-md border ${dataTab === 'yield_estimate' ? 'bg-positive/20 text-positive border-positive/30' : 'text-cool-grey hover:text-off-white border-white/10'}`}
                onClick={() => setDataTab('yield_estimate')}
              >
                建値+推定単価
              </button>
            </div>
          </div>
          <div
            className="w-full overflow-y-scroll overflow-x-hidden calm-scrollbar rounded-lg border border-white/10 bg-[#f3f1ed]/70"
            style={{ minHeight: `${tabTableViewportPx}px`, maxHeight: `${tabTableViewportPx}px`, height: `${tabTableViewportPx}px` }}
          >
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className={dataTab !== 'yield_estimate' ? 'w-[24%]' : 'w-[24%]'} />
                <col className={dataTab !== 'yield_estimate' ? 'w-[26%]' : 'w-[26%]'} />
                <col className={dataTab !== 'yield_estimate' ? 'w-[26%]' : 'w-[26%]'} />
                <col className="w-[24%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-[#ece7df]/95 backdrop-blur-sm border-b border-[#ddd5ca]">
                {dataTab === 'yield_export' ? (
                  <tr>
                    <th className="text-left px-2 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-cool-grey whitespace-nowrap">日付</th>
                    <th className="text-right px-2 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-cool-grey whitespace-nowrap">国内建値</th>
                    <th className="text-right px-2 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-cool-grey whitespace-nowrap">輸出単価</th>
                    <th className="text-right px-2 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-cool-grey whitespace-nowrap">歩留率(%)</th>
                  </tr>
                ) : dataTab === 'yield_import' ? (
                  <tr>
                    <th className="text-left px-2 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-cool-grey whitespace-nowrap">日付</th>
                    <th className="text-right px-2 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-cool-grey whitespace-nowrap">国内建値</th>
                    <th className="text-right px-2 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-cool-grey whitespace-nowrap">輸入単価</th>
                    <th className="text-right px-2 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-cool-grey whitespace-nowrap">歩留率(%)</th>
                  </tr>
                ) : dataTab === 'yield_estimate' ? (
                  <tr>
                    <th className="text-left px-2 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-cool-grey whitespace-nowrap">日付</th>
                    <th className="text-right px-2 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-cool-grey whitespace-nowrap">国内建値</th>
                    <th className="text-right px-2 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-cool-grey whitespace-nowrap">推定単価</th>
                    <th className="text-right px-2 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-cool-grey whitespace-nowrap">歩留率(%)</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="text-left px-2.5 py-2 text-[12px] font-black uppercase tracking-[0.12em] text-cool-grey whitespace-nowrap">日付</th>
                    <th className="text-right px-2.5 py-2 text-[12px] font-black uppercase tracking-[0.12em] text-cool-grey whitespace-nowrap">
                      {dataLabel}
                    </th>
                    <th className="text-right px-2.5 py-2 text-[12px] font-black uppercase tracking-[0.12em] text-cool-grey whitespace-nowrap">増減</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {dataTab === 'yield_export'
                  ? threeYearExportDetailDesc.map((row, idx) => (
                    <tr key={`${dataTab}-detail-row-${row.date}-${idx}`} className="h-9 border-t border-[#e5dfd5]">
                      <td className="px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-cool-grey whitespace-nowrap">{row.date}</td>
                      <td className="px-2 py-2.5 text-right text-[12px] leading-tight text-off-white whitespace-nowrap">{fmtNum(row.tatene, 0)}</td>
                      <td className="px-2 py-2.5 text-right text-[12px] leading-tight text-off-white whitespace-nowrap">{fmtNum(row.exportUnit, 0)}</td>
                      <td className="px-2 py-2.5 text-right text-[12px] leading-tight text-off-white whitespace-nowrap">{fmtNum(row.yieldPct, 2)}</td>
                    </tr>
                  ))
                  : dataTab === 'yield_import'
                    ? threeYearImportDetailDesc.map((row, idx) => (
                      <tr key={`${dataTab}-detail-row-${row.date}-${idx}`} className="h-9 border-t border-[#e5dfd5]">
                        <td className="px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-cool-grey whitespace-nowrap">{row.date}</td>
                        <td className="px-2 py-2.5 text-right text-[12px] leading-tight text-off-white whitespace-nowrap">{fmtNum(row.tatene, 0)}</td>
                        <td className="px-2 py-2.5 text-right text-[12px] leading-tight text-off-white whitespace-nowrap">{fmtNum(row.importUnit, 0)}</td>
                        <td className="px-2 py-2.5 text-right text-[12px] leading-tight text-off-white whitespace-nowrap">{fmtNum(row.yieldPct, 2)}</td>
                      </tr>
                    ))
                    : dataTab === 'yield_estimate'
                      ? threeYearEstimateDetailDesc.map((row, idx) => (
                        <tr key={`${dataTab}-detail-row-${row.date}-${idx}`} className="h-9 border-t border-[#e5dfd5]">
                          <td className="px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-cool-grey whitespace-nowrap">{row.date}</td>
                          <td className="px-2 py-2.5 text-right text-[12px] leading-tight text-off-white whitespace-nowrap">{fmtNum(row.tatene, 0)}</td>
                          <td className="px-2 py-2.5 text-right text-[12px] leading-tight text-off-white whitespace-nowrap">{fmtNum(row.estimateUnit, 0)}</td>
                          <td className="px-2 py-2.5 text-right text-[12px] leading-tight text-off-white whitespace-nowrap">{fmtNum(row.yieldPct, 2)}</td>
                        </tr>
                      ))
                  : oneYearRows.map((row, idx, rows) => {
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
              <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cool-grey">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TATENE_COLOR }} />
                国内建値
              </span>
              <div className="inline-flex rounded-lg border border-white/10 overflow-hidden">
                {SCRAP_RELATIVE_OPTION_TABS.map((item, idx) => {
                  const active = relativeSelection[item.key];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`inline-flex items-center gap-2 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] ${idx > 0 ? 'border-l border-white/10' : ''} ${active ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`}
                      onClick={() =>
                        setRelativeSelection((prev) => ({
                          ...prev,
                          [item.key]: !prev[item.key],
                        }))
                      }
                    >
                      <span className="text-[11px] leading-none font-mono">{active ? '-' : '+'}</span>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        >
          <LinePlot
            lines={relativeLines}
            xLabels={[relAxisStart, relAxisMid, relAxisEnd]}
            referenceValue={0}
            scaleMode="centered_reference"
            height={220}
            overlayNote="※ 各系列の開始月を0%として増減率を表示（1年間）"
          />
        </SectionCard>

        <SectionCard
          title="寄与率"
          className="h-full col-span-1"
          titleClassName="whitespace-nowrap"
        >
          <ContributionBody summary={tateneContribution} periodLabel="2025-01〜2025-12" />
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
            <a className="hover:text-off-white underline underline-offset-2" href="https://www.worldbank.org/" target="_blank" rel="noreferrer">World Bank</a>
            {' / '}
            <a className="hover:text-off-white underline underline-offset-2" href="https://comtradeplus.un.org/" target="_blank" rel="noreferrer">United Nations</a>
            {' / '}
            <a className="hover:text-off-white underline underline-offset-2" href="https://www.customs.go.jp/toukei/info/" target="_blank" rel="noreferrer">財務省</a>
          </div>
        </article>
      </div>
    </>
  );
}
