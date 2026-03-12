import { normalizeSeries, readMergedPublishSeriesBundle } from '@/lib/publish_series_bundle';

type SeriesPoint = { date: string; value: number };

function valueRowAtOrBefore(rows: SeriesPoint[], date: string): SeriesPoint | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].date <= date) return rows[i];
  }
  return null;
}

function valueRowBefore(rows: SeriesPoint[], date: string): SeriesPoint | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].date < date) return rows[i];
  }
  return null;
}

function latestMonthlyAverage(rows: SeriesPoint[]): { month: string; avg: number; samples: number } | null {
  if (!rows.length) return null;
  const buckets = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    if (!row.date || !Number.isFinite(row.value)) continue;
    const month = row.date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const bucket = buckets.get(month) ?? { sum: 0, count: 0 };
    bucket.sum += row.value;
    bucket.count += 1;
    buckets.set(month, bucket);
  }
  if (!buckets.size) return null;
  const latestMonth = Array.from(buckets.keys()).sort((a, b) => a.localeCompare(b)).at(-1) || '';
  if (!latestMonth) return null;
  const latest = buckets.get(latestMonth);
  if (!latest || latest.count <= 0) return null;
  return { month: latestMonth, avg: latest.sum / latest.count, samples: latest.count };
}

export type CopperImpactSnapshot = {
  latestTatene: { date: string; valueJpyMt: number } | null;
  prevTatene: { date: string; valueJpyMt: number } | null;
  baseline: {
    date: string;
    lme: { date: string; valueUsdMt: number } | null;
    lmePrev: { date: string; valueUsdMt: number } | null;
    usdJpy: { date: string; value: number } | null;
    usdJpyPrev: { date: string; value: number } | null;
  } | null;
  impactsJpyMt: {
    lmeMarket: number | null;
    usdJpy: number | null;
    otherCost: number | null;
  };
  latestMonthlyAverage: {
    tateneJpyMt: { month: string; avg: number; samples: number } | null;
    lmeUsdMt: { month: string; avg: number; samples: number } | null;
  };
  formulas: {
    lmeMarket: string;
    usdJpy: string;
    otherCost: string;
    tateneMonthlyAvg: string;
    lmeMonthlyAvg: string;
  };
};

export async function computeCopperImpactSnapshot(): Promise<CopperImpactSnapshot> {
  const merged = await readMergedPublishSeriesBundle();
  const series = merged?.series || {};
  const tateneRows = normalizeSeries(series.japan_tatene_jpy_t);
  const lmeRows = normalizeSeries(series.lme_copper_cash_usd_t);
  const usdJpyRows = normalizeSeries(series.america_dexjpus);

  const latestTatene = tateneRows.length ? tateneRows[tateneRows.length - 1] : null;
  const prevTatene = tateneRows.length >= 2 ? tateneRows[tateneRows.length - 2] : null;
  const baselineDate = latestTatene?.date || '';

  const lmeD = baselineDate ? valueRowAtOrBefore(lmeRows, baselineDate) : null;
  const lmeDm1 = baselineDate ? valueRowBefore(lmeRows, baselineDate) : null;
  const fxD = baselineDate ? valueRowAtOrBefore(usdJpyRows, baselineDate) : null;
  const fxDm1 = baselineDate ? valueRowBefore(usdJpyRows, baselineDate) : null;

  const lmeMarketImpact =
    lmeD && lmeDm1 && fxDm1
      ? (lmeD.value - lmeDm1.value) * fxDm1.value
      : null;
  const usdJpyImpact =
    lmeD && fxD && fxDm1
      ? lmeD.value * (fxD.value - fxDm1.value)
      : null;
  const otherCostImpact =
    latestTatene && prevTatene && lmeD && lmeDm1 && fxD && fxDm1
      ? (latestTatene.value - lmeD.value * fxD.value) -
        (prevTatene.value - lmeDm1.value * fxDm1.value)
      : null;

  return {
    latestTatene: latestTatene ? { date: latestTatene.date, valueJpyMt: latestTatene.value } : null,
    prevTatene: prevTatene ? { date: prevTatene.date, valueJpyMt: prevTatene.value } : null,
    baseline: baselineDate
      ? {
          date: baselineDate,
          lme: lmeD ? { date: lmeD.date, valueUsdMt: lmeD.value } : null,
          lmePrev: lmeDm1 ? { date: lmeDm1.date, valueUsdMt: lmeDm1.value } : null,
          usdJpy: fxD ? { date: fxD.date, value: fxD.value } : null,
          usdJpyPrev: fxDm1 ? { date: fxDm1.date, value: fxDm1.value } : null,
        }
      : null,
    impactsJpyMt: {
      lmeMarket: lmeMarketImpact,
      usdJpy: usdJpyImpact,
      otherCost: otherCostImpact,
    },
    latestMonthlyAverage: {
      tateneJpyMt: latestMonthlyAverage(tateneRows),
      lmeUsdMt: latestMonthlyAverage(lmeRows),
    },
    formulas: {
      lmeMarket: '(基準日LME - 基準日前日LME) × 基準日前日USD/JPY',
      usdJpy: '基準日LME × (基準日USD/JPY - 基準日前日USD/JPY)',
      otherCost:
        '(最新建値 - 基準日LME×基準日USD/JPY) - (前回建値 - 基準日前日LME×基準日前日USD/JPY)',
      tateneMonthlyAvg: '最新月の平均建値 = 最新月の建値日次値の平均',
      lmeMonthlyAvg: '最新月の平均LME = 最新月のLME日次値の平均',
    },
  };
}
