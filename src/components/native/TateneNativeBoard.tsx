'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { LinePlot, MetricCard, SectionCard, buildPolyline, calcChange, fmtNum, latestPair } from '@/components/native/NativeWidgets';
import type { SeriesPoint } from '@/lib/selected_series_bundle';

type SpanKey = '1y' | '3y' | '5y';
type MarketArticle = { title: string; href: string };
type ImportShiftKey = 'none' | 'lag2m';
type RelativeOptionalKey = 'import_unit' | 'usd_jpy' | 'inventory';
type ContributionItem = { label: string; color: string; share: number };
type ContributionSummary = { dominant: ContributionItem; items: ContributionItem[] };

const SPANS: Array<{ key: SpanKey; label: string; days: number }> = [
  { key: '1y', label: '1Y', days: 365 },
  { key: '3y', label: '3Y', days: 365 * 3 },
  { key: '5y', label: '5Y', days: 365 * 5 },
];
const TATENE_CONTRIBUTION_START_MONTH = '2025-01';
const TATENE_CONTRIBUTION_END_MONTH = '2025-12';

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcMs(dateText: string): number | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    const parsed = Date.parse(`${dateText}T00:00:00Z`);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (/^\d{4}-\d{2}$/.test(dateText)) {
    const [yText, mText] = dateText.split('-');
    const year = Number(yText);
    const month = Number(mText);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
    return Date.UTC(year, month, 0);
  }
  return null;
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

function idxRows(rows: SeriesPoint[]): SeriesPoint[] {
  const base = rows[0]?.value || 1;
  return rows.map((r) => ({ ...r, value: (r.value / base) * 100 }));
}

function shiftSeriesByMonths(rows: SeriesPoint[], months: number): SeriesPoint[] {
  if (!rows.length || months === 0) return rows;
  return rows.map((row) => {
    const parsedDay = /^(\d{4})-(\d{2})-(\d{2})$/.exec(row.date);
    const parsedMonth = /^(\d{4})-(\d{2})$/.exec(row.date);
    if (!parsedDay && !parsedMonth) return row;
    const year = Number((parsedDay || parsedMonth)?.[1] || NaN);
    const month = Number((parsedDay || parsedMonth)?.[2] || NaN);
    const day = parsedDay ? Number(parsedDay[3]) : 1;
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return row;
    const totalMonths = year * 12 + (month - 1) + months;
    const shiftedYear = Math.floor(totalMonths / 12);
    const shiftedMonth = (totalMonths % 12) + 1;
    const clampedDay = Math.min(day, new Date(Date.UTC(shiftedYear, shiftedMonth, 0)).getUTCDate());
    const nextDate = parsedDay
      ? `${String(shiftedYear).padStart(4, '0')}-${String(shiftedMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
      : `${String(shiftedYear).padStart(4, '0')}-${String(shiftedMonth).padStart(2, '0')}`;
    return { ...row, date: nextDate };
  });
}

type TateneTrendPlotProps = {
  tateneRows: SeriesPoint[];
  importUnitRows: SeriesPoint[];
  importLagMonths: number;
  xLabels: [string, string, string];
};

type Scale = { min: number; range: number };

const PLOT_W = 800;
const PLOT_H = 320;
const PLOT_PAD_X = 12;
const PLOT_TOP = 18;
const PLOT_BOTTOM = PLOT_H - 18;
const TATENE_PRICE_COLOR = '#355c7d';
const TATENE_IMPORT_COLOR = '#2f6d5a';
const TATENE_USD_COLOR = '#ca83cc';
const TATENE_INVENTORY_COLOR = '#7aa6c2';
const RELATIVE_OPTION_TABS: Array<{ key: RelativeOptionalKey; label: string; color: string }> = [
  { key: 'import_unit', label: '輸入単価', color: TATENE_IMPORT_COLOR },
  { key: 'usd_jpy', label: 'USD/JPY', color: TATENE_USD_COLOR },
  { key: 'inventory', label: '電気銅在庫量', color: TATENE_INVENTORY_COLOR },
];

function alignSeriesByDate(baseRows: SeriesPoint[], rows: SeriesPoint[]): Array<number | null> {
  if (!baseRows.length || !rows.length) return baseRows.map(() => null);
  const byDate = new Map(rows.map((row) => [row.date, row.value] as const));
  return baseRows.map((base) => {
    const value = byDate.get(base.date);
    return value !== undefined && Number.isFinite(value) ? value : null;
  });
}

function toMonthKey(dateText: string): string {
  const raw = String(dateText || '').trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(0, 7);
  return '';
}

function indexAlignedValues(values: Array<number | null>): Array<number | null> {
  const base = values.find((v): v is number => v !== null && Number.isFinite(v) && v !== 0);
  if (base === undefined) return values.map(() => null);
  return values.map((value) => (value !== null && Number.isFinite(value) ? (value / base) * 100 : null));
}

function withCarryForward(rows: Array<{ date: string; value: number | null }>): Array<{ date: string; value: number }> {
  const first = rows.find((row) => row.value !== null && Number.isFinite(row.value))?.value ?? 0;
  let last = first;
  return rows.map((row) => {
    if (row.value !== null && Number.isFinite(row.value)) last = row.value;
    return { date: row.date, value: last };
  });
}

function computeContributionSummary(
  targetRows: Array<{ date: string; value: number }>,
  factors: Array<{ label: string; color: string; rows: Array<{ date: string; value: number }> }>,
  lookbackPoints = 12
): ContributionSummary {
  if (!factors.length) {
    const fallback = { label: '-', color: '#94a3b8', share: 0 };
    return { dominant: fallback, items: [fallback] };
  }
  const target = targetRows.slice(-Math.max(lookbackPoints, 2));
  if (target.length < 2) {
    const eq = 100 / factors.length;
    const items = factors.map((factor) => ({ label: factor.label, color: factor.color, share: eq }));
    return { dominant: items[0], items };
  }

  const factorMaps = factors.map((factor) => ({
    label: factor.label,
    color: factor.color,
    byDate: new Map(factor.rows.map((row) => [row.date, row.value])),
  }));
  const samples: Array<{ target: number; factors: number[] }> = [];
  for (let i = 1; i < target.length; i += 1) {
    const curr = target[i];
    const prev = target[i - 1];
    const targetChange = calcChange(curr.value, prev.value);
    if (targetChange === null || !Number.isFinite(targetChange)) continue;
    const factorChanges: number[] = [];
    let valid = true;
    for (const factor of factorMaps) {
      const currValue = factor.byDate.get(curr.date);
      const prevValue = factor.byDate.get(prev.date);
      const factorChange = calcChange(currValue ?? null, prevValue ?? null);
      if (factorChange === null || !Number.isFinite(factorChange)) {
        valid = false;
        break;
      }
      factorChanges.push(factorChange);
    }
    if (valid) samples.push({ target: targetChange, factors: factorChanges });
  }

  if (samples.length < 2) {
    const eq = 100 / factors.length;
    const items = factors.map((factor) => ({ label: factor.label, color: factor.color, share: eq }));
    return { dominant: items[0], items };
  }

  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const betas = factorMaps.map((_, idx) => {
    const xs = samples.map((sample) => sample.factors[idx]);
    const ys = samples.map((sample) => sample.target);
    const meanX = mean(xs);
    const meanY = mean(ys);
    let covariance = 0;
    let varianceX = 0;
    for (let i = 0; i < xs.length; i += 1) {
      const dx = xs[i] - meanX;
      covariance += dx * (ys[i] - meanY);
      varianceX += dx * dx;
    }
    return varianceX > 1e-9 ? covariance / varianceX : 0;
  });

  const rawScores = factorMaps.map((_, idx) =>
    samples.reduce((sum, sample) => sum + Math.abs(betas[idx] * sample.factors[idx]), 0)
  );
  const absSum = rawScores.reduce((sum, value) => sum + value, 0);
  const fallbackShare = 100 / factors.length;
  const baseItems = factorMaps.map((factor, idx) => ({
    label: factor.label,
    color: factor.color,
    share: absSum > 0 ? (rawScores[idx] / absSum) * 100 : fallbackShare,
  }));
  const rounded = baseItems.map((item) => Number(item.share.toFixed(1)));
  const roundedDiff = Number((100 - rounded.reduce((sum, value) => sum + value, 0)).toFixed(1));
  if (rounded.length) rounded[rounded.length - 1] = Number((rounded[rounded.length - 1] + roundedDiff).toFixed(1));
  const items = baseItems.map((item, idx) => ({ ...item, share: rounded[idx] ?? 0 }));
  const dominant = items.slice().sort((a, b) => b.share - a.share)[0] ?? { label: '-', color: '#94a3b8', share: 0 };
  return { dominant, items };
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

function buildSmoothPathSegments(
  points: Array<{ x: number; y: number | null }>
): string[] {
  const segments: string[] = [];
  let current: Array<{ x: number; y: number }> = [];
  for (const point of points) {
    if (point.y === null || !Number.isFinite(point.y)) {
      if (current.length >= 2) segments.push(buildSmoothPath(current));
      current = [];
      continue;
    }
    current.push({ x: point.x, y: point.y });
  }
  if (current.length >= 2) segments.push(buildSmoothPath(current));
  return segments;
}

function shiftDateTextByMonths(dateText: string, months: number): string {
  const parsedDay = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  const parsedMonth = /^(\d{4})-(\d{2})$/.exec(dateText);
  if (!parsedDay && !parsedMonth) return dateText;
  const year = Number((parsedDay || parsedMonth)?.[1] || NaN);
  const month = Number((parsedDay || parsedMonth)?.[2] || NaN);
  const day = parsedDay ? Number(parsedDay[3]) : 1;
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return dateText;
  const totalMonths = year * 12 + (month - 1) + months;
  const shiftedYear = Math.floor(totalMonths / 12);
  const shiftedMonth = (totalMonths % 12) + 1;
  const clampedDay = Math.min(day, new Date(Date.UTC(shiftedYear, shiftedMonth, 0)).getUTCDate());
  return parsedDay
    ? `${String(shiftedYear).padStart(4, '0')}-${String(shiftedMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
    : `${String(shiftedYear).padStart(4, '0')}-${String(shiftedMonth).padStart(2, '0')}`;
}

function TateneTrendPlot({ tateneRows, importUnitRows, importLagMonths, xLabels }: TateneTrendPlotProps) {
  const baseRows = tateneRows.length >= 2 ? tateneRows : [{ date: '-', value: 0 }, { date: '-', value: 0 }];
  const [activeIndex, setActiveIndex] = useState(baseRows.length - 1);

  useEffect(() => {
    setActiveIndex(baseRows.length - 1);
  }, [baseRows.length]);

  const shape = useMemo(() => {
    const plotW = PLOT_W - PLOT_PAD_X * 2;
    const xAt = (i: number) => PLOT_PAD_X + (plotW * i) / Math.max(baseRows.length - 1, 1);
    const tateneVals = alignSeriesByDate(baseRows, tateneRows);
    const importVals = alignSeriesByDate(baseRows, importUnitRows);
    const tateneScale = scaleOf(tateneVals);
    const importScale = scaleOf(importVals);
    const yAt = (value: number | null, scale: Scale) => {
      if (value === null || !Number.isFinite(value)) return null;
      return PLOT_BOTTOM - ((value - scale.min) / scale.range) * (PLOT_BOTTOM - PLOT_TOP);
    };
    const tatenePoints = tateneVals.map((v, i) => ({ x: xAt(i), y: yAt(v, tateneScale) }));
    const importPoints = importVals.map((v, i) => ({ x: xAt(i), y: yAt(v, importScale) }));
    return {
      tatenePoints,
      importPoints,
      tatenePaths: buildSmoothPathSegments(tatenePoints),
      importPaths: buildSmoothPathSegments(importPoints),
      active: {
        date: baseRows.at(Math.max(0, Math.min(activeIndex, baseRows.length - 1)))?.date || '-',
        tatene: tateneVals.at(Math.max(0, Math.min(activeIndex, tateneVals.length - 1))) ?? null,
        importUnit: importVals.at(Math.max(0, Math.min(activeIndex, importVals.length - 1))) ?? null,
      },
    };
  }, [activeIndex, baseRows, tateneRows, importUnitRows]);

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
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TATENE_PRICE_COLOR }} />
          国内建値 <span style={{ color: TATENE_PRICE_COLOR }}>{fmtNum(shape.active.tatene, 0)}</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TATENE_IMPORT_COLOR }} />
          輸入単価{importLagMonths ? `(${shiftDateTextByMonths(shape.active.date, -importLagMonths).slice(0, 7)})` : ''}{' '}
          <span style={{ color: TATENE_IMPORT_COLOR }}>{fmtNum(shape.active.importUnit, 1)}</span>
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
          <line x1={PLOT_PAD_X} y1={(PLOT_TOP + PLOT_BOTTOM) / 2} x2={PLOT_W - PLOT_PAD_X} y2={(PLOT_TOP + PLOT_BOTTOM) / 2} stroke="rgba(100,116,139,0.16)" strokeDasharray="4 4" />

          {shape.tatenePaths.map((path, idx) => (
            <path key={`tatene-path-${idx}`} d={path} fill="none" stroke={TATENE_PRICE_COLOR} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {shape.importPaths.map((path, idx) => (
            <path key={`import-path-${idx}`} d={path} fill="none" stroke={TATENE_IMPORT_COLOR} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          ))}

          <line x1={activeX.toFixed(2)} y1={PLOT_TOP.toFixed(2)} x2={activeX.toFixed(2)} y2={PLOT_BOTTOM.toFixed(2)} stroke="rgba(53,92,125,0.25)" strokeDasharray="4 3" />
          {shape.tatenePoints[clampedIndex]?.y !== null ? (
            <circle cx={(shape.tatenePoints[clampedIndex]?.x || 0).toFixed(2)} cy={(shape.tatenePoints[clampedIndex]?.y || 0).toFixed(2)} r="4.2" fill={TATENE_PRICE_COLOR} />
          ) : null}
          {shape.importPoints[clampedIndex]?.y !== null ? (
            <circle cx={(shape.importPoints[clampedIndex]?.x || 0).toFixed(2)} cy={(shape.importPoints[clampedIndex]?.y || 0).toFixed(2)} r="3.6" fill={TATENE_IMPORT_COLOR} />
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
  importValueSeries,
  importUnitSeries,
  electricCopperInventorySeries,
  marketArticles,
}: {
  priceSeries: SeriesPoint[];
  usdJpySeries: SeriesPoint[];
  tateneSeries: SeriesPoint[];
  importValueSeries: SeriesPoint[];
  importUnitSeries: SeriesPoint[];
  electricCopperInventorySeries: SeriesPoint[];
  marketArticles: MarketArticle[];
}) {
  const [span, setSpan] = useState<SpanKey>('1y');
  const [importShift, setImportShift] = useState<ImportShiftKey>('none');
  const [relativeSelection, setRelativeSelection] = useState<Record<RelativeOptionalKey, boolean>>({
    import_unit: true,
    usd_jpy: true,
    inventory: true,
  });
  const spanDays = SPANS.find((x) => x.key === span)?.days ?? 365;
  const tateneJpyMtSeries = useMemo(() => tateneSeries, [tateneSeries]);
  const importUnitDisplaySeries = useMemo(
    () => (importShift === 'lag2m' ? shiftSeriesByMonths(importUnitSeries, 2) : importUnitSeries),
    [importShift, importUnitSeries]
  );
  const lmeProxySeries = useMemo(() => priceSeries, [priceSeries]);
  void marketArticles;
  void importValueSeries;

  const tatenePair = latestPair(tateneJpyMtSeries);
  const usdPair = latestPair(usdJpySeries);
  const importUnitPair = latestPair(importUnitDisplaySeries);
  const tateneChg = calcChange(tatenePair.latest?.value ?? null, tatenePair.prev?.value ?? null);
  const usdChg = calcChange(usdPair.latest?.value ?? null, usdPair.prev?.value ?? null);
  const importUnitChg = calcChange(importUnitPair.latest?.value ?? null, importUnitPair.prev?.value ?? null);
  const endDate = tatenePair.latest?.date || '-';
  const importUnitValue = importUnitPair.latest?.value ?? null;
  const importCardDate = importUnitPair.latest?.date || '-';
  const electricCopperInventoryPair = latestPair(electricCopperInventorySeries);
  const electricCopperInventoryChg = calcChange(
    electricCopperInventoryPair.latest?.value ?? null,
    electricCopperInventoryPair.prev?.value ?? null
  );
  const referenceLatestMonth =
    tateneJpyMtSeries.at(-1)?.date ||
    usdJpySeries.at(-1)?.date ||
    importUnitDisplaySeries.at(-1)?.date ||
    electricCopperInventorySeries.at(-1)?.date ||
    '-';
  const isImportPending = Boolean(
    referenceLatestMonth && importUnitPair.latest?.date && importUnitPair.latest.date < referenceLatestMonth
  );
  const isInventoryPending = Boolean(
    referenceLatestMonth &&
      electricCopperInventoryPair.latest?.date &&
      electricCopperInventoryPair.latest.date < referenceLatestMonth
  );

  const tateneSpan = useMemo(() => filterByPeriodDays(tateneJpyMtSeries, spanDays), [tateneJpyMtSeries, spanDays]);
  const axisStart = tateneSpan.at(0)?.date || '-';
  const axisMid = tateneSpan.at(Math.floor(tateneSpan.length / 2))?.date || '-';
  const axisEnd = tateneSpan.at(-1)?.date || '-';

  const threeYearTateneRows = useMemo(() => filterByPeriodDays(tateneJpyMtSeries, 365 * 3), [tateneJpyMtSeries]);
  const threeYearImportRows = useMemo(() => filterByPeriodDays(importUnitSeries, 365 * 3), [importUnitSeries]);
  const threeYearDomesticUnitRows = useMemo(() => {
    const byDate = new Map<string, { date: string; tatene: number | null; importUnit: number | null }>();
    for (const row of threeYearTateneRows) {
      byDate.set(row.date, { date: row.date, tatene: row.value, importUnit: null });
    }
    for (const row of threeYearImportRows) {
      const existing = byDate.get(row.date);
      if (existing) {
        existing.importUnit = row.value;
      } else {
        byDate.set(row.date, { date: row.date, tatene: null, importUnit: row.value });
      }
    }
    return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [threeYearTateneRows, threeYearImportRows]);
  const visibleRows = 10;
  const tabTableViewportPx = 40 + visibleRows * 36;
  const relTateneSpan = useMemo(() => filterByPeriodDays(tateneJpyMtSeries, 365), [tateneJpyMtSeries]);
  const relAxisStart = relTateneSpan.at(0)?.date || '-';
  const relAxisMid = relTateneSpan.at(Math.floor(relTateneSpan.length / 2))?.date || '-';
  const relAxisEnd = relTateneSpan.at(-1)?.date || '-';
  const relTatene = idxRows(relTateneSpan);
  const relImportUnit = useMemo(
    () => indexAlignedValues(alignSeriesByDate(relTateneSpan, importUnitSeries)),
    [relTateneSpan, importUnitSeries]
  );
  const relUsd = useMemo(
    () => indexAlignedValues(alignSeriesByDate(relTateneSpan, usdJpySeries)),
    [relTateneSpan, usdJpySeries]
  );
  const relInventory = useMemo(
    () => indexAlignedValues(alignSeriesByDate(relTateneSpan, electricCopperInventorySeries)),
    [relTateneSpan, electricCopperInventorySeries]
  );
  const relativeLines = useMemo(() => {
    const lines: Array<{ values: Array<number | null>; color: string }> = [{ values: relTatene.map((r) => r.value), color: TATENE_PRICE_COLOR }];
    if (relativeSelection.import_unit) lines.push({ values: relImportUnit, color: TATENE_IMPORT_COLOR });
    if (relativeSelection.usd_jpy) lines.push({ values: relUsd, color: TATENE_USD_COLOR });
    if (relativeSelection.inventory) lines.push({ values: relInventory, color: TATENE_INVENTORY_COLOR });
    return lines;
  }, [relInventory, relImportUnit, relTatene, relUsd, relativeSelection]);

  const tateneContributionTargetRows = useMemo(
    () =>
      tateneJpyMtSeries.filter((row) => {
        const ym = toMonthKey(row.date);
        return ym >= TATENE_CONTRIBUTION_START_MONTH && ym <= TATENE_CONTRIBUTION_END_MONTH;
      }),
    [tateneJpyMtSeries]
  );
  const tateneContributionImportAligned = useMemo(
    () => alignSeriesByDate(tateneContributionTargetRows, importUnitSeries),
    [tateneContributionTargetRows, importUnitSeries]
  );
  const tateneContributionLmeAligned = useMemo(
    () => alignSeriesByDate(tateneContributionTargetRows, lmeProxySeries),
    [tateneContributionTargetRows, lmeProxySeries]
  );
  const tateneContributionUsdAligned = useMemo(
    () => alignSeriesByDate(tateneContributionTargetRows, usdJpySeries),
    [tateneContributionTargetRows, usdJpySeries]
  );
  const tateneContributionInventoryAligned = useMemo(
    () => alignSeriesByDate(tateneContributionTargetRows, electricCopperInventorySeries),
    [tateneContributionTargetRows, electricCopperInventorySeries]
  );
  const tateneContributionSummary = useMemo(() => {
    const targetRows = tateneContributionTargetRows.map((row) => ({ date: row.date, value: row.value }));
    const importRows = withCarryForward(
      tateneContributionTargetRows.map((row, idx) => ({
        date: row.date,
        value: tateneContributionImportAligned[idx] ?? null,
      }))
    );
    const lmeRows = withCarryForward(
      tateneContributionTargetRows.map((row, idx) => ({
        date: row.date,
        value: tateneContributionLmeAligned[idx] ?? null,
      }))
    );
    const usdRows = withCarryForward(
      tateneContributionTargetRows.map((row, idx) => ({
        date: row.date,
        value: tateneContributionUsdAligned[idx] ?? null,
      }))
    );
    const inventoryRows = withCarryForward(
      tateneContributionTargetRows.map((row, idx) => ({
        date: row.date,
        value: tateneContributionInventoryAligned[idx] ?? null,
      }))
    );
    return computeContributionSummary(
      targetRows,
      [
        { label: 'LME', color: TATENE_PRICE_COLOR, rows: lmeRows },
        { label: '輸入単価', color: TATENE_IMPORT_COLOR, rows: importRows },
        { label: 'USD/JPY', color: TATENE_USD_COLOR, rows: usdRows },
        { label: '電気銅在庫量', color: TATENE_INVENTORY_COLOR, rows: inventoryRows },
      ],
      12
    );
  }, [
    tateneContributionTargetRows,
    tateneContributionImportAligned,
    tateneContributionLmeAligned,
    tateneContributionUsdAligned,
    tateneContributionInventoryAligned,
  ]);
  const tateneContributionShares = useMemo(() => {
    if (!tateneContributionSummary.items.length) return [];
    const rounded = tateneContributionSummary.items.map((item) => Number(item.share.toFixed(1)));
    const current = rounded.reduce((sum, value) => sum + value, 0);
    const diff = Number((100 - current).toFixed(1));
    const out = [...rounded];
    out[out.length - 1] = Number((out[out.length - 1] + diff).toFixed(1));
    return out;
  }, [tateneContributionSummary.items]);
  const ringR = 52;
  const ringLen = 2 * Math.PI * ringR;
  const ringOffset = ringLen * (1 - tateneContributionSummary.dominant.share / 100);
  const importLagMonths = importShift === 'lag2m' ? 2 : 0;
  const importUnitSpan = useMemo(() => filterByPeriodDays(importUnitDisplaySeries, spanDays), [importUnitDisplaySeries, spanDays]);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <MetricCard
          label="国内銅建値"
          labelNote="月次平均"
          change={tateneChg}
          value={fmtNum(tatenePair.latest?.value ?? null, 0)}
          unit="JPY/mt"
          polyline={buildPolyline(tateneJpyMtSeries.slice(-7).map((r) => r.value))}
          gaugeRangeValues={tateneJpyMtSeries.slice(-31).map((r) => r.value)}
          gaugeCurrentChange={tateneChg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={endDate}
        />
        <MetricCard
          label="輸入単価"
          labelNote={isImportPending ? 'HS7403.11 / データ更新待ち' : 'HS7403.11 '}
          change={importUnitChg}
          value={fmtNum(importUnitValue, 0)}
          unit="JPY/mt"
          polyline={buildPolyline(importUnitDisplaySeries.slice(-7).map((r) => r.value))}
          gaugeRangeValues={importUnitDisplaySeries.slice(-31).map((r) => r.value)}
          gaugeCurrentChange={importUnitChg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={importCardDate}
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
        <MetricCard
          label="電気銅在庫量"
          labelNote={isInventoryPending ? 'データ更新待ち' : ''}
          change={electricCopperInventoryChg}
          value={fmtNum(electricCopperInventoryPair.latest?.value ?? null, 0)}
          unit="t"
          polyline={buildPolyline(electricCopperInventorySeries.slice(-7).map((r) => r.value))}
          gaugeRangeValues={electricCopperInventorySeries.slice(-31).map((r) => r.value)}
          gaugeCurrentChange={electricCopperInventoryChg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={electricCopperInventoryPair.latest?.date || '-'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2">
          <SectionCard
            title="トレンド"
            right={
              <div className="flex items-center gap-2">
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
                <div className="inline-flex rounded-lg border border-white/10 overflow-hidden">
                  <button
                    type="button"
                    className={`px-3 py-1.5 text-xs font-bold ${importShift === 'none' ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`}
                    onClick={() => setImportShift('none')}
                  >
                    通常
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1.5 text-xs font-bold ${importShift === 'lag2m' ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`}
                    onClick={() => setImportShift('lag2m')}
                  >
                    輸入-2M
                  </button>
                </div>
              </div>
            }
          >
            <TateneTrendPlot
              tateneRows={tateneSpan}
              importUnitRows={importUnitSpan}
              importLagMonths={importLagMonths}
              xLabels={[axisStart, axisMid, axisEnd]}
            />
          </SectionCard>
        </div>
        <article className="glass-card rounded-3xl p-8">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h4 className="text-[14px] font-black text-cool-grey uppercase tracking-[0.2em] sm:tracking-[0.3em] whitespace-nowrap">3年データ</h4>
            <p className="text-[10px] font-bold tracking-[0.08em] text-cool-grey whitespace-nowrap">※単位: JPY/mt</p>
          </div>
          <div
            className="w-full overflow-y-scroll overflow-x-hidden calm-scrollbar rounded-lg border border-white/10 bg-[#f3f1ed]/70"
            style={{ minHeight: `${tabTableViewportPx}px`, maxHeight: `${tabTableViewportPx}px`, height: `${tabTableViewportPx}px` }}
          >
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[36%]" />
                <col className="w-[32%]" />
                <col className="w-[32%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-[#ece7df]/95 backdrop-blur-sm border-b border-[#ddd5ca]">
                <tr>
                  <th className="text-left px-2.5 py-2 text-[12px] font-black uppercase tracking-[0.12em] text-cool-grey whitespace-nowrap">日付</th>
                  <th className="text-right px-2.5 py-2 text-[12px] font-black uppercase tracking-[0.12em] text-cool-grey whitespace-nowrap">国内建値※</th>
                  <th className="text-right px-2.5 py-2 text-[12px] font-black uppercase tracking-[0.12em] text-cool-grey whitespace-nowrap">輸入単価※</th>
                </tr>
              </thead>
              <tbody>
                {threeYearDomesticUnitRows.map((row, idx) => (
                  <tr key={`domestic-unit-row-${row.date}-${idx}`} className="h-9 border-t border-[#e5dfd5]">
                    <td className="px-2.5 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-cool-grey whitespace-nowrap">{row.date}</td>
                    <td className="px-2.5 py-2.5 text-right text-[13px] leading-tight text-off-white whitespace-nowrap">{fmtNum(row.tatene, 0)}</td>
                    <td className="px-2.5 py-2.5 text-right text-[13px] leading-tight text-off-white whitespace-nowrap">{fmtNum(row.importUnit, 1)}</td>
                  </tr>
                ))}
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
            <div className="flex flex-wrap items-center justify-end gap-2 text-right">
              <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cool-grey">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TATENE_PRICE_COLOR }} />
                国内建値
              </span>
              <div className="inline-flex rounded-lg border border-white/10 overflow-hidden">
                {RELATIVE_OPTION_TABS.map((item, idx) => {
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
          }
        >
          <LinePlot
            lines={relativeLines}
            xLabels={[relAxisStart, relAxisMid, relAxisEnd]}
            referenceValue={100}
            scaleMode="centered_reference"
            height={220}
          />
          <p className="mt-3 text-[10px] font-bold tracking-[0.08em] text-cool-grey">
            ※ データが未公表の月は、その月の線を描画していません。国内建値を固定表示し、各系列は先頭月=100で指数化しています。
          </p>
        </SectionCard>

        <SectionCard title="国内建値への寄与率" className="h-full col-span-1">
          <div className="flex flex-col items-center py-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-cool-grey">期間: 2025-01〜2025-12</p>
            <div className="relative w-32 h-32 sm:w-44 sm:h-44">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
                <circle cx="70" cy="70" r={ringR} fill="transparent" stroke="rgba(255,255,255,0.12)" strokeWidth="14" />
                <circle
                  cx="70"
                  cy="70"
                  r={ringR}
                  fill="transparent"
                  stroke={tateneContributionSummary.dominant.color}
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={ringLen.toFixed(1)}
                  strokeDashoffset={ringOffset.toFixed(1)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-3xl sm:text-4xl font-black text-off-white">
                  {fmtNum(tateneContributionSummary.dominant.share, 1)}%
                </p>
                <p className="text-xs font-bold tracking-widest" style={{ color: tateneContributionSummary.dominant.color }}>
                  {tateneContributionSummary.dominant.label}
                </p>
              </div>
            </div>
            <div className="mt-4 w-full space-y-1.5 text-sm">
              {tateneContributionSummary.items.map((item, idx) => (
                <p key={`tatene-contrib-${item.label}`} className="flex justify-between text-cool-grey">
                  <span>{item.label}</span>
                  <span style={{ color: item.color }}>{tateneContributionShares[idx]?.toFixed(1) ?? '0.0'}%</span>
                </p>
              ))}
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
            <a className="hover:text-off-white underline underline-offset-2" href="https://www.worldbank.org/" target="_blank" rel="noreferrer">World Bank</a>
            {' / '}
            <a className="hover:text-off-white underline underline-offset-2" href="https://data.imf.org/" target="_blank" rel="noreferrer">IMF</a>
            {' / '}
            <a className="hover:text-off-white underline underline-offset-2" href="https://comtradeplus.un.org/" target="_blank" rel="noreferrer">United Nations</a>
            {' / '}
            <a className="hover:text-off-white underline underline-offset-2" href="https://www.meti.go.jp/statistics/" target="_blank" rel="noreferrer">経産省</a>
            {' / '}
            <a className="hover:text-off-white underline underline-offset-2" href="https://www.jx-nmm.com/cuprice/" target="_blank" rel="noreferrer">JX金属</a>
          </div>
        </article>
      </div>
    </>
  );
}
