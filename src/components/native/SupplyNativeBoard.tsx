'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { LinePlot, MetricCard, SectionCard, buildPolyline, calcChange, fmtNum, latestPair } from '@/components/native/NativeWidgets';
import type { SeriesPoint } from '@/lib/selected_series_bundle';

type SupplyRows = {
  chile: SeriesPoint[];
  peru: SeriesPoint[];
  icsgBalance: SeriesPoint[];
  icsgProd: SeriesPoint[];
  icsgUse: SeriesPoint[];
  jpProd: SeriesPoint[];
  jpSales: SeriesPoint[];
  jpInv: SeriesPoint[];
  hs7404Imp: SeriesPoint[];
  hs7404Exp: SeriesPoint[];
  tatene: SeriesPoint[];
  lme: SeriesPoint[];
  usdjpy: SeriesPoint[];
};

type SupplyTrendRow = {
  date: string;
  chile: number | null;
  peru: number | null;
};

type SupplySpanKey = '1y' | '3y';
type SheetHelpKey = 'supply' | 'demand' | 'gap' | 'retention' | 'dependency';
type SupplyContributionTabKey = 'tatene' | 'premium';
type ContributionItem = { label: string; color: string; share: number };
type ContributionSummary = { dominant: ContributionItem; items: ContributionItem[] };

const SUPPLY_SPANS: Array<{ key: SupplySpanKey; label: string; months: number }> = [
  { key: '1y', label: '1Y', months: 12 },
  { key: '3y', label: '3Y', months: 36 },
];

const CHART_W = 800;
const CHART_H = 400;
const PAD_X = 12;
const PAD_Y = 20;

const CHILE_COLOR = '#355c7d';
const PERU_COLOR = '#7aa6c2';
const REL_TATENE_COLOR = '#355c7d';
const REL_CHILE_COLOR = '#b86d53';
const REL_DEMAND_COLOR = '#8899a8';
const REL_SCRAP_COLOR = '#6d8a78';

const SHEET_HELP_ITEMS: Array<{
  key: SheetHelpKey;
  label: string;
  formula: string;
  proxy?: string;
}> = [
  {
    key: 'supply',
    label: '① 供給量',
    formula: '定義: 生産量 + 銅地金輸入 + 期首在庫',
    proxy: '現行proxy: 生産量（電気銅生産）',
  },
  {
    key: 'demand',
    label: '② 需要量',
    formula: '定義: 販売量 + 銅地金輸出 + 期末在庫',
    proxy: '現行proxy: 販売量（電気銅販売）',
  },
  {
    key: 'gap',
    label: '③ 当月過不足',
    formula: '定義: (生産 + 銅地金輸入 + 期首在庫) - (販売 + 銅地金輸出 + 期末在庫)',
    proxy: '現行proxy: 供給量 - 需要量',
  },
  {
    key: 'retention',
    label: '④ スクラップ保持力',
    formula: '定義: 銅スクラップ輸入 - 銅スクラップ輸出',
  },
  {
    key: 'dependency',
    label: '⑤ 海外依存度',
    formula: '定義: (生産量 - 原料輸入総量(純分換算)) / 生産量',
    proxy: '原料輸入(純分換算)=銅鉱・精鉱×0.3 + 銅マット×0.6 + 粗銅×0.99 + 銅スクラップ×0.8',
  },
];

function monthKey(date: string) {
  return date.slice(0, 7);
}

function toMonthMap(series: SeriesPoint[]) {
  const map = new Map<string, number>();
  for (const row of series) map.set(monthKey(row.date), row.value);
  return map;
}

function idxRows(rows: Array<{ date: string; value: number }>) {
  const base = rows[0]?.value || 1;
  return rows.map((r) => ({ ...r, value: (r.value / base) * 100 }));
}

function withCarryForward(rows: Array<{ date: string; value: number | null | undefined }>) {
  const first = rows.find((row) => row.value !== null && row.value !== undefined && Number.isFinite(row.value))?.value ?? 0;
  let last = first;
  return rows.map((row) => {
    const v = row.value;
    if (v !== null && v !== undefined && Number.isFinite(v)) last = v;
    return { date: row.date, value: last };
  });
}

function computeContributionSummary(
  targetRows: Array<{ date: string; value: number }>,
  factors: Array<{ label: string; color: string; rows: Array<{ date: string; value: number }> }>,
  lookbackPoints = 12
): ContributionSummary {
  const target = targetRows.slice(-Math.max(lookbackPoints, 2));
  if (target.length < 2 || factors.length === 0) {
    const eq = factors.length ? 100 / factors.length : 0;
    const items = factors.map((f) => ({ label: f.label, color: f.color, share: eq }));
    return { dominant: items[0] ?? { label: '-', color: '#94a3b8', share: 0 }, items };
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
    const tRet = calcChange(curr.value, prev.value);
    if (tRet === null || !Number.isFinite(tRet)) continue;
    const factorRets: number[] = [];
    let valid = true;
    for (const factor of factorMaps) {
      const currV = factor.byDate.get(curr.date);
      const prevV = factor.byDate.get(prev.date);
      const fRet = calcChange(currV ?? null, prevV ?? null);
      if (fRet === null || !Number.isFinite(fRet)) {
        valid = false;
        break;
      }
      factorRets.push(fRet);
    }
    if (valid) samples.push({ target: tRet, factors: factorRets });
  }

  if (samples.length < 2) {
    const eq = 100 / factors.length;
    const items = factors.map((f) => ({ label: f.label, color: f.color, share: eq }));
    return { dominant: items[0], items };
  }

  const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const betas = factorMaps.map((_, idx) => {
    const xs = samples.map((s) => s.factors[idx]);
    const ys = samples.map((s) => s.target);
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

  const last = target[target.length - 1];
  const prev = target[target.length - 2];
  const latestFactorChanges = factorMaps.map((factor) => {
    const currV = factor.byDate.get(last.date);
    const prevV = factor.byDate.get(prev.date);
    return calcChange(currV ?? null, prevV ?? null) ?? 0;
  });
  const raws = latestFactorChanges.map((chg, idx) => betas[idx] * chg);
  const absSum = raws.reduce((s, v) => s + Math.abs(v), 0);
  const fallback = 100 / factors.length;
  const base = factorMaps.map((factor, idx) => ({
    label: factor.label,
    color: factor.color,
    share: absSum > 0 ? (Math.abs(raws[idx]) / absSum) * 100 : fallback,
  }));
  const rounded = base.map((row) => Number(row.share.toFixed(1)));
  const diff = Number((100 - rounded.reduce((sum, v) => sum + v, 0)).toFixed(1));
  if (rounded.length) rounded[rounded.length - 1] = Number((rounded[rounded.length - 1] + diff).toFixed(1));
  const items = base.map((row, idx) => ({ ...row, share: rounded[idx] ?? 0 }));
  const dominant = items.slice().sort((a, b) => b.share - a.share)[0] ?? { label: '-', color: '#94a3b8', share: 0 };
  return { dominant, items };
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

function buildSmoothPathWithNull(points: Array<{ x: number; y: number | null }>): string {
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
  for (const p of points) {
    if (p.y === null) {
      if (current.length) segments.push(current);
      current = [];
      continue;
    }
    current.push({ x: p.x, y: p.y });
  }
  if (current.length) segments.push(current);
  return segments.map((seg) => buildSmoothPath(seg)).join(' ');
}

function toMonthIndex(dateText: string): number | null {
  const m = /^(\d{4})-(\d{2})/.exec(dateText || '');
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return year * 12 + month;
}

function filterByPeriodMonths(rows: SupplyTrendRow[], months: number): SupplyTrendRow[] {
  if (!rows.length) return [];
  const latestIdx = toMonthIndex(rows.at(-1)?.date || '');
  if (latestIdx === null) return rows.slice(-Math.min(rows.length, months));
  const cutoff = latestIdx - Math.max(1, months) + 1;
  const filtered = rows.filter((row) => {
    const idx = toMonthIndex(row.date);
    return idx !== null && idx >= cutoff;
  });
  return filtered.length ? filtered : rows.slice(-Math.min(rows.length, Math.max(months, 2)));
}

function SupplyTrendChart({ rows }: { rows: SupplyTrendRow[] }) {
  const [span, setSpan] = useState<SupplySpanKey>('1y');
  const spanMonths = SUPPLY_SPANS.find((item) => item.key === span)?.months ?? 12;
  const spanRows = useMemo(() => filterByPeriodMonths(rows, spanMonths), [rows, spanMonths]);
  const safeRows =
    spanRows.length >= 2
      ? spanRows
      : rows.length >= 2
        ? rows.slice(-2)
        : [{ date: '-', chile: 0, peru: 0 }, { date: '-', chile: 0, peru: 0 }];
  const [activeIndex, setActiveIndex] = useState(safeRows.length - 1);

  useEffect(() => {
    setActiveIndex(safeRows.length - 1);
  }, [safeRows.length, span]);

  const shape = useMemo(() => {
    const allVals = safeRows.flatMap((row) => [row.chile, row.peru]).filter((v): v is number => v !== null && Number.isFinite(v));
    const min = allVals.length ? Math.min(...allVals) : 0;
    const max = allVals.length ? Math.max(...allVals) : 1;
    const range = max - min || 1;
    const innerW = CHART_W - PAD_X * 2;
    const innerH = CHART_H - PAD_Y * 2;
    const baseY = CHART_H - PAD_Y;
    const xAt = (i: number) => PAD_X + (innerW * i) / Math.max(safeRows.length - 1, 1);
    const yAt = (value: number | null) =>
      value === null || !Number.isFinite(value) ? null : PAD_Y + innerH - ((value - min) / range) * innerH;

    const points = safeRows.map((row, i) => ({
      ...row,
      x: xAt(i),
      chileY: yAt(row.chile),
      peruY: yAt(row.peru),
    }));

    const chilePath = buildSmoothPathWithNull(points.map((p) => ({ x: p.x, y: p.chileY })));
    const peruPath = buildSmoothPathWithNull(points.map((p) => ({ x: p.x, y: p.peruY })));

    const chileValid = points.filter((p) => p.chileY !== null);
    const areaPath =
      chilePath && chileValid.length >= 2
        ? `${chilePath} L ${chileValid[chileValid.length - 1].x.toFixed(2)} ${baseY.toFixed(2)} L ${chileValid[0].x.toFixed(2)} ${baseY.toFixed(2)} Z`
        : '';

    const first = points[0];
    const last = points[points.length - 1];

    return {
      points,
      chilePath,
      peruPath,
      areaPath,
      xStart: first?.date || '-',
      xMid: points[Math.floor((points.length - 1) * 0.5)]?.date || first?.date || '-',
      xEnd: last?.date || '-',
    };
  }, [safeRows]);

  const clampedIndex = Math.max(0, Math.min(activeIndex, shape.points.length - 1));
  const active = shape.points[clampedIndex];

  const handleMove = (clientX: number, left: number, width: number) => {
    if (!shape.points.length || width <= 0) return;
    const x = ((clientX - left) / width) * CHART_W;
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
        <h4 className="shrink-0 text-[14px] font-black text-cool-grey uppercase tracking-[0.2em] sm:tracking-[0.3em]">生産トレンド</h4>
        <div className="ml-auto">
          <div className="inline-flex rounded-lg border border-white/10 overflow-hidden">
            {SUPPLY_SPANS.map((item) => (
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
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHILE_COLOR }} />
          チリ鉱山生産 <span style={{ color: CHILE_COLOR }}>{fmtNum(active?.chile ?? null, 1)} kt</span>
        </span>
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PERU_COLOR }} />
          ペルー鉱山生産 <span style={{ color: PERU_COLOR }}>{fmtNum(active?.peru ?? null, 1)} kt</span>
        </span>
      </div>
      <div className="h-[320px] sm:h-[420px] w-full chart-grid rounded-xl border border-white/5 relative">
        <svg
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
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
            <linearGradient id="supplyTrendAreaGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={CHILE_COLOR} stopOpacity="0.22" />
              <stop offset="100%" stopColor={CHILE_COLOR} stopOpacity="0" />
            </linearGradient>
          </defs>
          {shape.areaPath ? <path d={shape.areaPath} fill="url(#supplyTrendAreaGradient)" /> : null}
          <path d={shape.chilePath} fill="none" stroke={CHILE_COLOR} strokeLinecap="round" strokeWidth="3" />
          <path d={shape.peruPath} fill="none" stroke={PERU_COLOR} strokeLinecap="round" strokeWidth="2.4" />
          {active ? <line x1={active.x} x2={active.x} y1="12" y2="388" stroke="rgba(53,92,125,0.28)" strokeDasharray="4 3" strokeWidth="1" /> : null}
          {active?.chileY !== null ? <circle cx={active.x} cy={active.chileY} r="4.6" fill={CHILE_COLOR} /> : null}
          {active?.peruY !== null ? <circle cx={active.x} cy={active.peruY} r="4.3" fill={PERU_COLOR} /> : null}
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

export default function SupplyNativeBoard({ data }: { data: SupplyRows }) {
  const [activeSheetHelp, setActiveSheetHelp] = useState<SheetHelpKey>('supply');
  const [contributionTab, setContributionTab] = useState<SupplyContributionTabKey>('tatene');
  const chile = latestPair(data.chile);
  // Chile is already in thousand-TMF (kt), Peru source is TMF (t): normalize Peru to kt.
  const peruKtSeries = useMemo(
    () => data.peru.map((row) => ({ ...row, value: row.value / 1000 })),
    [data.peru]
  );
  const peru = latestPair(peruKtSeries);
  const inv = latestPair(data.jpInv);
  const chileChg = calcChange(chile.latest?.value ?? null, chile.prev?.value ?? null);
  const peruChg = calcChange(peru.latest?.value ?? null, peru.prev?.value ?? null);
  const invChg = calcChange(inv.latest?.value ?? null, inv.prev?.value ?? null);
  const endDate = chile.latest?.date || peru.latest?.date || inv.latest?.date || '-';

  const trendRows = useMemo(() => {
    const months = new Set<string>();
    const chileByMonth = new Map<string, number>();
    for (const row of data.chile) {
      const ym = monthKey(row.date);
      months.add(ym);
      chileByMonth.set(ym, row.value);
    }
    const peruByMonth = new Map<string, number>();
    for (const row of peruKtSeries) {
      const ym = monthKey(row.date);
      months.add(ym);
      peruByMonth.set(ym, row.value);
    }
    return [...months]
      .sort((a, b) => a.localeCompare(b))
      .map((ym) => ({
        date: ym,
        chile: chileByMonth.get(ym) ?? null,
        peru: peruByMonth.get(ym) ?? null,
      }));
  }, [data.chile, peruKtSeries]);

  const monthlyRows = useMemo(() => {
    const impMap = toMonthMap(data.hs7404Imp);
    const expMap = toMonthMap(data.hs7404Exp);
    const prodMap = toMonthMap(data.jpProd);
    const salesMap = toMonthMap(data.jpSales);
    const invMap = toMonthMap(data.jpInv);
    const months = new Set<string>();
    [data.hs7404Imp, data.hs7404Exp, data.jpProd, data.jpSales, data.jpInv].forEach((arr) => arr.forEach((r) => months.add(monthKey(r.date))));
    return [...months]
      .sort((a, b) => a.localeCompare(b))
      .map((ym) => {
        const imp = impMap.get(ym) ?? 0;
        const exp = expMap.get(ym) ?? 0;
        const retention = imp - exp;
        const prod = prodMap.get(ym) ?? null;
        const sales = salesMap.get(ym) ?? null;
        const inventory = invMap.get(ym) ?? null;
        const gap = prod !== null && sales !== null ? prod - sales : null;
        const dependency = prod !== null && prod !== 0 ? Math.max(0, Math.min(100, ((prod - imp) / prod) * 100)) : null;
        return { ym, imp, exp, retention, prod, sales, inventory, gap, dependency };
      })
      .slice(-24);
  }, [data]);

  const relMetrics = useMemo(() => {
    const months = monthlyRows.map((r) => r.ym);
    const tateneMap = toMonthMap(data.tatene);
    const chileMap = toMonthMap(data.chile);
    const tatene = idxRows(withCarryForward(months.map((ym) => ({ date: ym, value: tateneMap.get(ym) ?? null }))));
    const chile = idxRows(withCarryForward(months.map((ym) => ({ date: ym, value: chileMap.get(ym) ?? null }))));
    const demand = idxRows(withCarryForward(months.map((ym, idx) => ({ date: ym, value: monthlyRows[idx]?.sales ?? null }))));
    const scrap = idxRows(withCarryForward(months.map((ym, idx) => ({ date: ym, value: monthlyRows[idx]?.retention ?? null }))));
    return { tatene, chile, demand, scrap };
  }, [monthlyRows, data.tatene, data.chile]);
  const contributionItems = useMemo(() => {
    const months = monthlyRows.map((r) => r.ym);
    const tateneMap = toMonthMap(data.tatene);
    const lmeMap = toMonthMap(data.lme);
    const fxMap = toMonthMap(data.usdjpy);
    const chileMap = toMonthMap(data.chile);
    const tatene = withCarryForward(months.map((ym) => ({ date: ym, value: tateneMap.get(ym) ?? null })));
    const premium = withCarryForward(
      months.map((ym) => {
        const t = tateneMap.get(ym);
        const l = lmeMap.get(ym);
        const fx = fxMap.get(ym);
        return { date: ym, value: t !== undefined && l !== undefined && fx !== undefined ? t - l * fx : null };
      })
    );
    const chile = withCarryForward(months.map((ym) => ({ date: ym, value: chileMap.get(ym) ?? null })));
    const demand = withCarryForward(months.map((ym, idx) => ({ date: ym, value: monthlyRows[idx]?.sales ?? null })));
    const scrap = withCarryForward(months.map((ym, idx) => ({ date: ym, value: monthlyRows[idx]?.retention ?? null })));
    const factorDefs = [
      { label: 'チリ鉱山', color: REL_CHILE_COLOR, rows: chile },
      { label: '国内需要量', color: REL_DEMAND_COLOR, rows: demand },
      { label: 'スクラップ保持力', color: REL_SCRAP_COLOR, rows: scrap },
    ];
    const tateneSummary = computeContributionSummary(tatene, factorDefs, 12);
    const premiumSummary = computeContributionSummary(premium, factorDefs, 12);
    return { tatene: tateneSummary, premium: premiumSummary };
  }, [monthlyRows, data.tatene, data.lme, data.usdjpy, data.chile]);
  const activeContribution = contributionTab === 'tatene' ? contributionItems.tatene : contributionItems.premium;
  const dominantContrib = activeContribution.dominant ?? null;
  const ringR = 52;
  const ringLen = 2 * Math.PI * ringR;
  const ringOffset = ringLen * (1 - (dominantContrib?.share ?? 0) / 100);
  const activeSheetHelpItem = SHEET_HELP_ITEMS.find((item) => item.key === activeSheetHelp) ?? SHEET_HELP_ITEMS[0];
  const supplyTableViewportPx = 40 + 10 * 32;

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <MetricCard
          label="チリ鉱山生産"
          change={chileChg}
          value={fmtNum(chile.latest?.value ?? null, 1)}
          unit="kt"
          polyline={buildPolyline(data.chile.slice(-7).map((r) => r.value))}
          gaugeRangeValues={data.chile.slice(-31).map((r) => r.value)}
          gaugeCurrentChange={chileChg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={endDate}
        />
        <MetricCard
          label="ペルー鉱山生産"
          change={peruChg}
          value={fmtNum(peru.latest?.value ?? null, 1)}
          unit="kt"
          polyline={buildPolyline(peruKtSeries.slice(-7).map((r) => r.value))}
          gaugeRangeValues={peruKtSeries.slice(-31).map((r) => r.value)}
          gaugeCurrentChange={peruChg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={endDate}
        />
        <MetricCard
          label="世界需給バランス"
          change={calcChange(data.icsgBalance.at(-1)?.value ?? null, data.icsgBalance.at(-2)?.value ?? null)}
          value={fmtNum(data.icsgBalance.at(-1)?.value ?? null, 0)}
          unit="kt"
          polyline={buildPolyline(data.icsgBalance.slice(-7).map((r) => r.value))}
          gaugeRangeValues={data.icsgBalance.slice(-31).map((r) => r.value)}
          gaugeCurrentChange={calcChange(data.icsgBalance.at(-1)?.value ?? null, data.icsgBalance.at(-2)?.value ?? null)}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={endDate}
        />
        <MetricCard
          label="国内在庫"
          labelNote="※精錬・電気銅在庫"
          change={invChg}
          value={fmtNum(inv.latest?.value ?? null, 0)}
          unit="t"
          polyline={buildPolyline(data.jpInv.slice(-7).map((r) => r.value))}
          gaugeRangeValues={data.jpInv.slice(-31).map((r) => r.value)}
          gaugeCurrentChange={invChg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={endDate}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <SupplyTrendChart rows={trendRows} />
        <SectionCard title="月次 供給・需要シートデータ（2年）">
            <div className="mb-3 rounded-lg border border-white/10 bg-[#f6f2eb]/70 p-0.5">
              <div className="flex flex-wrap gap-0.5">
                {SHEET_HELP_ITEMS.map((item) => {
                  const active = activeSheetHelp === item.key;
                  return (
                    <button
                      key={`sheet-help-${item.key}`}
                      type="button"
                      onClick={() => setActiveSheetHelp(item.key)}
                      className={`px-1 py-0.5 rounded-md text-[10px] font-black uppercase tracking-[0.11em] border transition-colors ${
                        active
                          ? 'bg-positive/20 text-positive border-positive/30'
                          : 'bg-white/70 text-cool-grey border-white/20 hover:text-off-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 rounded-md border border-white/10 bg-white/40 px-2.5 py-2">
                <p className="text-[10px] font-black text-cool-grey uppercase">{activeSheetHelpItem.label} の説明</p>
                <p className="mt-0.5 text-[10px] text-cool-grey">{activeSheetHelpItem.formula}</p>
                {activeSheetHelpItem.proxy ? (
                  <p className="text-[9px] text-cool-grey">{activeSheetHelpItem.proxy}</p>
                ) : null}
              </div>
            </div>
            <div
              className="w-full overflow-y-scroll overflow-x-auto calm-scrollbar rounded-lg border border-white/10 bg-[#f3f1ed]/70"
              style={{ minHeight: `${supplyTableViewportPx}px`, maxHeight: `${supplyTableViewportPx}px`, height: `${supplyTableViewportPx}px` }}
            >
              <div className="min-w-[560px]">
              <table className="w-full table-auto text-sm">
                <colgroup>
                  <col className="w-[76px]" />
                  <col className="w-[86px]" />
                  <col className="w-[86px]" />
                  <col className="w-[90px]" />
                  <col className="w-[96px]" />
                  <col className="w-[110px]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-[#ece7df]/95 backdrop-blur-sm border-b border-[#ddd5ca]">
                  <tr>
                    <th className="text-left px-1 py-1 text-[12px] font-black uppercase tracking-[0.12em] text-cool-grey whitespace-nowrap">月</th>
                    <th className="text-right px-1 py-1 text-[12px] font-black uppercase tracking-[0.12em] text-cool-grey whitespace-nowrap">供給量</th>
                    <th className="text-right px-1 py-1 text-[12px] font-black uppercase tracking-[0.12em] text-cool-grey whitespace-nowrap">需要量</th>
                    <th className="text-right px-1 py-1 text-[12px] font-black uppercase tracking-[0.12em] text-cool-grey whitespace-nowrap">当月過不足</th>
                    <th className="text-right px-1 py-1 text-[12px] font-black uppercase tracking-[0.12em] text-cool-grey whitespace-nowrap">スクラップ保持力</th>
                    <th className="text-right px-1 py-1 text-[12px] font-black uppercase tracking-[0.12em] text-cool-grey whitespace-nowrap">海外依存度</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyRows.slice().reverse().map((row) => (
                    <tr key={`supply-month-${row.ym}`} className="h-8 border-t border-[#e5dfd5]">
                      <td className="px-0.5 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-cool-grey whitespace-nowrap">{row.ym}</td>
                      <td className="px-0.5 py-2 text-right text-[13px] leading-tight font-mono tabular-nums text-off-white whitespace-nowrap">{fmtNum(row.prod ?? null, 0)}</td>
                      <td className="px-0.5 py-2 text-right text-[13px] leading-tight font-mono tabular-nums text-off-white whitespace-nowrap">{fmtNum(row.sales ?? null, 0)}</td>
                      <td className={`px-0.5 py-2 text-right text-[13px] leading-tight font-mono tabular-nums whitespace-nowrap ${row.gap === null ? 'text-cool-grey' : row.gap >= 0 ? 'text-[#2f6d5a]' : 'text-[#b86d53]'}`}>{fmtNum(row.gap ?? null, 0)}</td>
                      <td className={`px-0.5 py-2 text-right text-[13px] leading-tight font-mono tabular-nums whitespace-nowrap ${row.retention >= 0 ? 'text-[#2f6d5a]' : 'text-[#b86d53]'}`}>{fmtNum(row.retention, 0)}</td>
                      <td className="px-0.5 py-2 text-right text-[13px] leading-tight font-mono tabular-nums text-cool-grey whitespace-nowrap">{row.dependency === null ? '-' : `${row.dependency.toFixed(1)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 items-stretch">
        <SectionCard
          title="相対変化"
          className="h-full col-span-2 lg:col-span-1"
          right={
            <div className="flex flex-wrap items-center justify-end gap-4 text-[10px] font-black uppercase tracking-[0.14em] text-cool-grey text-right">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: REL_TATENE_COLOR }} />
                国内建値
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: REL_CHILE_COLOR }} />
                チリ鉱山
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: REL_DEMAND_COLOR }} />
                需要量
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: REL_SCRAP_COLOR }} />
                スクラップ保持力
              </span>
            </div>
          }
        >
          <LinePlot
            lines={[
              { values: relMetrics.tatene.map((r) => r.value), color: REL_TATENE_COLOR },
              { values: relMetrics.chile.map((r) => r.value), color: REL_CHILE_COLOR },
              { values: relMetrics.demand.map((r) => r.value), color: REL_DEMAND_COLOR },
              { values: relMetrics.scrap.map((r) => r.value), color: REL_SCRAP_COLOR },
            ]}
            xLabels={[
              relMetrics.tatene.at(0)?.date || '-',
              relMetrics.tatene.at(Math.floor(relMetrics.tatene.length / 2))?.date || '-',
              relMetrics.tatene.at(-1)?.date || '-',
            ]}
            referenceValue={100}
            scaleMode="centered_reference"
            height={220}
            overlayNote="※ 先頭データを100として指数化（期間:1年間）"
          />
        </SectionCard>

        <SectionCard
          title="寄与率"
          className="h-full col-span-1"
          right={(
            <div className="inline-flex rounded-lg border border-white/10 overflow-hidden">
              <button
                type="button"
                className={`px-2.5 py-1.5 text-[11px] font-bold whitespace-nowrap ${contributionTab === 'tatene' ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`}
                onClick={() => setContributionTab('tatene')}
              >
                国内建値
              </button>
              <button
                type="button"
                className={`px-2.5 py-1.5 text-[11px] font-bold whitespace-nowrap ${contributionTab === 'premium' ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`}
                onClick={() => setContributionTab('premium')}
              >
                諸コスト
              </button>
            </div>
          )}
        >
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
                  stroke={REL_TATENE_COLOR}
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
                <p className="text-xs font-bold tracking-widest" style={{ color: REL_TATENE_COLOR }}>
                  {dominantContrib?.label || '-'}
                </p>
              </div>
            </div>
            <div className="mt-4 w-full space-y-1.5 text-sm">
              {activeContribution.items.map((item) => (
                <p key={`supply-contrib-${item.label}`} className="flex justify-between text-cool-grey">
                  <span>{item.label}</span>
                  <span style={{ color: item.color }}>{item.share.toFixed(1)}%</span>
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
            参照元:{' '}
            <a className="hover:text-off-white underline underline-offset-2" href="https://www.lme.com/" target="_blank" rel="noreferrer">
              LME
            </a>
            {' / '}
            <a className="hover:text-off-white underline underline-offset-2" href="https://www.icsg.org/" target="_blank" rel="noreferrer">
              ICSG
            </a>
            {' / '}
            <a className="hover:text-off-white underline underline-offset-2" href="https://www.cochilco.cl/" target="_blank" rel="noreferrer">
              COCHILCO
            </a>
            {' / '}
            <a className="hover:text-off-white underline underline-offset-2" href="https://www.gob.pe/minem" target="_blank" rel="noreferrer">
              MINEM
            </a>
            {' / '}
            <a className="hover:text-off-white underline underline-offset-2" href="https://www.meti.go.jp/" target="_blank" rel="noreferrer">
              METI
            </a>
            {' / '}
            <a className="hover:text-off-white underline underline-offset-2" href="https://www.customs.go.jp/toukei/info/" target="_blank" rel="noreferrer">
              税関貿易統計
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
