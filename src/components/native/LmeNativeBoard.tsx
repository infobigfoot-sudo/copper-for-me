'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { LinePlot, MetricCard, SectionCard, buildPolyline, calcChange, fmtNum, latestPair } from '@/components/native/NativeWidgets';
import type { SeriesPoint } from '@/lib/selected_series_bundle';

type SpanKey = '1m' | '3m' | '6m' | '1y' | '3y';
type LmeDataTabKey = 'price' | 'futures' | 'stock';

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

function indexSeries(rows: SeriesPoint[]): SeriesPoint[] {
  const base = rows[0]?.value ?? 1;
  return rows.map((r) => ({ ...r, value: (r.value / base) * 100 }));
}

type LmeTrendPlotProps = {
  priceRows: SeriesPoint[];
  futuresRows: SeriesPoint[];
  stockRows: SeriesPoint[];
  xLabels: [string, string, string];
};

type Scale = { min: number; range: number };

const PLOT_W = 800;
const PLOT_H = 320;
const PLOT_PAD_X = 12;
const PLOT_TOP = 18;
const PLOT_BOTTOM = PLOT_H - 18;
const LME_PRICE_COLOR = '#355c7d';
const LME_FUTURES_COLOR = '#7aa6c2';
const LME_STOCK_COLOR = '#8f9fb3';

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

function LmeTrendPlot({ priceRows, futuresRows, stockRows, xLabels }: LmeTrendPlotProps) {
  const priceColor = LME_PRICE_COLOR;
  const futuresColor = LME_FUTURES_COLOR;
  const stockColor = LME_STOCK_COLOR;
  const baseRows = priceRows.length >= 2 ? priceRows : [{ date: '-', value: 0 }, { date: '-', value: 0 }];
  const [activeIndex, setActiveIndex] = useState(baseRows.length - 1);

  useEffect(() => {
    setActiveIndex(baseRows.length - 1);
  }, [baseRows.length]);

  const shape = useMemo(() => {
    const plotW = PLOT_W - PLOT_PAD_X * 2;
    const xAt = (i: number) => PLOT_PAD_X + (plotW * i) / Math.max(baseRows.length - 1, 1);
    const futuresVals = alignSeriesByDate(baseRows, futuresRows);
    const stockVals = alignSeriesByDate(baseRows, stockRows);
    const priceScale = scaleOf(baseRows.map((r) => r.value));
    const futuresScale = scaleOf(futuresVals);
    const stockScale = scaleOf(stockVals);
    const yAt = (value: number | null, scale: Scale) => {
      if (value === null || !Number.isFinite(value)) return PLOT_BOTTOM;
      return PLOT_BOTTOM - ((value - scale.min) / scale.range) * (PLOT_BOTTOM - PLOT_TOP);
    };
    const pricePoints = baseRows.map((r, i) => ({ x: xAt(i), y: yAt(r.value, priceScale) }));
    const futuresPoints = futuresVals.map((v, i) => ({ x: xAt(i), y: yAt(v, futuresScale) }));
    const stockBars = stockVals.map((v, i) => ({
      x: xAt(i),
      y: yAt(v, stockScale),
      v,
    }));
    const toPolyline = (pts: Array<{ x: number; y: number }>) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    return {
      pricePoints,
      futuresPoints,
      stockBars,
      pricePath: toPolyline(pricePoints),
      futuresPath: toPolyline(futuresPoints),
      active: {
        date: baseRows.at(Math.max(0, Math.min(activeIndex, baseRows.length - 1)))?.date || '-',
        price: baseRows.at(Math.max(0, Math.min(activeIndex, baseRows.length - 1)))?.value ?? null,
        futures: futuresVals.at(Math.max(0, Math.min(activeIndex, futuresVals.length - 1))) ?? null,
        stock: stockVals.at(Math.max(0, Math.min(activeIndex, stockVals.length - 1))) ?? null,
      },
    };
  }, [activeIndex, baseRows, futuresRows, stockRows]);

  const clampedIndex = Math.max(0, Math.min(activeIndex, baseRows.length - 1));
  const activeX = shape.pricePoints[clampedIndex]?.x ?? PLOT_PAD_X;
  const barWidth = Math.max(4, Math.min(11, ((PLOT_W - PLOT_PAD_X * 2) / Math.max(baseRows.length, 8)) * 0.42));

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
          LME価格 <span style={{ color: priceColor }}>{fmtNum(shape.active.price, 0)}</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: futuresColor }} />
          3ヶ月先物 <span style={{ color: futuresColor }}>{fmtNum(shape.active.futures, 0)}</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stockColor }} />
          在庫 <span className="text-[#6f8196]">{fmtNum(shape.active.stock, 0)}</span>
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

          {shape.stockBars.map((bar, i) =>
            bar.v !== null ? (
              <rect
                key={`stock-bar-${i}`}
                x={(bar.x - barWidth / 2).toFixed(2)}
                y={Math.min(bar.y, PLOT_BOTTOM).toFixed(2)}
                width={barWidth.toFixed(2)}
                height={Math.max(1, Math.abs(PLOT_BOTTOM - bar.y)).toFixed(2)}
                fill={stockColor}
                fillOpacity="0.26"
                rx="1.4"
              />
            ) : null
          )}

          <polyline points={shape.pricePath} fill="none" stroke={priceColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={shape.futuresPath} fill="none" stroke={futuresColor} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />

          {shape.pricePoints.map((p, i) => (
            <circle key={`price-dot-${i}`} cx={p.x.toFixed(2)} cy={p.y.toFixed(2)} r="1.7" fill={priceColor} fillOpacity="0.55" />
          ))}
          {shape.futuresPoints.map((p, i) => (
            <circle key={`futures-dot-${i}`} cx={p.x.toFixed(2)} cy={p.y.toFixed(2)} r="1.55" fill={futuresColor} fillOpacity="0.52" />
          ))}

          <line x1={activeX.toFixed(2)} y1={PLOT_TOP.toFixed(2)} x2={activeX.toFixed(2)} y2={PLOT_BOTTOM.toFixed(2)} stroke="rgba(53,92,125,0.25)" strokeDasharray="4 3" />
          <circle cx={(shape.pricePoints[clampedIndex]?.x || 0).toFixed(2)} cy={(shape.pricePoints[clampedIndex]?.y || 0).toFixed(2)} r="4.2" fill={priceColor} />
          <circle cx={(shape.futuresPoints[clampedIndex]?.x || 0).toFixed(2)} cy={(shape.futuresPoints[clampedIndex]?.y || 0).toFixed(2)} r="3.6" fill={futuresColor} />
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
  stockSeries,
  futures3mSeries,
  offWarrantSeries,
  usdJpySeries,
  calculatorHref,
}: {
  priceSeries: SeriesPoint[];
  stockSeries: SeriesPoint[];
  futures3mSeries: SeriesPoint[];
  offWarrantSeries: SeriesPoint[];
  usdJpySeries: SeriesPoint[];
  calculatorHref: string;
}) {
  const [span, setSpan] = useState<SpanKey>('3m');
  const [dataTab, setDataTab] = useState<LmeDataTabKey>('price');

  const p = latestPair(priceSeries);
  const f = latestPair(futures3mSeries);
  const s = latestPair(stockSeries);
  const off = latestPair(offWarrantSeries);
  const pChg = calcChange(p.latest?.value ?? null, p.prev?.value ?? null);
  const fChg = calcChange(f.latest?.value ?? null, f.prev?.value ?? null);
  const sChg = calcChange(s.latest?.value ?? null, s.prev?.value ?? null);
  const offChg = calcChange(off.latest?.value ?? null, off.prev?.value ?? null);
  const endDate = p.latest?.date || s.latest?.date || '-';

  const spanDays = SPANS.find((x) => x.key === span)?.days ?? 93;
  const priceSpan = useMemo(() => filterByPeriodDays(priceSeries, spanDays), [priceSeries, spanDays]);
  const futuresSpan = useMemo(() => filterByPeriodDays(futures3mSeries, spanDays), [futures3mSeries, spanDays]);
  const stockSpan = useMemo(() => filterByPeriodDays(stockSeries, spanDays), [stockSeries, spanDays]);
  const axisStart = priceSpan.at(0)?.date || '-';
  const axisMid = priceSpan.at(Math.floor(priceSpan.length / 2))?.date || '-';
  const axisEnd = priceSpan.at(-1)?.date || '-';

  const oneYearPriceRows = useMemo(() => filterByPeriodDays(priceSeries, 365).slice().reverse(), [priceSeries]);
  const oneYearFuturesRows = useMemo(() => filterByPeriodDays(futures3mSeries, 365).slice().reverse(), [futures3mSeries]);
  const oneYearStockRows = useMemo(() => filterByPeriodDays(stockSeries, 365).slice().reverse(), [stockSeries]);
  const visibleRows = 10;
  const tabTableViewportPx = 40 + visibleRows * 36;
  const warrantLatest = stockSeries.at(-1)?.value ?? 0;
  const offLatest = offWarrantSeries.at(-1)?.value ?? 0;
  const warrantRatio = warrantLatest + offLatest > 0 ? (warrantLatest / (warrantLatest + offLatest)) * 100 : 0;
  const offRatio = 100 - warrantRatio;
  const ringR = 52;
  const ringLen = 2 * Math.PI * ringR;
  const ringOffset = ringLen * (1 - warrantRatio / 100);
  const warrantRingColor = '#2f6d5a';

  const relPriceSpan = useMemo(() => filterByPeriodDays(priceSeries, 365), [priceSeries]);
  const relFuturesSpan = useMemo(() => filterByPeriodDays(futures3mSeries, 365), [futures3mSeries]);
  const relStockSpan = useMemo(() => filterByPeriodDays(stockSeries, 365), [stockSeries]);
  const relAxisStart = relPriceSpan.at(0)?.date || '-';
  const relAxisMid = relPriceSpan.at(Math.floor(relPriceSpan.length / 2))?.date || '-';
  const relAxisEnd = relPriceSpan.at(-1)?.date || '-';
  const relP = indexSeries(relPriceSpan);
  const relF = indexSeries(relFuturesSpan);
  const relS = indexSeries(relStockSpan);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <MetricCard
          label="LME銅価格"
          change={pChg}
          value={fmtNum(p.latest?.value ?? null, 0)}
          unit="USD/mt"
          polyline={buildPolyline(priceSeries.slice(-7).map((r) => r.value))}
          gaugeRangeValues={priceSeries.slice(-31).map((r) => r.value)}
          gaugeCurrentChange={pChg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={p.latest?.date || endDate}
        />
        <MetricCard
          label="LME3ヶ月先物"
          change={fChg}
          value={fmtNum(f.latest?.value ?? null, 0)}
          unit="USD/mt"
          polyline={buildPolyline(futures3mSeries.slice(-7).map((r) => r.value))}
          gaugeRangeValues={futures3mSeries.slice(-31).map((r) => r.value)}
          gaugeCurrentChange={fChg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={f.latest?.date || endDate}
        />
        <MetricCard
          label="LME在庫"
          change={sChg}
          value={fmtNum(s.latest?.value ?? null, 0)}
          unit="t"
          polyline={buildPolyline(stockSeries.slice(-7).map((r) => r.value))}
          gaugeRangeValues={stockSeries.slice(-31).map((r) => r.value)}
          gaugeCurrentChange={sChg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={s.latest?.date || endDate}
        />
        <MetricCard
          label="オフワラント"
          change={offChg}
          value={fmtNum(off.latest?.value ?? null, 0)}
          unit="t"
          polyline={buildPolyline(offWarrantSeries.slice(-7).map((r) => r.value))}
          gaugeRangeValues={offWarrantSeries.slice(-31).map((r) => r.value)}
          gaugeCurrentChange={offChg}
          chartMode="gauge"
          titleUnderBadge
          gaugeSize="large"
          titlePadRight={false}
          date={off.latest?.date || endDate}
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
            <LmeTrendPlot priceRows={priceSpan} futuresRows={futuresSpan} stockRows={stockSpan} xLabels={[axisStart, axisMid, axisEnd]} />
          </SectionCard>
        </div>
        <article className="glass-card rounded-3xl p-8">
          <div className="mb-4 flex flex-col gap-3">
            <h4 className="text-[14px] font-black text-cool-grey uppercase tracking-[0.2em] sm:tracking-[0.3em] whitespace-nowrap">
              1年データ
            </h4>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                className={`px-2 py-2 text-[9px] sm:text-[10px] leading-none font-bold text-center whitespace-nowrap rounded-md border ${dataTab === 'price' ? 'bg-positive/20 text-positive border-positive/30' : 'text-cool-grey hover:text-off-white border-white/10'}`}
                onClick={() => setDataTab('price')}
              >
                価格
              </button>
              <button
                type="button"
                className={`px-2 py-2 text-[9px] sm:text-[10px] leading-none font-bold text-center whitespace-nowrap rounded-md border ${dataTab === 'futures' ? 'bg-positive/20 text-positive border-positive/30' : 'text-cool-grey hover:text-off-white border-white/10'}`}
                onClick={() => setDataTab('futures')}
              >
                先物
              </button>
              <button
                type="button"
                className={`px-2 py-2 text-[9px] sm:text-[10px] leading-none font-bold text-center whitespace-nowrap rounded-md border ${dataTab === 'stock' ? 'bg-positive/20 text-positive border-positive/30' : 'text-cool-grey hover:text-off-white border-white/10'}`}
                onClick={() => setDataTab('stock')}
              >
                在庫
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
                    {dataTab === 'price' ? '価格' : dataTab === 'futures' ? '3ヶ月先物' : '在庫'}
                  </th>
                  <th className="text-right px-2.5 py-2 text-[12px] font-black uppercase tracking-[0.12em] text-cool-grey whitespace-nowrap">増減</th>
                </tr>
              </thead>
              <tbody>
                {(dataTab === 'price' ? oneYearPriceRows : dataTab === 'futures' ? oneYearFuturesRows : oneYearStockRows).map((row, idx, rows) => {
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

      <div className="grid grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 items-stretch">
        <SectionCard
          title="相対変化"
          className="h-full col-span-2 lg:col-span-1"
          right={
            <div className="flex flex-wrap items-center justify-end gap-4 text-[10px] font-black uppercase tracking-[0.14em] text-cool-grey text-right">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: LME_PRICE_COLOR }} />
                LME価格
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: LME_FUTURES_COLOR }} />
                3ヶ月先物
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: LME_STOCK_COLOR }} />
                在庫
              </span>
            </div>
          }
        >
          <LinePlot
            lines={[
              { values: relP.map((r) => r.value), color: LME_PRICE_COLOR },
              { values: relF.map((r) => r.value), color: LME_FUTURES_COLOR },
              { values: relS.map((r) => r.value), color: LME_STOCK_COLOR },
            ]}
            xLabels={[relAxisStart, relAxisMid, relAxisEnd]}
            referenceValue={100}
            scaleMode="centered_reference"
            height={220}
            overlayNote="※ 先頭データを100として指数化（期間:1年間）"
          />
        </SectionCard>
        <SectionCard title="Warrant比率" className="h-full col-span-1">
          <div className="flex flex-col items-center py-4">
            <div className="relative w-32 h-32 sm:w-44 sm:h-44">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
                <circle cx="70" cy="70" r={ringR} fill="transparent" stroke="rgba(255,255,255,0.12)" strokeWidth="14" />
                <circle cx="70" cy="70" r={ringR} fill="transparent" stroke={warrantRingColor} strokeWidth="14" strokeLinecap="round" strokeDasharray={ringLen.toFixed(1)} strokeDashoffset={ringOffset.toFixed(1)} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-3xl sm:text-4xl font-black text-off-white">{warrantRatio.toFixed(1)}%</p>
                <p className="text-xs font-bold text-positive tracking-widest">WARRANT</p>
              </div>
            </div>
            <p className="text-sm text-cool-grey mt-4">オフワラント: {offRatio.toFixed(1)}%</p>
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
            <a className="hover:text-off-white underline underline-offset-2" href="https://www.lme.com/" target="_blank" rel="noreferrer">
              LME
            </a>
          </div>
        </article>
      </div>
    </>
  );
}
