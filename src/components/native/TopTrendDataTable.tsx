'use client';

import { useEffect, useMemo, useState } from 'react';

type SeriesPoint = { date: string; value: number };
type TableTab = 'tatene_ma' | 'stack';
type ComponentRow = {
  lme: number | null;
  fx: number | null;
  cost: number | null;
  total: number | null;
};

const MA_WINDOW = 3;
const DATA_SPAN_DAYS = 365 * 3;
const DEFAULT_VISIBLE_ROWS = 15;
const MOBILE_VISIBLE_ROWS = 5;
const MOBILE_MEDIA_QUERY = '(max-width: 639px)';

function fmtNum(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return '-';
  return value.toLocaleString('ja-JP', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtPct(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

function fmtPctNoSign(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return '-';
  return `${value.toFixed(digits)}%`;
}

function signClass(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'text-cool-grey';
  return value >= 0 ? 'text-[#2f6d5a]' : 'text-[#b86d53]';
}

function deltaClass(delta: number | null): string {
  if (delta === null || !Number.isFinite(delta) || delta === 0) return 'text-cool-grey';
  return delta > 0 ? 'text-[#2f6d5a]' : 'text-[#b86d53]';
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
  const cutoff = latestMs - (Math.max(1, days) - 1) * 24 * 60 * 60 * 1000;
  const filtered = rows.filter((row) => {
    const ms = toUtcMs(row.date);
    return ms !== null && ms >= cutoff;
  });
  return filtered.length ? filtered : rows.slice(-Math.min(days, rows.length));
}

function alignSeriesByDate(axisDates: string[], rows: SeriesPoint[]): Array<number | null> {
  if (!axisDates.length) return [];
  if (!rows.length) return axisDates.map(() => null);
  let j = 0;
  return axisDates.map((date) => {
    while (j + 1 < rows.length && rows[j + 1].date <= date) j += 1;
    const curr = rows[j];
    return curr && curr.date <= date && Number.isFinite(curr.value) ? curr.value : null;
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

export default function TopTrendDataTable({
  tateneRows,
  lmeUsdRows,
  usdJpyRows,
}: {
  tateneRows: SeriesPoint[];
  lmeUsdRows: SeriesPoint[];
  usdJpyRows: SeriesPoint[];
}) {
  const [tab, setTab] = useState<TableTab>('tatene_ma');
  const [isMobile, setIsMobile] = useState<boolean>(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_MEDIA_QUERY).matches
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const onChange = () => setIsMobile(mediaQuery.matches);
    onChange();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', onChange);
      return () => mediaQuery.removeEventListener('change', onChange);
    }
    mediaQuery.addListener(onChange);
    return () => mediaQuery.removeListener(onChange);
  }, []);

  const tateneSpan = useMemo(() => filterByPeriodDays(tateneRows, DATA_SPAN_DAYS), [tateneRows]);
  const lmeUsdSpan = useMemo(() => filterByPeriodDays(lmeUsdRows, DATA_SPAN_DAYS), [lmeUsdRows]);
  const usdJpySpan = useMemo(() => filterByPeriodDays(usdJpyRows, DATA_SPAN_DAYS), [usdJpyRows]);

  const shape = useMemo(() => {
    const axisDatesFromTatene = tateneSpan.map((row) => row.date);
    const axisFallback = Array.from(
      new Set([...lmeUsdSpan.map((r) => r.date), ...usdJpySpan.map((r) => r.date)])
    ).sort((a, b) => a.localeCompare(b));
    const axisDates = axisDatesFromTatene.length ? axisDatesFromTatene : axisFallback;
    const tateneValues = alignSeriesByDate(axisDates, tateneSpan);
    const maValues = movingAverage(tateneValues, MA_WINDOW);
    const lmeUsdValues = alignSeriesByDate(axisDates, lmeUsdSpan);
    const usdJpyValues = alignSeriesByDate(axisDates, usdJpySpan);

    const fxBase = usdJpyValues
      .filter((v): v is number => v !== null && Number.isFinite(v))
      .reduce((minVal, v) => Math.min(minVal, v), Number.POSITIVE_INFINITY);

    const rawRows = axisDates.map((_, i) => {
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

    return {
      axisDates,
      tateneValues,
      maValues,
      componentRows,
    };
  }, [tateneRows, tateneSpan, lmeUsdSpan, usdJpySpan]);

  const rowsTatene = useMemo(
    () =>
      shape.axisDates
        .map((date, i) => {
          const tatene = shape.tateneValues[i];
          const prevTatene = i > 0 ? shape.tateneValues[i - 1] : null;
          const ma = shape.maValues[i];
          const devPct =
            tatene !== null && ma !== null && Number.isFinite(tatene) && Number.isFinite(ma) && ma !== 0
              ? ((tatene - ma) / Math.abs(ma)) * 100
              : null;
          const tateneDelta =
            tatene !== null && prevTatene !== null && Number.isFinite(tatene) && Number.isFinite(prevTatene)
              ? tatene - prevTatene
              : null;
          return {
            date: String(date).slice(0, 7),
            tatene,
            tateneDelta,
            devPct,
          };
        })
        .reverse(),
    [shape.axisDates, shape.tateneValues, shape.maValues]
  );

  const rowsStack = useMemo(
    () => {
      const raw = shape.axisDates.map((date, i) => {
        const row = shape.componentRows[i];
        const total = row?.total;
        const toPct = (v: number | null): number | null =>
          total !== null && v !== null && Number.isFinite(total) && Number.isFinite(v) && total !== 0
            ? (v / total) * 100
            : null;
        return {
          date: String(date).slice(0, 7),
          lmePct: toPct(row?.lme ?? null),
          fxPct: toPct(row?.fx ?? null),
          costPct: toPct(row?.cost ?? null),
        };
      });

      const withDelta = raw.map((row, i) => {
        const prev = i > 0 ? raw[i - 1] : null;
        return {
          ...row,
          lmeDelta:
            prev !== null &&
            row.lmePct !== null &&
            prev.lmePct !== null &&
            Number.isFinite(row.lmePct) &&
            Number.isFinite(prev.lmePct)
              ? row.lmePct - prev.lmePct
              : null,
          fxDelta:
            prev !== null &&
            row.fxPct !== null &&
            prev.fxPct !== null &&
            Number.isFinite(row.fxPct) &&
            Number.isFinite(prev.fxPct)
              ? row.fxPct - prev.fxPct
              : null,
          costDelta:
            prev !== null &&
            row.costPct !== null &&
            prev.costPct !== null &&
            Number.isFinite(row.costPct) &&
            Number.isFinite(prev.costPct)
              ? row.costPct - prev.costPct
              : null,
        };
      });

      return withDelta.reverse();
    },
    [shape.axisDates, shape.componentRows]
  );

  const visibleRows = isMobile ? MOBILE_VISIBLE_ROWS : DEFAULT_VISIBLE_ROWS;
  const tableViewportPx = 40 + visibleRows * 36;

  return (
    <div className="rounded-3xl p-6 sm:p-8 border border-[#e6dfd3] bg-[#f3f1ed]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h4 className="text-[14px] font-black text-cool-grey uppercase tracking-[0.2em] sm:tracking-[0.3em]">データ</h4>
        <div className="inline-flex rounded-lg border border-white/10 overflow-hidden">
          <button
            type="button"
            className={`px-3 py-1.5 text-xs font-bold ${tab === 'tatene_ma' ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`}
            onClick={() => setTab('tatene_ma')}
          >
            建値+30日MA
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-xs font-bold ${tab === 'stack' ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'}`}
            onClick={() => setTab('stack')}
          >
            構成比
          </button>
        </div>
      </div>

      <div className="w-full overflow-y-scroll overflow-x-hidden calm-scrollbar rounded-lg border border-white/10 bg-[#f3f1ed]/70" style={{ minHeight: `${tableViewportPx}px`, maxHeight: `${tableViewportPx}px`, height: `${tableViewportPx}px` }}>
        <table className="w-full min-w-0 table-fixed text-sm">
          {tab === 'tatene_ma' ? (
            <>
              <colgroup>
                <col className="w-[32%]" />
                <col className="w-[34%]" />
                <col className="w-[34%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-[#ece7df]/95 backdrop-blur-sm border-b border-[#ddd5ca]">
                <tr>
                  <th className="text-left px-1.5 sm:px-2.5 py-2 text-[10px] sm:text-[12px] font-black tracking-normal text-cool-grey whitespace-nowrap">日付</th>
                  <th className="text-right px-1.5 sm:px-2.5 py-2 text-[10px] sm:text-[12px] font-black tracking-normal text-cool-grey whitespace-nowrap">建値</th>
                  <th className="text-right px-1.5 sm:px-2.5 py-2 text-[10px] sm:text-[12px] font-black tracking-normal text-cool-grey whitespace-nowrap">乖離率</th>
                </tr>
              </thead>
              <tbody>
                {rowsTatene.map((row, idx) => (
                  <tr key={`top-trend-tatene-row-${row.date}-${idx}`} className="h-9 border-t border-[#e5dfd5]">
                    <td className="px-1.5 sm:px-2.5 py-2.5 text-[10px] sm:text-[12px] font-semibold tracking-normal text-cool-grey whitespace-nowrap tabular-nums">{row.date}</td>
                    <td className={`px-1.5 sm:px-2.5 py-2.5 text-right text-[11px] sm:text-[13px] font-semibold leading-tight whitespace-nowrap tabular-nums ${deltaClass(row.tateneDelta)}`}>{fmtNum(row.tatene, 0)}</td>
                    <td className={`px-1.5 sm:px-2.5 py-2.5 text-right text-[11px] sm:text-[13px] font-semibold leading-tight whitespace-nowrap tabular-nums ${signClass(row.devPct)}`}>
                      {fmtPct(row.devPct, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </>
          ) : (
            <>
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[24%]" />
                <col className="w-[24%]" />
                <col className="w-[24%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-[#ece7df]/95 backdrop-blur-sm border-b border-[#ddd5ca]">
                <tr>
                  <th className="text-left px-1.5 sm:px-2.5 py-2 text-[10px] sm:text-[12px] font-black tracking-normal text-cool-grey whitespace-nowrap">日付</th>
                  <th className="text-right px-1.5 sm:px-2.5 py-2 text-[10px] sm:text-[12px] font-black tracking-normal text-cool-grey whitespace-nowrap">LME</th>
                  <th className="text-right px-1.5 sm:px-2.5 py-2 text-[10px] sm:text-[12px] font-black tracking-normal text-cool-grey whitespace-nowrap">為替</th>
                  <th className="text-right px-1.5 sm:px-2.5 py-2 text-[10px] sm:text-[12px] font-black tracking-normal text-cool-grey whitespace-nowrap">諸コスト</th>
                </tr>
              </thead>
              <tbody>
                {rowsStack.map((row, idx) => (
                  <tr key={`top-trend-stack-row-${row.date}-${idx}`} className="h-9 border-t border-[#e5dfd5]">
                    <td className="px-1.5 sm:px-2.5 py-2.5 text-[10px] sm:text-[12px] font-semibold tracking-normal text-cool-grey whitespace-nowrap tabular-nums">{row.date}</td>
                    <td className={`px-1.5 sm:px-2.5 py-2.5 text-right text-[11px] sm:text-[13px] font-semibold leading-tight whitespace-nowrap tabular-nums ${deltaClass(row.lmeDelta)}`}>{fmtPctNoSign(row.lmePct, 1)}</td>
                    <td className={`px-1.5 sm:px-2.5 py-2.5 text-right text-[11px] sm:text-[13px] font-semibold leading-tight whitespace-nowrap tabular-nums ${deltaClass(row.fxDelta)}`}>{fmtPctNoSign(row.fxPct, 1)}</td>
                    <td className={`px-1.5 sm:px-2.5 py-2.5 text-right text-[11px] sm:text-[13px] font-semibold leading-tight whitespace-nowrap tabular-nums ${deltaClass(row.costDelta)}`}>{fmtPctNoSign(row.costPct, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </>
          )}
        </table>
      </div>
    </div>
  );
}
