import type { ReactNode } from 'react';

export type SeriesPoint = { date: string; value: number };

export function fmtNum(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return '-';
  return value.toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function calcChange(curr: number | null, prev: number | null): number | null {
  if (curr === null || prev === null || !Number.isFinite(curr) || !Number.isFinite(prev) || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

export function latestPair(rows: SeriesPoint[]): { latest: SeriesPoint | null; prev: SeriesPoint | null } {
  if (!rows.length) return { latest: null, prev: null };
  return { latest: rows[rows.length - 1] ?? null, prev: rows.length > 1 ? rows[rows.length - 2] ?? null : null };
}

export function buildPolyline(values: number[], width = 220, height = 48): string {
  const safe = values.length ? values : [0, 0];
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const range = max - min || 1;
  return safe
    .map((v, i) => {
      const x = (i * width) / Math.max(safe.length - 1, 1);
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function calcMonthlyChangeRange(values: number[]): { min: number; max: number } {
  const rows = values.filter((v) => Number.isFinite(v));
  if (rows.length < 2) return { min: -1, max: 1 };
  const changes: number[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1];
    const curr = rows[i];
    if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev === 0) continue;
    changes.push(((curr - prev) / Math.abs(prev)) * 100);
  }
  if (!changes.length) return { min: -1, max: 1 };
  let min = Math.min(...changes);
  let max = Math.max(...changes);
  if (min === max) {
    if (min === 0) {
      min = -1;
      max = 1;
    } else if (min > 0) {
      min = 0;
    } else {
      max = 0;
    }
  }
  min = Math.min(min, 0);
  max = Math.max(max, 0);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  return { min, max };
}

function fmtGaugeBound(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  const digits = abs >= 10 ? 0 : 1;
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

function fmtGaugeExtreme(value: number, kind: 'min' | 'max'): string {
  if (!Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  const digits = abs >= 10 ? 0 : 1;
  if (kind === 'min') return `MIN -${abs.toFixed(digits)}%`;
  return `MAX ${abs.toFixed(digits)}%`;
}

export function MetricCard({
  label,
  labelNote,
  alertNote,
  change,
  value,
  unit,
  polyline,
  barValues,
  gaugeRangeValues,
  gaugeCurrentChange,
  chartMode = 'line',
  date,
  positiveWhenUp = true,
  titleUnderBadge = false,
  gaugeSize = 'default',
  titlePadRight = false,
  gaugeFixedRange,
  alertNoteClassName,
}: {
  label: string;
  labelNote?: string;
  alertNote?: string;
  change: number | null;
  value: string;
  unit: string;
  polyline?: string;
  barValues?: number[];
  gaugeRangeValues?: number[];
  gaugeCurrentChange?: number | null;
  chartMode?: 'line' | 'bars' | 'gauge' | 'none';
  date: string;
  positiveWhenUp?: boolean;
  titleUnderBadge?: boolean;
  gaugeSize?: 'default' | 'large';
  titlePadRight?: boolean;
  gaugeFixedRange?: { min: number; max: number };
  alertNoteClassName?: string;
}) {
  const supportive = change === null ? null : positiveWhenUp ? change >= 0 : change < 0;
  const badgeCls =
    supportive === null
      ? 'text-[#5f6b7a] bg-[#f2eee8] border border-[#ddd5ca]'
      : supportive
        ? 'text-[#0f6d6a] bg-[#e8f1ee] border border-[#cfe0da]'
        : 'text-[#b86d53] bg-[#f6ece8] border border-[#e6d1c9]';
  const lineColor = supportive === null ? '#94a3b8' : supportive ? '#0f6d6a' : '#b86d53';
  const bars = barValues && barValues.length ? barValues : [0, 0, 0, 0, 0, 0, 0];
  const maxBar = Math.max(...bars.map((x) => Math.abs(x))) || 1;
  const lastBarClass = supportive === null ? 'bg-[#94a3b8]' : supportive ? 'bg-[#0f6d6a]' : 'bg-[#b86d53]';
  const gaugeSource = gaugeRangeValues && gaugeRangeValues.length >= 2 ? gaugeRangeValues : bars;
  const monthlyRange = gaugeFixedRange ?? calcMonthlyChangeRange(gaugeSource);
  const gaugeMin = gaugeFixedRange?.min ?? -10;
  const gaugeMax = gaugeFixedRange?.max ?? 10;
  const monthlyMinRaw = monthlyRange.min;
  const monthlyMaxRaw = monthlyRange.max;
  const monthlyMin = Math.max(gaugeMin, Math.min(0, monthlyMinRaw));
  const monthlyMax = Math.min(gaugeMax, Math.max(0, monthlyMaxRaw));
  const gaugeValue = gaugeCurrentChange ?? change ?? 0;
  const clampedGaugeValue = Math.max(gaugeMin, Math.min(gaugeMax, gaugeValue));
  const gaugeRatio = (clampedGaugeValue - gaugeMin) / (gaugeMax - gaugeMin);
  const gaugeAngle = Math.PI * (1 - gaugeRatio);
  const gaugeCx = 110;
  const gaugeCy = 52;
  const gaugeR = 34;
  const gaugeNeedleR = gaugeR - 1.5;
  const gaugeNeedleX = gaugeCx + gaugeNeedleR * Math.cos(gaugeAngle);
  const gaugeNeedleY = gaugeCy - gaugeNeedleR * Math.sin(gaugeAngle);
  const gaugeVecX = gaugeNeedleX - gaugeCx;
  const gaugeVecY = gaugeNeedleY - gaugeCy;
  const gaugeLen = Math.hypot(gaugeVecX, gaugeVecY) || 1;
  const gaugeUx = gaugeVecX / gaugeLen;
  const gaugeUy = gaugeVecY / gaugeLen;
  const gaugePx = -gaugeUy;
  const gaugePy = gaugeUx;
  const gaugeNeedleBaseDist = 1.6;
  const gaugeNeedleHalfWidth = 1.2;
  const gaugeNeedleBaseX = gaugeCx + gaugeUx * gaugeNeedleBaseDist;
  const gaugeNeedleBaseY = gaugeCy + gaugeUy * gaugeNeedleBaseDist;
  const gaugeNeedleLeftX = gaugeNeedleBaseX + gaugePx * gaugeNeedleHalfWidth;
  const gaugeNeedleLeftY = gaugeNeedleBaseY + gaugePy * gaugeNeedleHalfWidth;
  const gaugeNeedleRightX = gaugeNeedleBaseX - gaugePx * gaugeNeedleHalfWidth;
  const gaugeNeedleRightY = gaugeNeedleBaseY - gaugePy * gaugeNeedleHalfWidth;
  const gaugeNeedlePath = [
    `M ${gaugeNeedleLeftX.toFixed(2)} ${gaugeNeedleLeftY.toFixed(2)}`,
    `L ${gaugeNeedleX.toFixed(2)} ${gaugeNeedleY.toFixed(2)}`,
    `L ${gaugeNeedleRightX.toFixed(2)} ${gaugeNeedleRightY.toFixed(2)}`,
    'Z',
  ].join(' ');
  const zeroTickOuterX = gaugeCx;
  const zeroTickOuterY = gaugeCy - gaugeR;
  const zeroTickInnerX = gaugeCx;
  const zeroTickInnerY = gaugeCy - gaugeR + 7;
  const arcPointFor = (value: number, radius = gaugeR): { x: number; y: number; angle: number } => {
    const ratio = (value - gaugeMin) / (gaugeMax - gaugeMin);
    const angle = Math.PI * (1 - ratio);
    return {
      x: gaugeCx + radius * Math.cos(angle),
      y: gaugeCy - radius * Math.sin(angle),
      angle,
    };
  };
  const axisLeft = arcPointFor(gaugeMin);
  const axisZero = arcPointFor(0);
  const axisRight = arcPointFor(gaugeMax);
  const minRef = arcPointFor(monthlyMin);
  const maxRef = arcPointFor(monthlyMax);
  const tickLen = 7;
  const tickLine = (p: { x: number; y: number; angle: number }) => ({
    x1: p.x,
    y1: p.y,
    x2: p.x - Math.cos(p.angle) * tickLen,
    y2: p.y + Math.sin(p.angle) * tickLen,
  });
  const minTick = tickLine(minRef);
  const maxTick = tickLine(maxRef);
  const minLabel = arcPointFor(monthlyMin, gaugeR + 14);
  const maxLabel = arcPointFor(monthlyMax, gaugeR + 14);
  const labelLeftPct = (axisLeft.x / 220) * 100;
  const labelZeroPct = (axisZero.x / 220) * 100;
  const labelRightPct = (axisRight.x / 220) * 100;
  const gaugeNeedleColor = '#111827';
  const gaugeGray = '#ddd5ca';
  // Match the gauge colors to TOP page mini-bar tones.
  const gaugeDownColor = '#c08a73';
  const gaugeUpColor = '#0f6d6a';
  const gaugeId = label.replace(/[^a-zA-Z0-9_-]/g, '') || 'card';
  const gaugeBandGradId = `metric-gauge-band-${gaugeId}`;
  const gaugeStops: Array<{ o: number; c: string }> = [
    { o: 0, c: gaugeDownColor },
    { o: 50, c: gaugeGray },
    { o: 100, c: gaugeUpColor },
  ];
  const titlePadCls = titlePadRight ? 'pr-16 sm:pr-24' : '';
  const titleWrapCls = titleUnderBadge
    ? `mb-6 pt-7 sm:pt-8 ${titlePadCls} min-h-[3.2rem]`.trim()
    : `mb-6 ${titlePadCls} min-h-[3.2rem]`.trim();
  const gaugeWrapCls =
    gaugeSize === 'large'
      ? 'w-[140%] -ml-[20%] sm:w-[136%] sm:-ml-[18%] mx-auto aspect-[220/92]'
      : 'w-full sm:w-[120%] sm:-ml-[10%] mx-auto aspect-[220/72]';
  return (
    <div className="glass-card glass-card-hover relative p-4 sm:p-6 rounded-2xl transition-all group text-left">
      <div className={`metric-badge-top-right text-right text-xs sm:text-sm font-bold px-2 sm:px-3 py-1 rounded-full ${badgeCls}`}>
        {fmtPct(change)}
      </div>
      <div className={titleWrapCls}>
        <span
          title={label}
          className="block text-[14px] leading-snug font-black text-cool-grey uppercase tracking-[0.2em] break-normal overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]"
        >
          {label}
        </span>
        {labelNote ? (
          <span className="mt-1 block text-[9px] leading-tight font-medium tracking-normal text-cool-grey normal-case">
            {labelNote}
          </span>
        ) : null}
      </div>
      <div className="flex items-baseline gap-4 mb-4 sm:mb-6">
        <h4 className="text-xl sm:text-3xl font-bold tracking-tight text-off-white">{value}</h4>
        <span className="text-[#8e97a5] text-[9px] sm:text-[10px] font-medium tracking-wide">{unit}</span>
      </div>
      {chartMode === 'none' ? null : chartMode === 'bars' ? (
        <div className="h-12 w-full flex items-end gap-4 opacity-60">
          {bars.map((n, i) => {
            const h = Math.max(22, Math.round((Math.abs(n) / maxBar) * 95));
            const cls = i === bars.length - 1 ? lastBarClass : 'bg-[#e3ddd4]';
            return <div key={`bar-${i}-${n}`} className={`${cls} flex-1 rounded-sm`} style={{ height: `${h}%` }} />;
          })}
        </div>
      ) : chartMode === 'gauge' ? (
        <div className={gaugeWrapCls}>
          <svg viewBox="0 0 220 72" preserveAspectRatio="none" className="h-full w-full">
            <defs>
              <linearGradient
                id={gaugeBandGradId}
                gradientUnits="userSpaceOnUse"
                x1="76"
                y1="52"
                x2="144"
                y2="52"
              >
                {gaugeStops.map((s, idx) => (
                  <stop key={`gauge-stop-${idx}`} offset={`${s.o.toFixed(2)}%`} stopColor={s.c} />
                ))}
              </linearGradient>
            </defs>
            <path d="M 76 52 A 34 34 0 0 1 144 52" fill="none" stroke={`url(#${gaugeBandGradId})`} strokeWidth="10" strokeLinecap="round" />
            {monthlyMinRaw < 0 ? (
              <>
                <line x1={minTick.x1.toFixed(2)} y1={minTick.y1.toFixed(2)} x2={minTick.x2.toFixed(2)} y2={minTick.y2.toFixed(2)} stroke={gaugeDownColor} strokeWidth="1.8" strokeLinecap="round" />
                <text
                  x={minLabel.x.toFixed(2)}
                  y={minLabel.y.toFixed(2)}
                  textAnchor={minLabel.x <= gaugeCx ? 'end' : 'start'}
                  dominantBaseline="middle"
                  fill={gaugeDownColor}
                  fontSize="8.3"
                  fontWeight="800"
                  letterSpacing="0.04em"
                >
                  {fmtGaugeExtreme(monthlyMinRaw, 'min')}
                </text>
              </>
            ) : null}
            {monthlyMaxRaw > 0 ? (
              <>
                <line x1={maxTick.x1.toFixed(2)} y1={maxTick.y1.toFixed(2)} x2={maxTick.x2.toFixed(2)} y2={maxTick.y2.toFixed(2)} stroke={gaugeUpColor} strokeWidth="1.8" strokeLinecap="round" />
                <text
                  x={maxLabel.x.toFixed(2)}
                  y={maxLabel.y.toFixed(2)}
                  textAnchor={maxLabel.x <= gaugeCx ? 'end' : 'start'}
                  dominantBaseline="middle"
                  fill={gaugeUpColor}
                  fontSize="8.3"
                  fontWeight="800"
                  letterSpacing="0.04em"
                >
                  {fmtGaugeExtreme(monthlyMaxRaw, 'max')}
                </text>
              </>
            ) : null}
            <line x1={zeroTickOuterX.toFixed(2)} y1={zeroTickOuterY.toFixed(2)} x2={zeroTickInnerX.toFixed(2)} y2={zeroTickInnerY.toFixed(2)} stroke="#7f8878" strokeWidth="2.2" strokeLinecap="round" />
            <path d={gaugeNeedlePath} fill={gaugeNeedleColor} />
          </svg>
          <div className="relative mt-[-3px] h-[14px] text-[10px] font-bold tracking-wide text-cool-grey">
            <span className="absolute top-0 -translate-x-1/2" style={{ left: `${labelLeftPct.toFixed(2)}%` }}>{fmtGaugeBound(gaugeMin)}</span>
            <span className="absolute top-0 -translate-x-1/2" style={{ left: `${labelZeroPct.toFixed(2)}%` }}>0%</span>
            <span className="absolute top-0 -translate-x-1/2" style={{ left: `${labelRightPct.toFixed(2)}%` }}>{fmtGaugeBound(gaugeMax)}</span>
          </div>
        </div>
      ) : (
        <div className="h-12 w-full opacity-70">
          <svg viewBox="0 0 220 48" preserveAspectRatio="none" className="h-full w-full">
            <polyline fill="none" stroke={lineColor} strokeWidth="2.5" points={polyline ?? ''} />
          </svg>
        </div>
      )}
      {alertNote ? (
        <p className={`mt-3 text-[10px] font-bold leading-snug ${alertNoteClassName ?? 'text-[#b86d53]'}`}>{alertNote}</p>
      ) : null}
      <p className="mt-2 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.18em] text-cool-grey text-right">{date}</p>
    </div>
  );
}

export function SectionCard({
  title,
  right,
  children,
  className,
  headerClassName,
  titleClassName,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  titleClassName?: string;
}) {
  const hasHeader = Boolean(title) || Boolean(right);
  return (
    <article className={`glass-card rounded-3xl p-8 ${className ?? ''}`}>
      {hasHeader ? (
        <div className={`mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between ${headerClassName ?? ''}`}>
          {title ? <h4 className={`text-[14px] leading-none font-black text-cool-grey uppercase tracking-[0.2em] sm:tracking-[0.3em] ${titleClassName ?? ''}`}>{title}</h4> : <div />}
          {right}
        </div>
      ) : null}
      {children}
    </article>
  );
}

export function LinePlot({
  lines,
  xLabels,
  width = 800,
  height = 320,
  scaleMode = 'shared',
  referenceValue = null,
  overlayNote,
}: {
  lines: Array<{ values: Array<number | null>; color: string; type?: 'line' | 'bar'; opacity?: number }>;
  xLabels: [string, string, string];
  width?: number;
  height?: number;
  scaleMode?: 'shared' | 'independent' | 'centered_reference';
  referenceValue?: number | null;
  overlayNote?: string;
}) {
  const series = lines.map((line) => ({ ...line, type: line.type ?? 'line' }));
  const all = series.flatMap((l) => l.values).filter((value): value is number => value !== null && Number.isFinite(value));
  const allWithRef = referenceValue !== null && Number.isFinite(referenceValue) ? [...all, referenceValue] : all;
  const safeAll = allWithRef.length ? allWithRef : [0, 0];
  const sharedMin = Math.min(...safeAll);
  const sharedMax = Math.max(...safeAll);
  const sharedRange = sharedMax - sharedMin || 1;
  const plotLeft = 10;
  const plotRight = width - 10;
  // Reserve a compact lane for the bottom-right note so lines/bars do not overlap it.
  const noteLane = overlayNote ? 18 : 0;
  const plotBottom = height - 20 - noteLane;
  const plotTop = 20;
  const hasReference = referenceValue !== null && Number.isFinite(referenceValue);
  const scales = series.map((line) => {
    if (scaleMode === 'shared') {
      return { min: sharedMin, range: sharedRange };
    }
    if (scaleMode === 'centered_reference' && hasReference) {
      const ref = referenceValue as number;
      const safeVals = line.values.filter((v): v is number => v !== null && Number.isFinite(v));
      const centeredVals = safeVals.length ? safeVals : [ref, ref];
      const maxDev = Math.max(1, ...centeredVals.map((v) => Math.abs(v - ref)));
      return { min: ref - maxDev, range: maxDev * 2 };
    }
    const safeVals = line.values.filter((v): v is number => v !== null && Number.isFinite(v));
    const numericVals = safeVals.length ? safeVals : [0, 0];
    const min = Math.min(...numericVals);
    const max = Math.max(...numericVals);
    return { min, range: max - min || 1 };
  });
  const xAt = (idx: number, len: number) => {
    if (len <= 1) return (plotLeft + plotRight) / 2;
    return plotLeft + (idx * (plotRight - plotLeft)) / (len - 1);
  };
  const yAt = (value: number, scale: { min: number; range: number }) =>
    plotBottom - ((value - scale.min) / scale.range) * (plotBottom - plotTop);
  const buildSegments = (vals: Array<number | null>, scale: { min: number; range: number }) => {
    const segments: string[] = [];
    let current: string[] = [];
    vals.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) {
        if (current.length >= 2) segments.push(current.join(' '));
        current = [];
        return;
      }
      const x = xAt(i, vals.length);
      const y = yAt(v, scale);
      current.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    });
    if (current.length >= 2) segments.push(current.join(' '));
    return segments;
  };
  const barSeries = series.map((line, idx) => ({ line, idx })).filter((row) => row.line.type === 'bar');
  const lineSeries = series.map((line, idx) => ({ line, idx })).filter((row) => row.line.type !== 'bar');
  const maxLen = Math.max(1, ...series.map((line) => line.values.length));
  const xStep = maxLen > 1 ? (plotRight - plotLeft) / (maxLen - 1) : plotRight - plotLeft;
  const barWidth = Math.max(3, Math.min(16, (xStep * 0.5) / Math.max(barSeries.length, 1)));
  const containerHeight = Math.max(220, Math.round((height / 320) * 340));
  return (
    <>
      <div className="relative w-full chart-grid rounded-xl border border-white/5" style={{ height: `${containerHeight}px` }}>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full">
          <line x1="10" y1={plotBottom} x2={width - 10} y2={plotBottom} stroke="rgba(148,163,184,0.25)" />
          <line x1="10" y1={height / 2} x2={width - 10} y2={height / 2} stroke="rgba(148,163,184,0.2)" strokeDasharray="6 4" />
          {referenceValue !== null && Number.isFinite(referenceValue) ? (
            <>
              {/*
                shared: draw at shared-scale value
                centered_reference: all series are centered at ref, so baseline is chart middle
              */}
              <line
                x1={plotLeft}
                y1={
                  scaleMode === 'centered_reference'
                    ? (plotTop + plotBottom) / 2
                    : yAt(referenceValue, { min: sharedMin, range: sharedRange })
                }
                x2={plotRight}
                y2={
                  scaleMode === 'centered_reference'
                    ? (plotTop + plotBottom) / 2
                    : yAt(referenceValue, { min: sharedMin, range: sharedRange })
                }
                stroke="rgba(100,116,139,0.38)"
                strokeDasharray="5 4"
                strokeWidth="1.2"
              />
              <text
                x={plotLeft + 2}
                y={
                  (scaleMode === 'centered_reference'
                    ? (plotTop + plotBottom) / 2
                    : yAt(referenceValue, { min: sharedMin, range: sharedRange })) + 8
                }
                fill="rgba(71,85,105,0.86)"
                fontSize="10"
                fontWeight="700"
                dominantBaseline="hanging"
              >
                {fmtNum(referenceValue, 0)}
              </text>
            </>
          ) : null}
          {barSeries.map(({ line, idx }, sIdx) =>
            line.values.map((v, i) => {
              if (v === null || !Number.isFinite(v)) return null;
              const cx = xAt(i, line.values.length);
              const offset = (sIdx - (barSeries.length - 1) / 2) * (barWidth + 1.5);
              const y = yAt(v, scales[idx]);
              const rectY = Math.min(y, plotBottom);
              const rectH = Math.max(1, Math.abs(plotBottom - y));
              return (
                <rect
                  key={`bar-${sIdx}-${i}`}
                  x={(cx - barWidth / 2 + offset).toFixed(2)}
                  y={rectY.toFixed(2)}
                  width={barWidth.toFixed(2)}
                  height={rectH.toFixed(2)}
                  fill={line.color}
                  fillOpacity={(line.opacity ?? 0.52).toFixed(2)}
                  rx="1.4"
                />
              );
            })
          )}
          {lineSeries.map(({ line, idx }, i) =>
            buildSegments(line.values, scales[idx]).map((points, segmentIdx) => (
              <polyline
                key={`line-${i}-${segmentIdx}`}
                fill="none"
                stroke={line.color}
                strokeWidth="3"
                strokeLinecap="round"
                points={points}
              />
            ))
          )}
        </svg>
        {overlayNote ? (
          <span className="pointer-events-none absolute bottom-1.5 right-3 text-[9px] leading-none font-black uppercase tracking-[0.12em] text-cool-grey">
            {overlayNote}
          </span>
        ) : null}
      </div>
      <div className="flex justify-between mt-5 text-[9px] sm:text-[14px] text-cool-grey font-black uppercase tracking-[0.2em]">
        <span>{xLabels[0]}</span>
        <span>{xLabels[1]}</span>
        <span>{xLabels[2]}</span>
      </div>
    </>
  );
}

export function GaugeCard({
  title,
  score,
  label,
  supportive = null,
}: {
  title: string;
  score: number;
  label: string;
  supportive?: boolean | null;
}) {
  const safe = Math.max(0, Math.min(100, score));
  const r = 58;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - safe / 100);
  const toneCls = supportive === null ? 'text-[#94a3b8]' : supportive ? 'text-[#0f6d6a]' : 'text-[#b86d53]';
  return (
    <div className="glass-card p-4 sm:p-8 rounded-3xl flex flex-col items-center border border-[#e6dfd3]">
      <h5 className="text-[14px] font-black text-cool-grey uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-6">{title}</h5>
      <div className="relative w-28 h-28 sm:w-40 sm:h-40 flex items-center justify-center rounded-full border-2 sm:border-4 border-[#ece7df]">
        <svg className="w-24 h-24 sm:w-32 sm:h-32 -rotate-90" viewBox="0 0 128 128">
          <circle className="text-[#dbd6cf]" cx="64" cy="64" fill="transparent" r={r} stroke="currentColor" strokeWidth="12" />
          <circle
            className={toneCls}
            cx="64"
            cy="64"
            fill="transparent"
            r={r}
            stroke="currentColor"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={c.toFixed(1)}
            strokeDashoffset={offset.toFixed(1)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl sm:text-3xl font-black text-off-white">{Math.round(safe)}%</span>
          <span className={`text-[8px] sm:text-[9px] font-black uppercase tracking-[0.12em] sm:tracking-widest mt-1 ${toneCls}`}>{label}</span>
        </div>
      </div>
    </div>
  );
}
