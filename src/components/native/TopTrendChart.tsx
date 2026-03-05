'use client';

import { useEffect, useMemo, useState } from 'react';

type SeriesPoint = { date: string; value: number };

type Props = {
  rows: SeriesPoint[];
  upper: number | null;
  lower: number | null;
};

type SpanKey = '1m' | '3m' | '6m' | '1y' | '3y';

const WIDTH = 800;
const HEIGHT = 400;
const PAD_X = 12;
const PAD_Y = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const SPANS: Array<{ key: SpanKey; label: string; days: number }> = [
  { key: '1m', label: '1M', days: 31 },
  { key: '3m', label: '3M', days: 93 },
  { key: '6m', label: '6M', days: 186 },
  { key: '1y', label: '1Y', days: 365 },
  { key: '3y', label: '3Y', days: 365 * 3 },
];

function fmtNum(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return '-';
  return value.toLocaleString('ja-JP', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
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

export default function TopTrendChart({ rows, upper, lower }: Props) {
  const [span, setSpan] = useState<SpanKey>('1m');
  const spanDays = SPANS.find((item) => item.key === span)?.days ?? 31;
  const spanRows = useMemo(() => filterByPeriodDays(rows, spanDays), [rows, spanDays]);
  const safeRows = spanRows.length >= 2 ? spanRows : [{ date: '-', value: 0 }, { date: '-', value: 0 }];
  const [activeIndex, setActiveIndex] = useState(safeRows.length - 1);

  useEffect(() => {
    setActiveIndex(safeRows.length - 1);
  }, [safeRows.length, span]);

  const shape = useMemo(() => {
    const vals = safeRows.map((r) => r.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const innerW = WIDTH - PAD_X * 2;
    const innerH = HEIGHT - PAD_Y * 2;
    const baseY = HEIGHT - PAD_Y;

    const points = safeRows.map((r, i) => ({
      ...r,
      x: PAD_X + (innerW * i) / Math.max(safeRows.length - 1, 1),
      y: PAD_Y + innerH - ((r.value - min) / range) * innerH,
    }));

    const alpha = 2 / (30 + 1);
    const emaVals: number[] = [];
    for (let i = 0; i < safeRows.length; i += 1) {
      if (i === 0) emaVals.push(safeRows[i].value);
      else emaVals.push(alpha * safeRows[i].value + (1 - alpha) * emaVals[i - 1]);
    }
    const emaPoints = safeRows.map((r, i) => ({
      ...r,
      emaValue: emaVals[i],
      x: PAD_X + (innerW * i) / Math.max(safeRows.length - 1, 1),
      y: PAD_Y + innerH - ((emaVals[i] - min) / range) * innerH,
    }));

    const linePath = buildSmoothPath(points);
    const emaPath = buildSmoothPath(emaPoints);
    const first = points[0];
    const last = points[points.length - 1];
    const areaPath = `${linePath} L ${last.x.toFixed(2)} ${baseY.toFixed(2)} L ${first.x.toFixed(2)} ${baseY.toFixed(2)} Z`;

    const toY = (value: number | null) => {
      const v = value === null ? min : Math.min(Math.max(value, min), max);
      return PAD_Y + innerH - ((v - min) / range) * innerH;
    };

    return {
      points,
      emaPoints,
      linePath,
      emaPath,
      areaPath,
      toY,
      xStart: first.date,
      xMid: points[Math.floor((points.length - 1) * 0.5)]?.date || first.date,
      xEnd: last.date,
    };
  }, [safeRows]);

  const clampedActiveIndex = Math.min(Math.max(activeIndex, 0), shape.points.length - 1);
  const active = shape.points[clampedActiveIndex];
  const activeEma = shape.emaPoints[clampedActiveIndex]?.emaValue ?? null;
  const activeRangeText =
    upper !== null && Number.isFinite(upper) && lower !== null && Number.isFinite(lower)
      ? `${fmtNum(lower, 0)} - ${fmtNum(upper, 0)} JPY`
      : '-';
  const upperY = shape.toY(upper);
  const lowerY = shape.toY(lower);

  const handleMove = (clientX: number, left: number, width: number) => {
    if (!shape.points.length || width <= 0) return;
    const x = ((clientX - left) / width) * WIDTH;
    let nearest = 0;
    let minDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < shape.points.length; i += 1) {
      const dist = Math.abs(shape.points[i].x - x);
      if (dist < minDist) {
        minDist = dist;
        nearest = i;
      }
    }
    setActiveIndex(nearest);
  };

  return (
    <div className="lg:col-span-2 glass-card rounded-3xl p-5 sm:p-8 relative overflow-hidden">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h4 className="shrink-0 text-[14px] font-black text-cool-grey uppercase tracking-[0.2em] sm:tracking-[0.3em]">トレンド</h4>
        <div className="ml-auto">
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
        <span className="text-[#64748b] whitespace-nowrap">{active?.date || '-'}</span>
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <span className="w-2.5 h-2.5 rounded-full bg-[#355c7d]" />
          国内建値 <span className="text-[#355c7d]">{fmtNum(active?.value ?? null, 0)} JPY</span>
        </span>
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <span className="w-2.5 h-2.5 rounded-full bg-[#64748b]" />
          30日移動平均 <span className="text-[#64748b]">{fmtNum(activeEma, 0)} JPY</span>
        </span>
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <span className="w-2.5 h-2.5 rounded-full bg-[#94a3b8]" />
          予測レンジ <span className="text-[#94a3b8]">{activeRangeText}</span>
        </span>
      </div>
      <div className="h-[320px] sm:h-[420px] w-full chart-grid rounded-xl border border-white/5 relative">
        <svg
          className="w-full h-full overflow-visible"
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
            <linearGradient id="chartGradientNativeInteractive" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#4a6a88" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#4a6a88" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="12" x2="788" y1={upperY} y2={upperY} stroke="rgba(148,163,184,0.75)" strokeDasharray="6 4" strokeWidth="1.5" />
          <line x1="12" x2="788" y1={lowerY} y2={lowerY} stroke="rgba(148,163,184,0.75)" strokeDasharray="6 4" strokeWidth="1.5" />
          <path d={shape.areaPath} fill="url(#chartGradientNativeInteractive)" />
          <path d={shape.linePath} fill="none" stroke="#355c7d" strokeLinecap="round" strokeWidth="3" />
          <path d={shape.emaPath} fill="none" stroke="#64748b" strokeLinecap="round" strokeWidth="1.6" strokeDasharray="4 3" />
          <line x1={active?.x || 0} x2={active?.x || 0} y1="12" y2="388" stroke="rgba(53,92,125,0.28)" strokeDasharray="4 3" strokeWidth="1" />
          <circle cx={active?.x || 0} cy={active?.y || 0} r="4.6" fill="#355c7d" />
          <text x="20" y={upperY - 4} fill="#64748b" fontSize="10" fontWeight="700">{upper !== null ? fmtNum(upper, 0) : '-'}</text>
          <text x="20" y={lowerY - 4} fill="#64748b" fontSize="10" fontWeight="700">{lower !== null ? fmtNum(lower, 0) : '-'}</text>
        </svg>
      </div>
      <div className="flex justify-between mt-6 text-[9px] sm:text-[14px] text-cool-grey font-black uppercase tracking-[0.2em]">
        <span>{shape.xStart}</span>
        <span>{shape.xMid}</span>
        <span>{shape.xEnd}</span>
      </div>
    </div>
  );
}
