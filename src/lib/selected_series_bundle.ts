import { normalizeSeries, readMergedPublishSeriesBundle } from '@/lib/publish_series_bundle';

export type SeriesPoint = {
  date: string;
  value: number;
};

type SelectedSeriesBundle = {
  series?: Record<string, Array<{ date?: string; value?: number | string }>>;
};

export async function readSelectedSeriesBundle(): Promise<SelectedSeriesBundle | null> {
  return readMergedPublishSeriesBundle();
}

export async function getLmeBoardSeries() {
  const bundle = await readSelectedSeriesBundle();
  const series = bundle?.series || {};
  const priceSeries = normalizeSeries(series.lme_copper_cash_usd_t);
  const stockSeries = normalizeSeries(series.lme_copper_stock_t);
  const futures3mSeries = normalizeSeries(series.lme_copper_3month_usd_t).map((row) => ({
    ...row,
    value: row.value > 200000 ? row.value / 100 : row.value,
  }));
  const offWarrantSeries = normalizeSeries(series.offwarrant_copper_monthly_t);
  const usdJpySeries = normalizeSeries(series.america_dexjpus);
  const tateneSeries = normalizeSeries(series.japan_tatene_jpy_t);
  return { priceSeries, stockSeries, futures3mSeries, offWarrantSeries, usdJpySeries, tateneSeries };
}

export async function getIndicatorsDashboardSeries() {
  const bundle = await readSelectedSeriesBundle();
  const series = bundle?.series || {};
  return {
    usdJpySeries: normalizeSeries(series.america_dexjpus),
    usdCnySeries: normalizeSeries(series.america_dexchus),
    dgs10Series: normalizeSeries(series.dgs10),
    copxSeries: normalizeSeries(series.america_copx_close),
    vixSeries: normalizeSeries(series.america_vixcls),
    wtiSeries: normalizeSeries(series.america_dcoilwtico),
    ipmanSeries: normalizeSeries(series.america_ipman),
    indproSeries: normalizeSeries(series.america_indpro),
    cpiSeries: normalizeSeries(series.america_cpiaucsl),
    ppiSeries: normalizeSeries(series.america_ppiaco),
    lmeSeries: normalizeSeries(series.lme_copper_cash_usd_t),
    tateneSeries: normalizeSeries(series.japan_tatene_jpy_t),
  };
}
