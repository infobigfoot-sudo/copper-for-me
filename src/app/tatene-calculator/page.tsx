import NativePageShell from '@/components/native/NativePageShell';
import TateneCalculatorNative from '@/components/native/TateneCalculatorNative';
import { normalizeSeries, readMergedPublishSeriesBundle } from '@/lib/publish_series_bundle';

export default async function TateneCalculatorPage() {
  const merged = await readMergedPublishSeriesBundle();
  const series = merged?.series || {};
  const lmeRows = normalizeSeries(series.lme_copper_cash_usd_t);
  const fxRows = normalizeSeries(series.america_dexjpus);
  const tateneRows = normalizeSeries(series.japan_tatene_jpy_t);

  const valueAtOrBefore = (rows: Array<{ date: string; value: number }>, date: string): number | null => {
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (rows[i].date <= date) return rows[i].value;
    }
    return null;
  };

  const lmeOptions = lmeRows.slice(-7).reverse().map((row) => ({ date: row.date, value: row.value }));
  const fxOptions = fxRows.slice(-7).reverse().map((row) => ({ date: row.date, value: row.value }));
  const latestTatene = tateneRows.at(-1) ?? null;
  const premiumOnLatestTatene =
    latestTatene
      ? (() => {
          const lme = valueAtOrBefore(lmeRows, latestTatene.date);
          const fx = valueAtOrBefore(fxRows, latestTatene.date);
          if (lme === null || fx === null) return null;
          return { date: latestTatene.date, value: latestTatene.value - lme * fx };
        })()
      : null;

  return (
    <NativePageShell
      active="tatene-calculator"
      title="銅建値計算ツール"
      description="LME・為替・諸コストから国内建値を即時計算。"
      hideStatusCard
    >
      <TateneCalculatorNative
        lmeOptions={lmeOptions}
        fxOptions={fxOptions}
        latestPremium={premiumOnLatestTatene}
        latestTatene={latestTatene ? { date: latestTatene.date, value: latestTatene.value } : null}
      />
    </NativePageShell>
  );
}
