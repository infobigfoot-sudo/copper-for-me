import { normalizeSeries, readMergedPublishSeriesBundle } from '@/lib/publish_series_bundle';

export type SeriesPoint = {
  date: string;
  value: number;
};

function normalizeYm(ym: string): string {
  const [yText, mText] = ym.split('-');
  const year = Number(yText);
  const month = Number(mText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return ym;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

function previousMonthYm(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const prevMonth = month - 1;
  if (prevMonth >= 1) return `${String(year).padStart(4, '0')}-${String(prevMonth).padStart(2, '0')}`;
  return `${String(year - 1).padStart(4, '0')}-12`;
}

function toMonthlyAverage(rows: SeriesPoint[]): SeriesPoint[] {
  const cutoffYm = previousMonthYm();
  const buckets = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    const ym = normalizeYm(row.date.slice(0, 7));
    if (!/^\d{4}-\d{2}$/.test(ym) || !Number.isFinite(row.value)) continue;
    if (ym > cutoffYm) continue;
    const bucket = buckets.get(ym) ?? { sum: 0, count: 0 };
    bucket.sum += row.value;
    bucket.count += 1;
    buckets.set(ym, bucket);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, bucket]) => ({
      date: ym,
      value: bucket.count > 0 ? bucket.sum / bucket.count : NaN,
    }))
    .filter((row) => Number.isFinite(row.value));
}

function sumSeriesByDate(rowsList: SeriesPoint[][]): SeriesPoint[] {
  const map = new Map<string, number>();
  for (const rows of rowsList) {
    for (const row of rows) {
      if (!row?.date || !Number.isFinite(row.value)) continue;
      map.set(row.date, (map.get(row.date) || 0) + row.value);
    }
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
}

function latestSeriesMonth(rows: SeriesPoint[]): string {
  return rows.at(-1)?.date || '';
}

function chooseFresherSeries(primary: SeriesPoint[], fallback: SeriesPoint[]): SeriesPoint[] {
  if (!primary.length) return fallback;
  if (!fallback.length) return primary;
  return latestSeriesMonth(fallback) > latestSeriesMonth(primary) ? fallback : primary;
}

function dropNonPositive(rows: SeriesPoint[]): SeriesPoint[] {
  return rows.filter((row) => Number.isFinite(row.value) && row.value > 0);
}

type SelectedSeriesBundle = {
  series?: Record<string, Array<{ date?: string; value?: number | string }>>;
};

export async function readSelectedSeriesBundle(): Promise<SelectedSeriesBundle | null> {
  return readMergedPublishSeriesBundle();
}

export async function getLmeBoardSeries() {
  const bundle = await readSelectedSeriesBundle();
  const series = bundle?.series || {};
  const priceSeries = toMonthlyAverage(normalizeSeries(series.cmo_pink_sheet_copper_usd_t));
  const stockSeries = toMonthlyAverage(normalizeSeries(series.lme_copper_stock_t));
  const futures3mSeries = toMonthlyAverage(
    normalizeSeries(series.lme_copper_3month_usd_t).map((row) => ({
      ...row,
      value: row.value > 200000 ? row.value / 100 : row.value,
    }))
  );
  const offWarrantSeries = toMonthlyAverage(normalizeSeries(series.offwarrant_copper_monthly_t));
  const usdJpySeries = toMonthlyAverage(normalizeSeries(series.america_dexjpus));
  const usdCnySeries = toMonthlyAverage(normalizeSeries(series.america_dexchus));
  const worldRawMaterialExportSeries = toMonthlyAverage(normalizeSeries(series.trade_world_raw_material_export_wan_t));
  const rawMaterialExportSeriesBase = toMonthlyAverage(normalizeSeries(series.trade_raw_material_export_wan_t));
  const chileRawMaterialExportSeries = toMonthlyAverage(normalizeSeries(series.trade_chile_hs2603_export_wan_t));
  const peruRawMaterialExportSeries = toMonthlyAverage(normalizeSeries(series.trade_peru_hs2603_export_wan_t));
  const chilePeruRawMaterialExportSeries = sumSeriesByDate([chileRawMaterialExportSeries, peruRawMaterialExportSeries]);
  const rawMaterialExportSeries = chooseFresherSeries(
    rawMaterialExportSeriesBase.length ? rawMaterialExportSeriesBase : chilePeruRawMaterialExportSeries,
    worldRawMaterialExportSeries
  );
  const worldCopperExportUnitSeries = dropNonPositive(
    toMonthlyAverage(normalizeSeries(series.trade_world_copper_export_unit_usd_t))
  );
  const copperExportUnitSeries = chooseFresherSeries(
    dropNonPositive(toMonthlyAverage(normalizeSeries(series.trade_copper_export_unit_usd_t))),
    worldCopperExportUnitSeries
  );
  const tateneMonthlyAvgSeries = toMonthlyAverage(normalizeSeries(series.japan_tatene_monthly_avg_jpy_t));
  const tateneSeries = tateneMonthlyAvgSeries.length
    ? tateneMonthlyAvgSeries
    : toMonthlyAverage(normalizeSeries(series.japan_tatene_jpy_t));
  const japanHs7403ImportValueSeries = toMonthlyAverage(normalizeSeries(series.trade_japan_hs7403_import_value_jpy));
  const japanHs7403ImportUnitSeries = toMonthlyAverage(normalizeSeries(series.trade_japan_hs7403_import_unit_jpy_t));
  const electricCopperInventorySeries = toMonthlyAverage(
    normalizeSeries(series.supply_chain_refining_jp_electric_copper_inventory_qty)
  );
  return {
    priceSeries,
    stockSeries,
    futures3mSeries,
    offWarrantSeries,
    usdJpySeries,
    usdCnySeries,
    rawMaterialExportSeries,
    copperExportUnitSeries,
    tateneSeries,
    japanHs7403ImportValueSeries,
    japanHs7403ImportUnitSeries,
    electricCopperInventorySeries,
  };
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
    lmeMonthlySeries: normalizeSeries(series.cmo_pink_sheet_copper_usd_t),
    tateneSeries: normalizeSeries(series.japan_tatene_jpy_t),
    usdJpyMonthlySeries: normalizeSeries(series.japan_usd_jpy_monthly),
    scrapExportUnitSeries: normalizeSeries(series.trade_japan_hs7404_export_unit_jpy_t),
    scrapImportUnitSeries: normalizeSeries(series.trade_japan_hs7404_import_unit_jpy_t),
    scrapExportWanSeries: normalizeSeries(series.trade_japan_hs7404_export_wan_t),
    scrapImportWanSeries: normalizeSeries(series.trade_japan_hs7404_import_wan_t),
    scrapNetImportSeries: normalizeSeries(series.trade_japan_hs7404_net_import_wan_t),
    hs7403ImportWanSeries: normalizeSeries(series.trade_japan_hs7403_import_wan_t),
    electricCopperProductionSeries: normalizeSeries(series.supply_chain_refining_jp_electric_copper_production_qty),
  };
}
