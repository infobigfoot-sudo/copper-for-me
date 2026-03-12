'use client';

import { useEffect, useMemo, useState } from 'react';

type SeriesPoint = { date: string; value: number };
type ComponentKey = 'lme' | 'fx' | 'cost';

type Props = {
  tateneRows: SeriesPoint[];
  lmeUsdRows: SeriesPoint[];
  usdJpyRows: SeriesPoint[];
  predictionLower?: number | null;
  predictionUpper?: number | null;
};

type SpanKey = '6m' | '1y' | '3y' | '5y';
type ViewTab = 'tatene_ma' | 'stack';
type ComponentRow = {
  lme: number | null;
  fx: number | null;
  cost: number | null;
  total: number | null;
};

const WIDTH = 800;
const HEIGHT = 400;
const PAD_X = 12;
const PAD_Y = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const MA_WINDOW = 3;

const SPANS: Array<{ key: SpanKey; label: string; days: number }> = [
  { key: '6m', label: '6M', days: 186 },
  { key: '1y', label: '1Y', days: 365 },
  { key: '3y', label: '3Y', days: 365 * 3 },
  { key: '5y', label: '5Y', days: 365 * 5 },
];

const COMPONENT_META: Array<{ key: ComponentKey; label: string; color: string; fill: string }> = [
  { key: 'lme', label: 'LME', color: '#355c7d', fill: 'rgba(53,92,125,0.20)' },
  { key: 'fx', label: '為替', color: '#7aa6c2', fill: 'rgba(122,166,194,0.20)' },
  { key: 'cost', label: '諸コスト', color: '#8f9fb3', fill: 'rgba(143,159,179,0.22)' },
];

function fmtNum(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return '-';
  return value.toLocaleString('ja-JP', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function calcRangeFromZero(values: Array<number | null>): { min: number; max: number } {
  const safe = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!safe.length) return { min: 0, max: 1 };
  const rawMax = Math.max(...safe);
  const min = 0;
  let max = rawMax > 0 ? rawMax * 1.05 : 1;
  if (!Number.isFinite(max) || max <= min) max = min + 1;
  return { min, max };
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

function buildPathFromNullable(points: Array<{ x: number; y: number; v: number | null }>): string {
  let out = '';
  let segment: Array<{ x: number; y: number }> = [];
  const flush = () => {
    if (segment.length >= 2) {
      out += ` ${buildSmoothPath(segment)}`;
    } else if (segment.length === 1) {
      const p = segment[0];
      out += ` M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    }
    segment = [];
  };

  for (const p of points) {
    if (p.v === null || !Number.isFinite(p.v)) {
      flush();
      continue;
    }
    segment.push({ x: p.x, y: p.y });
  }
  flush();
  return out.trim();
}

function buildAreaPathFromNullable(points: Array<{ x: number; y: number; v: number | null }>, baseY: number): string {
  let out = '';
  let segment: Array<{ x: number; y: number }> = [];
  const flush = () => {
    if (segment.length >= 2) {
      const line = buildSmoothPath(segment);
      const first = segment[0];
      const last = segment[segment.length - 1];
      out += ` ${line} L ${last.x.toFixed(2)} ${baseY.toFixed(2)} L ${first.x.toFixed(2)} ${baseY.toFixed(2)} Z`;
    }
    segment = [];
  };

  for (const p of points) {
    if (p.v === null || !Number.isFinite(p.v)) {
      flush();
      continue;
    }
    segment.push({ x: p.x, y: p.y });
  }
  flush();
  return out.trim();
}

function buildBandPathSmooth(
  xs: number[],
  a: Array<number | null>,
  b: Array<number | null>,
  toY: (v: number) => number
): string {
  let out = '';
  let segment: Array<{ x: number; yl: number; yu: number }> = [];
  const isValid = (v: number | null) => v !== null && Number.isFinite(v);

  const flush = () => {
    if (segment.length >= 2) {
      const lowerPts = segment.map((p) => ({ x: p.x, y: p.yl }));
      const upperPts = [...segment].map((p) => ({ x: p.x, y: p.yu })).reverse();
      const lowerPath = buildSmoothPath(lowerPts);
      const upperPath = buildSmoothPath(upperPts);
      const movePrefix = `M ${upperPts[0].x.toFixed(2)} ${upperPts[0].y.toFixed(2)} `;
      const upperWithoutMove = upperPath.startsWith(movePrefix)
        ? upperPath.slice(movePrefix.length)
        : upperPath.replace(/^M\s+[-\d.]+\s+[-\d.]+\s*/, '');
      out += ` ${lowerPath} L ${upperPts[0].x.toFixed(2)} ${upperPts[0].y.toFixed(2)} ${upperWithoutMove} Z`;
    }
    segment = [];
  };

  for (let i = 0; i < xs.length; i += 1) {
    if (!isValid(a[i]) || !isValid(b[i])) {
      flush();
      continue;
    }
    segment.push({ x: xs[i], yl: toY(a[i] as number), yu: toY(b[i] as number) });
  }
  flush();

  return out.trim();
}

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

function alignSeriesByDate(axisDates: string[], rows: SeriesPoint[]): Array<number | null> {
  if (!axisDates.length) return [];
  if (!rows.length) return axisDates.map(() => null);
  const byDate = new Map(rows.map((row) => [row.date, row.value] as const));
  return axisDates.map((date) => {
    const value = byDate.get(date);
    return value !== undefined && Number.isFinite(value) ? value : null;
  });
}

function movingAverage(values: Array<number | null>, window: number): Array<number | null> {
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - window + 1); j <= i; j += 1) {
      const v = values[j];
      if (v !== null && Number.isFinite(v)) {
        sum += v;
        count += 1;
      }
    }
    out.push(count ? sum / count : null);
  }
  return out;
}

export default function TopTrendChart({
  tateneRows,
  lmeUsdRows,
  usdJpyRows,
  predictionLower = null,
  predictionUpper = null,
}: Props) {
  const [span, setSpan] = useState<SpanKey>('1y');
  const [viewTab, setViewTab] = useState<ViewTab>('tatene_ma');
  const spanDays = SPANS.find((item) => item.key === span)?.days ?? 365;

  const tateneSpan = useMemo(() => filterByPeriodDays(tateneRows, spanDays), [tateneRows, spanDays]);
  const lmeUsdSpan = useMemo(() => filterByPeriodDays(lmeUsdRows, spanDays), [lmeUsdRows, spanDays]);
  const usdJpySpan = useMemo(() => filterByPeriodDays(usdJpyRows, spanDays), [usdJpyRows, spanDays]);

  const shape = useMemo(() => {
    const axisDatesFromTatene = tateneSpan.map((row) => row.date);
    const axisFallback = Array.from(
      new Set([...lmeUsdSpan.map((r) => r.date), ...usdJpySpan.map((r) => r.date)])
    ).sort((a, b) => a.localeCompare(b));
    const axisDatesBase = axisDatesFromTatene.length ? axisDatesFromTatene : axisFallback;
    const safeAxisDates =
      axisDatesBase.length >= 2 ? axisDatesBase : axisDatesBase.length === 1 ? [axisDatesBase[0], axisDatesBase[0]] : ['-', '-'];

    const tateneValues = alignSeriesByDate(safeAxisDates, tateneSpan);
    const maValues = movingAverage(tateneValues, MA_WINDOW);
    const lmeUsdValues = alignSeriesByDate(safeAxisDates, lmeUsdSpan);
    const usdJpyValues = alignSeriesByDate(safeAxisDates, usdJpySpan);

    const fxBase = usdJpyValues
      .filter((v): v is number => v !== null && Number.isFinite(v))
      .reduce((minVal, v) => Math.min(minVal, v), Number.POSITIVE_INFINITY);

    const rawRows = safeAxisDates.map((_, i) => {
      const lmeUsd = lmeUsdValues[i];
      const usd = usdJpyValues[i];
      const tatene = tateneValues[i];
      if (
        lmeUsd === null ||
        usd === null ||
        tatene === null ||
        !Number.isFinite(lmeUsd) ||
        !Number.isFinite(usd) ||
        !Number.isFinite(tatene) ||
        !Number.isFinite(fxBase)
      ) {
        return { lme: null, fx: null, cost: null };
      }
      const model = lmeUsd * usd;
      const lme = lmeUsd * fxBase;
      const fx = model - lme;
      const cost = tatene - model;
      return { lme, fx, cost };
    });

    const minCost = rawRows
      .map((r) => r.cost)
      .filter((v): v is number => v !== null && Number.isFinite(v))
      .reduce((minVal, v) => Math.min(minVal, v), 0);

    const componentRows: ComponentRow[] = rawRows.map((r) => {
      if (r.lme === null || r.fx === null || r.cost === null) {
        return { lme: null, fx: null, cost: null, total: null };
      }
      let lme = r.lme + minCost;
      let fx = r.fx;
      let cost = r.cost - minCost;
      if (lme < 0) {
        cost += lme;
        lme = 0;
      }
      if (fx < 0) {
        cost += fx;
        fx = 0;
      }
      if (cost < 0) cost = 0;
      return { lme, fx, cost, total: lme + fx + cost };
    });

    const innerW = WIDTH - PAD_X * 2;
    const innerH = HEIGHT - PAD_Y * 2;
    const xAt = (i: number) => PAD_X + (innerW * i) / Math.max(safeAxisDates.length - 1, 1);
    const xPositions = safeAxisDates.map((_, i) => xAt(i));

    const predLower = predictionLower !== null && Number.isFinite(predictionLower) ? predictionLower : null;
    const predUpper = predictionUpper !== null && Number.isFinite(predictionUpper) ? predictionUpper : null;

    const lineRange = calcRangeFromZero([...tateneValues, ...maValues, predLower, predUpper]);
    const lineRangeSize = lineRange.max - lineRange.min || 1;
    const lineToY = (v: number) => PAD_Y + innerH - ((v - lineRange.min) / lineRangeSize) * innerH;

    const lineTatenePoints = tateneValues.map((v, i) => ({ x: xPositions[i], y: v === null ? 0 : lineToY(v), v }));
    const lineMaPoints = maValues.map((v, i) => ({ x: xPositions[i], y: v === null ? 0 : lineToY(v), v }));

    const b0 = componentRows.map(() => 0);
    const b1 = componentRows.map((r) => (r.lme !== null && Number.isFinite(r.lme) ? r.lme : null));
    const b2 = componentRows.map((r) => (r.lme !== null && r.fx !== null ? r.lme + r.fx : null));
    const b3 = componentRows.map((r) => (r.total !== null && Number.isFinite(r.total) ? r.total : null));

    // Stacked view also uses a truncated axis like line view.
    // Exclude the artificial zero baseline (b0) from range calc so axis-break can appear.
    const stackRange = calcRangeFromZero([...b1, ...b2, ...b3, predLower, predUpper]);
    const stackRangeSize = stackRange.max - stackRange.min || 1;
    const stackToY = (v: number) => PAD_Y + innerH - ((v - stackRange.min) / stackRangeSize) * innerH;

    const clampY = (y: number) => Math.max(PAD_Y + 1, Math.min(HEIGHT - PAD_Y - 1, y));

    const bandLme = buildBandPathSmooth(xPositions, b0, b1, stackToY);
    const bandFx = buildBandPathSmooth(xPositions, b1, b2, stackToY);
    const bandCost = buildBandPathSmooth(xPositions, b2, b3, stackToY);

    const boundary1Path = buildPathFromNullable(b1.map((v, i) => ({ x: xPositions[i], y: v === null ? 0 : stackToY(v), v })));
    const boundary2Path = buildPathFromNullable(b2.map((v, i) => ({ x: xPositions[i], y: v === null ? 0 : stackToY(v), v })));
    const boundary3Path = buildPathFromNullable(b3.map((v, i) => ({ x: xPositions[i], y: v === null ? 0 : stackToY(v), v })));

    return {
      axisDates: safeAxisDates,
      xPositions,
      tateneValues,
      maValues,
      componentRows,
      xStart: safeAxisDates[0] || '-',
      xMid: safeAxisDates[Math.floor((safeAxisDates.length - 1) * 0.5)] || '-',
      xEnd: safeAxisDates[safeAxisDates.length - 1] || '-',
      line: {
        min: lineRange.min,
        max: lineRange.max,
        predictionLower: predLower,
        predictionUpper: predUpper,
        predictionLowerY: predLower === null ? null : clampY(lineToY(predLower)),
        predictionUpperY: predUpper === null ? null : clampY(lineToY(predUpper)),
        tatenePath: buildPathFromNullable(lineTatenePoints),
        tateneArea: buildAreaPathFromNullable(lineTatenePoints, lineToY(lineRange.min)),
        maPath: buildPathFromNullable(lineMaPoints),
        tatenePoints: lineTatenePoints,
        maPoints: lineMaPoints,
      },
      stack: {
        min: stackRange.min,
        max: stackRange.max,
        predictionLowerY: predLower === null ? null : clampY(stackToY(predLower)),
        predictionUpperY: predUpper === null ? null : clampY(stackToY(predUpper)),
        bandLme,
        bandFx,
        bandCost,
        boundary1Path,
        boundary2Path,
        boundary3Path,
      },
    };
  }, [tateneSpan, lmeUsdSpan, usdJpySpan, predictionLower, predictionUpper]);

  const [activeIndex, setActiveIndex] = useState(shape.axisDates.length - 1);

  useEffect(() => {
    setActiveIndex(shape.axisDates.length - 1);
  }, [shape.axisDates.length, span]);

  const clampedActiveIndex = Math.min(Math.max(activeIndex, 0), shape.axisDates.length - 1);
  const activeDate = shape.axisDates[clampedActiveIndex] || '-';
  const activeX = shape.xPositions[clampedActiveIndex] ?? PAD_X;
  const activeTatene = shape.tateneValues[clampedActiveIndex] ?? null;
  const activeMa = shape.maValues[clampedActiveIndex] ?? null;
  const activeComp = shape.componentRows[clampedActiveIndex] ?? { lme: null, fx: null, cost: null, total: null };

  const handleMove = (clientX: number, left: number, width: number) => {
    if (!shape.axisDates.length || width <= 0) return;
    const x = ((clientX - left) / width) * WIDTH;
    let nearest = 0;
    let minDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < shape.axisDates.length; i += 1) {
      const px = shape.xPositions[i] ?? PAD_X;
      const dist = Math.abs(px - x);
      if (dist < minDist) {
        minDist = dist;
        nearest = i;
      }
    }
    setActiveIndex(nearest);
  };

  return (
    <div className="lg:col-span-2 glass-card rounded-3xl p-5 sm:p-8 relative overflow-hidden">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h4 className="shrink-0 text-[14px] font-black text-cool-grey uppercase tracking-[0.2em] sm:tracking-[0.3em]">トレンド</h4>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div className="inline-flex rounded-lg border border-white/10 overflow-hidden">
            <button
              type="button"
              className={`px-3 py-1.5 text-xs font-bold ${viewTab === 'tatene_ma' ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`}
              onClick={() => setViewTab('tatene_ma')}
            >
              建値+30日MA
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 text-xs font-bold ${viewTab === 'stack' ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`}
              onClick={() => setViewTab('stack')}
            >
              構成
            </button>
          </div>
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
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-end gap-4 text-[10px] font-black uppercase tracking-widest text-cool-grey">
        <span className="text-[#64748b] whitespace-nowrap">{activeDate}</span>
        {viewTab === 'tatene_ma' ? (
          <>
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <span className="h-2.5 w-2.5 rounded-full bg-[#355c7d]" />
              建値平均 <span className="text-[#355c7d]">{fmtNum(activeTatene, 0)} JPY/mt</span>
            </span>
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <span className="h-2.5 w-2.5 rounded-full bg-[#64748b]" />
              3ヶ月移動平均 <span className="text-[#64748b]">{fmtNum(activeMa, 0)} JPY/mt</span>
            </span>
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <span className="h-2.5 w-2.5 rounded-full border border-[#94a3b8]" />
              予測レンジ <span className="text-[#94a3b8]">{fmtNum(shape.line.predictionLower, 0)} - {fmtNum(shape.line.predictionUpper, 0)} JPY/mt</span>
            </span>
          </>
        ) : (
          <>
            {COMPONENT_META.map((meta) => (
              <span key={`component-legend-${meta.key}`} className="inline-flex items-center gap-2 whitespace-nowrap">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: meta.color }} />
                {meta.label} <span style={{ color: meta.color }}>{fmtNum(activeComp[meta.key], 0)} JPY/mt</span>
              </span>
            ))}
            <span className="inline-flex items-center gap-2 whitespace-nowrap text-[#64748b]">
              国内建値 <span>{fmtNum(activeComp.total, 0)} JPY/mt</span>
            </span>
          </>
        )}
      </div>

      <div className="h-[320px] sm:h-[420px] w-full chart-grid rounded-xl border border-white/5 relative overflow-hidden">
        <svg
          className="w-full h-full overflow-hidden"
          preserveAspectRatio="none"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
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
          <defs>
            <linearGradient id="top-trend-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#355c7d" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#355c7d" stopOpacity="0.02" />
            </linearGradient>
            <filter id="top-trend-shadow" x="-20%" y="-20%" width="140%" height="160%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#355c7d" floodOpacity="0.20" />
            </filter>
            <clipPath id="top-trend-plot-clip">
              <rect x={PAD_X} y={PAD_Y} width={WIDTH - PAD_X * 2} height={HEIGHT - PAD_Y * 2} />
            </clipPath>
          </defs>

          <line x1="12" x2="788" y1={PAD_Y} y2={PAD_Y} stroke="rgba(100,116,139,0.10)" strokeDasharray="4 4" />
          <line x1="12" x2="788" y1={(PAD_Y + HEIGHT - PAD_Y) / 2} y2={(PAD_Y + HEIGHT - PAD_Y) / 2} stroke="rgba(100,116,139,0.09)" strokeDasharray="4 4" />
          <line x1="12" x2="788" y1={HEIGHT - PAD_Y} y2={HEIGHT - PAD_Y} stroke="rgba(100,116,139,0.16)" />
          <g clipPath="url(#top-trend-plot-clip)">
            {(viewTab === 'tatene_ma' ? shape.line.predictionUpperY : shape.stack.predictionUpperY) !== null ? (
              <line
                x1="12"
                x2="788"
                y1={(viewTab === 'tatene_ma' ? shape.line.predictionUpperY : shape.stack.predictionUpperY) || 0}
                y2={(viewTab === 'tatene_ma' ? shape.line.predictionUpperY : shape.stack.predictionUpperY) || 0}
                stroke="rgba(148,163,184,0.65)"
                strokeDasharray="6 4"
                strokeWidth="1.4"
              />
            ) : null}
            {(viewTab === 'tatene_ma' ? shape.line.predictionLowerY : shape.stack.predictionLowerY) !== null ? (
              <line
                x1="12"
                x2="788"
                y1={(viewTab === 'tatene_ma' ? shape.line.predictionLowerY : shape.stack.predictionLowerY) || 0}
                y2={(viewTab === 'tatene_ma' ? shape.line.predictionLowerY : shape.stack.predictionLowerY) || 0}
                stroke="rgba(148,163,184,0.65)"
                strokeDasharray="6 4"
                strokeWidth="1.4"
              />
            ) : null}

            {viewTab === 'tatene_ma' ? (
              <>
                <path d={shape.line.tateneArea} fill="url(#top-trend-area)" />
                <path d={shape.line.maPath} fill="none" stroke="#64748b" strokeLinecap="round" strokeWidth="1.8" strokeDasharray="4 3" />
                <path d={shape.line.tatenePath} fill="none" stroke="#355c7d" strokeLinecap="round" strokeWidth="2.8" filter="url(#top-trend-shadow)" />
              </>
            ) : (
              <>
                <path d={shape.stack.bandLme} fill={COMPONENT_META[0].fill} />
                <path d={shape.stack.bandFx} fill={COMPONENT_META[1].fill} />
                <path d={shape.stack.bandCost} fill={COMPONENT_META[2].fill} />
                <path d={shape.stack.boundary1Path} fill="none" stroke={COMPONENT_META[0].color} strokeWidth="1.9" filter="url(#top-trend-shadow)" />
                <path d={shape.stack.boundary2Path} fill="none" stroke={COMPONENT_META[1].color} strokeWidth="1.9" filter="url(#top-trend-shadow)" />
                <path d={shape.stack.boundary3Path} fill="none" stroke={COMPONENT_META[2].color} strokeWidth="2.2" filter="url(#top-trend-shadow)" />
              </>
            )}

            <line x1={activeX} x2={activeX} y1="8" y2={HEIGHT - 8} stroke="rgba(53,92,125,0.52)" strokeWidth="1.35" strokeDasharray="4 3" />
            {viewTab === 'tatene_ma' ? (
              <>
                {shape.line.tatenePoints[clampedActiveIndex]?.v !== null ? (
                  <circle cx={activeX} cy={shape.line.tatenePoints[clampedActiveIndex].y} r="4.0" fill="#355c7d" />
                ) : null}
                {shape.line.maPoints[clampedActiveIndex]?.v !== null ? (
                  <circle cx={activeX} cy={shape.line.maPoints[clampedActiveIndex].y} r="3.2" fill="#64748b" />
                ) : null}
              </>
            ) : null}
          </g>

          <text x="20" y={HEIGHT - PAD_Y - 4} fill="#64748b" fontSize="10" fontWeight="700">
            0
          </text>

        </svg>
      </div>

      <div className="flex justify-between mt-6 text-[9px] sm:text-[14px] text-cool-grey font-black uppercase tracking-[0.2em]">
        <span>{shape.xStart}</span>
        <span>{shape.xMid}</span>
        <span>{shape.xEnd}</span>
      </div>
      <p className="mt-2 text-[9px] sm:text-[10px] text-cool-grey">※ 建値平均・LME平均・為替平均の月次値。縦軸は下限0基準。</p>
    </div>
  );
}
