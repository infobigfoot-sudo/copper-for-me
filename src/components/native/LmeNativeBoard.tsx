'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { LinePlot, MetricCard, SectionCard, calcChange, fmtNum, latestPair } from '@/components/native/NativeWidgets';
import type { SeriesPoint } from '@/lib/selected_series_bundle';

type SpanKey = '1y' | '3y' | '5y';
type RelativeOptionalKey = 'raw_export' | 'export_unit' | 'usd_chy';
type ContributionItem = { label: string; color: string; share: number };
type ContributionSummary = { dominant: ContributionItem; items: ContributionItem[] };

const SPANS: Array<{ key: SpanKey; label: string; days: number }> = [
  { key: '1y', label: '1Y', days: 365 },
  { key: '3y', label: '3Y', days: 365 * 3 },
  { key: '5y', label: '5Y', days: 365 * 5 },
];

const LME_CONTRIBUTION_START_MONTH = '2025-01';
const LME_CONTRIBUTION_END_MONTH = '2025-12';

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

function indexSeries(rows: SeriesPoint[]): SeriesPoint[] {
  const base = rows[0]?.value ?? 1;
  return rows.map((r) => ({ ...r, value: (r.value / base) * 100 }));
}

function toMonthKey(dateText: string): string {
  const raw = String(dateText || '').trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(0, 7);
  return '';
}

function toMonthlyAverageRows(rows: SeriesPoint[]): SeriesPoint[] {
  const buckets = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    const ym = toMonthKey(row.date);
    if (!ym || !Number.isFinite(row.value)) continue;
    const bucket = buckets.get(ym) ?? { sum: 0, count: 0 };
    bucket.sum += row.value;
    bucket.count += 1;
    buckets.set(ym, bucket);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => ({ date, value: bucket.count > 0 ? bucket.sum / bucket.count : NaN }))
    .filter((row) => Number.isFinite(row.value));
}

function pairAtMonth(rows: SeriesPoint[], targetYm: string): { latest: SeriesPoint | null; prev: SeriesPoint | null } {
  if (!rows.length) return { latest: null, prev: null };
  const idx = rows.findIndex((row) => toMonthKey(row.date) === targetYm);
  if (idx < 0) return { latest: null, prev: null };
  return {
    latest: rows[idx] ?? null,
    prev: idx > 0 ? rows[idx - 1] ?? null : null,
  };
}

type LmeTrendPlotProps = {
  lmeRows: SeriesPoint[];
  exportUnitRows: SeriesPoint[];
  xLabels: [string, string, string];
};

type Scale = { min: number; range: number };

const PLOT_W = 800;
const PLOT_H = 320;
const PLOT_PAD_X = 12;
const PLOT_TOP = 18;
const PLOT_BOTTOM = PLOT_H - 18;
const LME_PRICE_COLOR = '#355c7d';
const LME_EXPORT_UNIT_COLOR = '#b86d53';
const LME_RAW_EXPORT_COLOR = '#2f6d5a';
const LME_USD_CHY_COLOR = '#7aa6c2';
const RELATIVE_OPTION_TABS: Array<{ key: RelativeOptionalKey; label: string; color: string }> = [
  { key: 'raw_export', label: '原材料輸出', color: LME_RAW_EXPORT_COLOR },
  { key: 'export_unit', label: '輸出単価', color: LME_EXPORT_UNIT_COLOR },
  { key: 'usd_chy', label: 'USD/CHY', color: LME_USD_CHY_COLOR },
];

function alignSeriesByDate(baseRows: SeriesPoint[], rows: SeriesPoint[]): Array<number | null> {
  if (!baseRows.length || !rows.length) return baseRows.map(() => null);
  const byDate = new Map(rows.map((row) => [row.date, row.value] as const));
  return baseRows.map((base) => {
    const value = byDate.get(base.date);
    return value !== undefined && Number.isFinite(value) ? value : null;
  });
}

function scaleOf(values: Array<number | null>): Scale {
  const safe = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!safe.length) return { min: 0, range: 1 };
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  return { min, range: max - min || 1 };
}

function buildPolylineSegments(
  points: Array<{ x: number; y: number | null }>
): Array<Array<{ x: number; y: number }>> {
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
  for (const point of points) {
    if (point.y === null || !Number.isFinite(point.y)) {
      if (current.length >= 2) segments.push(current);
      current = [];
      continue;
    }
    current.push({ x: point.x, y: point.y });
  }
  if (current.length >= 2) segments.push(current);
  return segments;
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

function LmeTrendPlot({ lmeRows, exportUnitRows, xLabels }: LmeTrendPlotProps) {
  const priceColor = LME_PRICE_COLOR;
  const exportColor = LME_EXPORT_UNIT_COLOR;
  const baseRows =
    lmeRows.length >= 2
      ? lmeRows
      : exportUnitRows.length >= 2
        ? exportUnitRows
        : [{ date: '-', value: 0 }, { date: '-', value: 0 }];
  const [activeIndex, setActiveIndex] = useState(baseRows.length - 1);

  useEffect(() => {
    setActiveIndex(baseRows.length - 1);
  }, [baseRows.length]);

  const shape = useMemo(() => {
    const plotW = PLOT_W - PLOT_PAD_X * 2;
    const xAt = (i: number) => PLOT_PAD_X + (plotW * i) / Math.max(baseRows.length - 1, 1);
    const exportVals = alignSeriesByDate(baseRows, exportUnitRows);
    const combined = [...baseRows.map((r) => r.value), ...exportVals];
    const sharedScale = scaleOf(combined);
    const yAt = (value: number | null) => {
      if (value === null || !Number.isFinite(value)) return null;
      return PLOT_BOTTOM - ((value - sharedScale.min) / sharedScale.range) * (PLOT_BOTTOM - PLOT_TOP);
    };
    const pricePoints = baseRows.map((r, i) => ({ x: xAt(i), y: yAt(r.value) }));
    const exportPoints = exportVals.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
    const toPolyline = (pts: Array<{ x: number; y: number }>) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const priceSegments = buildPolylineSegments(pricePoints);
    const exportSegments = buildPolylineSegments(exportPoints);
    return {
      pricePoints,
      exportPoints,
      pricePaths: priceSegments.map((segment) => toPolyline(segment)),
      exportPaths: exportSegments.map((segment) => toPolyline(segment)),
      active: {
        date: baseRows.at(Math.max(0, Math.min(activeIndex, baseRows.length - 1)))?.date || '-',
        price: baseRows.at(Math.max(0, Math.min(activeIndex, baseRows.length - 1)))?.value ?? null,
        exportUnit: exportVals.at(Math.max(0, Math.min(activeIndex, exportVals.length - 1))) ?? null,
      },
    };
  }, [activeIndex, baseRows, exportUnitRows]);

  const clampedIndex = Math.max(0, Math.min(activeIndex, baseRows.length - 1));
  const activeX = shape.pricePoints[clampedIndex]?.x ?? PLOT_PAD_X;

  const handleMove = (clientX: number, left: number, width: number) => {
    if (width <= 0) return;
    const svgX = ((clientX - left) / width) * PLOT_W;
    let nearest = 0;
    let dist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < shape.pricePoints.length; i += 1) {
      const d = Math.abs(shape.pricePoints[i].x - svgX);
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
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: priceColor }} />
          LME月次平均 <span style={{ color: priceColor }}>{fmtNum(shape.active.price, 0)}</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: exportColor }} />
          輸出単価 <span style={{ color: exportColor }}>{fmtNum(shape.active.exportUnit, 0)}</span>
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

          {shape.pricePaths.map((path, idx) => (
            <polyline key={`price-path-${idx}`} points={path} fill="none" stroke={priceColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {shape.exportPaths.map((path, idx) => (
            <polyline key={`export-path-${idx}`} points={path} fill="none" stroke={exportColor} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          ))}

          {shape.pricePoints.map((p, i) =>
            p.y === null ? null : (
              <circle key={`price-dot-${i}`} cx={p.x.toFixed(2)} cy={p.y.toFixed(2)} r="1.7" fill={priceColor} fillOpacity="0.55" />
            )
          )}
          {shape.exportPoints.map((p, i) =>
            p.y === null ? null : (
              <circle key={`export-dot-${i}`} cx={p.x.toFixed(2)} cy={p.y.toFixed(2)} r="1.55" fill={exportColor} fillOpacity="0.52" />
            )
          )}

          <line x1={activeX.toFixed(2)} y1={PLOT_TOP.toFixed(2)} x2={activeX.toFixed(2)} y2={PLOT_BOTTOM.toFixed(2)} stroke="rgba(53,92,125,0.52)" strokeWidth="1.35" strokeDasharray="4 3" />
          {shape.pricePoints[clampedIndex]?.y !== null ? (
            <circle cx={(shape.pricePoints[clampedIndex]?.x || 0).toFixed(2)} cy={(shape.pricePoints[clampedIndex]?.y || 0).toFixed(2)} r="4.2" fill={priceColor} />
          ) : null}
          {shape.exportPoints[clampedIndex]?.y !== null ? (
            <circle cx={(shape.exportPoints[clampedIndex]?.x || 0).toFixed(2)} cy={(shape.exportPoints[clampedIndex]?.y || 0).toFixed(2)} r="3.6" fill={exportColor} />
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

export default function LmeNativeBoard({
  priceSeries,
  stockSeries: _stockSeries,
  futures3mSeries: _futures3mSeries,
  offWarrantSeries: _offWarrantSeries,
  usdJpySeries: _usdJpySeries,
  usdCnySeries,
  rawMaterialExportSeries,
  copperExportUnitSeries,
  calculatorHref,
}: {
  priceSeries: SeriesPoint[];
  stockSeries: SeriesPoint[];
  futures3mSeries: SeriesPoint[];
  offWarrantSeries: SeriesPoint[];
  usdJpySeries: SeriesPoint[];
  usdCnySeries: SeriesPoint[];
  rawMaterialExportSeries: SeriesPoint[];
  copperExportUnitSeries: SeriesPoint[];
  calculatorHref: string;
}) {
  const [span, setSpan] = useState<SpanKey>('1y');
  const [relativeSelection, setRelativeSelection] = useState<Record<RelativeOptionalKey, boolean>>({
    raw_export: true,
    export_unit: true,
    usd_chy: true,
  });
  void _stockSeries;
  void _offWarrantSeries;
  void _futures3mSeries;
  void _usdJpySeries;
  const priceMonthlyUsdSeries = useMemo(() => toMonthlyAverageRows(priceSeries), [priceSeries]);
  const usdCnyMonthlySeries = useMemo(() => toMonthlyAverageRows(usdCnySeries), [usdCnySeries]);
  const rawMaterialExportMonthlySeries = useMemo(
    () => toMonthlyAverageRows(rawMaterialExportSeries),
    [rawMaterialExportSeries]
  );
  const copperExportUnitMonthlySeries = useMemo(
    () => toMonthlyAverageRows(copperExportUnitSeries).filter((row) => Number.isFinite(row.value) && row.value > 0),
    [copperExportUnitSeries]
  );

  const pUsd = latestPair(priceMonthlyUsdSeries);
  const fx = latestPair(usdCnyMonthlySeries);
  const raw = latestPair(rawMaterialExportMonthlySeries);
  const copperExport = latestPair(copperExportUnitMonthlySeries);
  const referenceLatestMonth =
    priceMonthlyUsdSeries.at(-1)?.date ||
    usdCnyMonthlySeries.at(-1)?.date ||
    rawMaterialExportMonthlySeries.at(-1)?.date ||
    copperExportUnitMonthlySeries.at(-1)?.date ||
    '-';
  const isRawPending = Boolean(referenceLatestMonth && raw.latest?.date && raw.latest.date < referenceLatestMonth);
  const isCopperExportPending = Boolean(
    !copperExport.latest ||
      !Number.isFinite(copperExport.latest.value) ||
      copperExport.latest.value <= 0 ||
      (referenceLatestMonth && copperExport.latest?.date && copperExport.latest.date < referenceLatestMonth)
  );
  const pUsdChg = calcChange(pUsd.latest?.value ?? null, pUsd.prev?.value ?? null);
  const fxChg = calcChange(fx.latest?.value ?? null, fx.prev?.value ?? null);
  const rawChg = isRawPending ? null : calcChange(raw.latest?.value ?? null, raw.prev?.value ?? null);
  const copperExportChg = isCopperExportPending
    ? null
    : calcChange(copperExport.latest?.value ?? null, copperExport.prev?.value ?? null);
  const endDate = pUsd.latest?.date || fx.latest?.date || raw.latest?.date || copperExport.latest?.date || '-';

  const spanDays = SPANS.find((x) => x.key === span)?.days ?? 365;
  const lmeTrendSpan = useMemo(
    () => filterByPeriodDays(priceMonthlyUsdSeries, spanDays),
    [priceMonthlyUsdSeries, spanDays]
  );
  const exportUnitTrendSpan = useMemo(
    () => filterByPeriodDays(copperExportUnitMonthlySeries, spanDays),
    [copperExportUnitMonthlySeries, spanDays]
  );
  const trendAxisRows = lmeTrendSpan.length ? lmeTrendSpan : exportUnitTrendSpan;
  const axisStart = trendAxisRows.at(0)?.date || '-';
  const axisMid = trendAxisRows.at(Math.floor(trendAxisRows.length / 2))?.date || '-';
  const axisEnd = trendAxisRows.at(-1)?.date || '-';

  const threeYearLmeRows = useMemo(
    () => filterByPeriodDays(priceMonthlyUsdSeries, 365 * 3),
    [priceMonthlyUsdSeries]
  );
  const threeYearExportUnitValues = useMemo(
    () => alignSeriesByDate(threeYearLmeRows, copperExportUnitMonthlySeries),
    [threeYearLmeRows, copperExportUnitMonthlySeries]
  );
  const threeYearComparisonRows = useMemo(
    () =>
      threeYearLmeRows
        .map((row, i) => {
          const exportUnit = threeYearExportUnitValues[i];
          const diff =
            exportUnit !== null &&
            Number.isFinite(exportUnit) &&
            Number.isFinite(row.value)
              ? exportUnit - row.value
              : null;
          return {
            date: row.date,
            lme: row.value,
            exportUnit,
            diff,
          };
        })
        .reverse(),
    [threeYearLmeRows, threeYearExportUnitValues]
  );
  const visibleRows = 12;
  const tableViewportPx = 40 + visibleRows * 36;

  const relPriceSpan = useMemo(() => filterByPeriodDays(priceMonthlyUsdSeries, 365), [priceMonthlyUsdSeries]);
  const relLme = indexSeries(relPriceSpan);
  const relRaw = useMemo(
    () => indexAlignedValues(alignSeriesByDate(relPriceSpan, rawMaterialExportMonthlySeries)),
    [relPriceSpan, rawMaterialExportMonthlySeries]
  );
  const relExportUnit = useMemo(
    () => indexAlignedValues(alignSeriesByDate(relPriceSpan, copperExportUnitMonthlySeries)),
    [relPriceSpan, copperExportUnitMonthlySeries]
  );
  const relUsdChy = useMemo(
    () => indexAlignedValues(alignSeriesByDate(relPriceSpan, usdCnyMonthlySeries)),
    [relPriceSpan, usdCnyMonthlySeries]
  );
  const relAxisStart = relPriceSpan.at(0)?.date || '-';
  const relAxisMid = relPriceSpan.at(Math.floor(relPriceSpan.length / 2))?.date || '-';
  const relAxisEnd = relPriceSpan.at(-1)?.date || '-';
  const relativeLines = useMemo(() => {
    const lines: Array<{ values: Array<number | null>; color: string }> = [{ values: relLme.map((r) => r.value), color: LME_PRICE_COLOR }];
    if (relativeSelection.raw_export) lines.push({ values: relRaw, color: LME_RAW_EXPORT_COLOR });
    if (relativeSelection.export_unit) lines.push({ values: relExportUnit, color: LME_EXPORT_UNIT_COLOR });
    if (relativeSelection.usd_chy) lines.push({ values: relUsdChy, color: LME_USD_CHY_COLOR });
    return lines;
  }, [relExportUnit, relLme, relRaw, relUsdChy, relativeSelection]);
  const lmeContributionTargetRows = useMemo(
    () =>
      priceMonthlyUsdSeries.filter((row) => {
        const ym = toMonthKey(row.date);
        return ym >= LME_CONTRIBUTION_START_MONTH && ym <= LME_CONTRIBUTION_END_MONTH;
      }),
    [priceMonthlyUsdSeries]
  );
  const lmeContributionRawAligned = useMemo(
    () => alignSeriesByDate(lmeContributionTargetRows, rawMaterialExportMonthlySeries),
    [lmeContributionTargetRows, rawMaterialExportMonthlySeries]
  );
  const lmeContributionExportUnitAligned = useMemo(
    () => alignSeriesByDate(lmeContributionTargetRows, copperExportUnitMonthlySeries),
    [lmeContributionTargetRows, copperExportUnitMonthlySeries]
  );
  const lmeContributionUsdChyAligned = useMemo(
    () => alignSeriesByDate(lmeContributionTargetRows, usdCnyMonthlySeries),
    [lmeContributionTargetRows, usdCnyMonthlySeries]
  );
  const lmeContributionSummary = useMemo(() => {
    const targetRows = lmeContributionTargetRows.map((row) => ({ date: row.date, value: row.value }));
    const rawRows = withCarryForward(
      lmeContributionTargetRows.map((row, idx) => ({
        date: row.date,
        value: lmeContributionRawAligned[idx] ?? null,
      }))
    );
    const exportUnitRows = withCarryForward(
      lmeContributionTargetRows.map((row, idx) => ({
        date: row.date,
        value: lmeContributionExportUnitAligned[idx] ?? null,
      }))
    );
    const usdChyRows = withCarryForward(
      lmeContributionTargetRows.map((row, idx) => ({
        date: row.date,
        value: lmeContributionUsdChyAligned[idx] ?? null,
      }))
    );
    return computeContributionSummary(
      targetRows,
      [
        { label: '原材料輸出', color: LME_RAW_EXPORT_COLOR, rows: rawRows },
        { label: '輸出単価', color: LME_EXPORT_UNIT_COLOR, rows: exportUnitRows },
        { label: 'USD/CHY', color: LME_USD_CHY_COLOR, rows: usdChyRows },
      ],
      12
    );
  }, [
    lmeContributionTargetRows,
    lmeContributionRawAligned,
    lmeContributionExportUnitAligned,
    lmeContributionUsdChyAligned,
  ]);
  const lmeContributionShares = useMemo(() => {
    if (!lmeContributionSummary.items.length) return [];
    const rounded = lmeContributionSummary.items.map((item) => Number(item.share.toFixed(1)));
    const current = rounded.reduce((sum, value) => sum + value, 0);
    const diff = Number((100 - current).toFixed(1));
    const out = [...rounded];
    out[out.length - 1] = Number((out[out.length - 1] + diff).toFixed(1));
    return out;
  }, [lmeContributionSummary.items]);
  const ringR = 52;
  const ringLen = 2 * Math.PI * ringR;
  const ringOffset = ringLen * (1 - lmeContributionSummary.dominant.share / 100);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <MetricCard
          label="LME銅価格"
          labelNote="月次平均価格"
          change={pUsdChg}
          value={fmtNum(pUsd.latest?.value ?? null, 0)}
          unit="USD/mt"
          gaugeRangeValues={priceMonthlyUsdSeries.slice(-31).map((r) => r.value)}
          gaugeCurrentChange={pUsdChg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={pUsd.latest?.date || endDate}
        />
        <MetricCard
          label="輸出単価"
          labelNote={isCopperExportPending ? 'HS7403.11 / データ更新待ち' : 'HS7403.11'}
          change={copperExportChg}
          value={fmtNum(copperExport.latest?.value ?? null, 0)}
          unit="USD/mt"
          gaugeRangeValues={copperExportUnitMonthlySeries.slice(-31).map((r) => r.value)}
          gaugeCurrentChange={copperExportChg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={copperExport.latest?.date || '-'}
        />
        <MetricCard
          label="原材料輸出"
          labelNote={isRawPending ? 'チリからの輸出 / データ更新待ち' : 'チリからの輸出'}
          change={rawChg}
          value={fmtNum(raw.latest?.value ?? null, 3)}
          unit="万t"
          gaugeRangeValues={rawMaterialExportMonthlySeries.slice(-31).map((r) => r.value)}
          gaugeCurrentChange={rawChg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={raw.latest?.date || '-'}
        />
        <MetricCard
          label="USD/CHY"
          labelNote="月次平均価格"
          change={fxChg}
          value={fmtNum(fx.latest?.value ?? null, 3)}
          unit="CNY/USD"
          gaugeRangeValues={usdCnyMonthlySeries.slice(-31).map((r) => r.value)}
          gaugeCurrentChange={fxChg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={fx.latest?.date || endDate}
        />
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
            <LmeTrendPlot lmeRows={lmeTrendSpan} exportUnitRows={exportUnitTrendSpan} xLabels={[axisStart, axisMid, axisEnd]} />
            <p className="mt-3 text-[10px] font-bold tracking-[0.08em] text-cool-grey">
            ※ データが未公表の月は、その月の線を描画していません。
            </p>
          </SectionCard>
        </div>
        <article className="glass-card rounded-3xl p-8">
          <div className="mb-4">
            <h4 className="text-[14px] font-black text-cool-grey uppercase tracking-[0.2em] sm:tracking-[0.3em] whitespace-nowrap">
              3年データ
            </h4>
          </div>
          <div
            className="w-full overflow-y-scroll overflow-x-hidden calm-scrollbar rounded-lg border border-white/10 bg-[#f3f1ed]/70"
            style={{ minHeight: `${tableViewportPx}px`, maxHeight: `${tableViewportPx}px`, height: `${tableViewportPx}px` }}
          >
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[24%]" />
                <col className="w-[24%]" />
                <col className="w-[24%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-[#ece7df]/95 backdrop-blur-sm border-b border-[#ddd5ca]">
                <tr>
                  <th className="text-left px-2.5 py-2 text-[12px] font-black uppercase tracking-[0.12em] text-cool-grey whitespace-nowrap">月</th>
                  <th className="text-right px-2.5 py-2 text-[12px] font-black uppercase tracking-[0.12em] text-cool-grey whitespace-nowrap">LME</th>
                  <th className="text-right px-2.5 py-2 text-[12px] font-black uppercase tracking-[0.12em] text-cool-grey whitespace-nowrap">輸出単価</th>
                  <th className="text-right px-2.5 py-2 text-[12px] font-black uppercase tracking-[0.12em] text-cool-grey whitespace-nowrap">差</th>
                </tr>
              </thead>
              <tbody>
                {threeYearComparisonRows.map((row, idx) => (
                  <tr key={`lme-export-row-${row.date}-${idx}`} className="h-9 border-t border-[#e5dfd5]">
                    <td className="px-2.5 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-cool-grey whitespace-nowrap">{row.date}</td>
                    <td className="px-2.5 py-2.5 text-right text-[13px] leading-tight text-off-white whitespace-nowrap">{fmtNum(row.lme, 0)}</td>
                    <td className="px-2.5 py-2.5 text-right text-[13px] leading-tight text-off-white whitespace-nowrap">{fmtNum(row.exportUnit, 0)}</td>
                    <td className={`px-2.5 py-2.5 text-right text-[13px] leading-tight whitespace-nowrap ${row.diff === null ? 'text-cool-grey' : row.diff >= 0 ? 'text-[#2f6d5a]' : 'text-[#b86d53]'}`}>
                      {row.diff === null ? '-' : `${row.diff >= 0 ? '+' : ''}${fmtNum(row.diff, 0)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 items-stretch">
        <SectionCard
          title="相対変化"
          className="h-full col-span-2 lg:col-span-1"
          right={
            <div className="flex flex-wrap items-center justify-end gap-2 text-right">
              <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cool-grey">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: LME_PRICE_COLOR }} />
                LME銅価格
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
            ※ データが未公表の月は、その月の線を描画していません。LME銅価格を固定表示し、各系列は先頭月=100で指数化しています。
          </p>
        </SectionCard>
        <SectionCard title="LMEへの寄与率" className="h-full col-span-1">
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
                  stroke={LME_PRICE_COLOR}
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={ringLen.toFixed(1)}
                  strokeDashoffset={ringOffset.toFixed(1)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-3xl sm:text-4xl font-black text-off-white">
                  {fmtNum(lmeContributionSummary.dominant.share, 1)}%
                </p>
                <p className="text-xs font-bold tracking-widest" style={{ color: LME_PRICE_COLOR }}>
                  {lmeContributionSummary.dominant.label}
                </p>
              </div>
            </div>
            <div className="mt-4 w-full space-y-1.5 text-sm">
              {lmeContributionSummary.items.map((item, idx) => (
                <p key={`lme-contrib-${item.label}`} className="flex justify-between text-cool-grey">
                  <span>{item.label}</span>
                  <span style={{ color: item.color }}>{lmeContributionShares[idx]?.toFixed(1) ?? '0.0'}%</span>
                </p>
              ))}
            </div>
          </div>
        </SectionCard>
        <article className="glass-card p-4 sm:p-8 rounded-3xl flex flex-col justify-center items-center text-center border border-[#e6dfd3] h-full col-span-1">
          <h5 className="text-[14px] font-black text-cool-grey uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-6">
            QUICK TOOLS
          </h5>
          <p className="text-cool-grey text-[10px] sm:text-[11px] font-medium mb-6 leading-relaxed">
            プレミアム計算とスクラップ換算を、リアルタイムで素早く確認できます。
          </p>
          <Link
            href={calculatorHref}
            className="w-full bg-[#2f6d5a] border border-[#285949] text-white py-3 sm:py-4 rounded-xl text-[10px] sm:text-xs font-black tracking-[0.12em] sm:tracking-widest text-center"
          >
            国内建値計算
          </Link>
          <div className="mt-6 text-[9px] sm:text-[14px] font-bold text-cool-grey tracking-wide">
            参照元:{' '}
            <a className="hover:text-off-white underline underline-offset-2" href="https://www.worldbank.org/" target="_blank" rel="noreferrer">World Bank</a>
            {' / '}
            <a className="hover:text-off-white underline underline-offset-2" href="https://data.imf.org/" target="_blank" rel="noreferrer">IMF</a>
            {' / '}
            <a className="hover:text-off-white underline underline-offset-2" href="https://comtradeplus.un.org/" target="_blank" rel="noreferrer">United Nations</a>
          </div>
        </article>
      </div>
    </>
  );
}
