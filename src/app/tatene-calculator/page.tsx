import NativePageShell from '@/components/native/NativePageShell';
import TateneCalculatorNative from '@/components/native/TateneCalculatorNative';
import { valueAtOrBefore } from '@/lib/copper_units';
import { normalizeSeries, readMergedPublishSeriesBundle } from '@/lib/publish_series_bundle';

export default async function TateneCalculatorPage() {
  const merged = await readMergedPublishSeriesBundle();
  const series = merged?.series || {};
  const lmeRows = normalizeSeries(series.lme_copper_cash_usd_t);
  const fxRows = normalizeSeries(series.america_dexjpus);
  const tateneRows = normalizeSeries(series.japan_tatene_jpy_t);

  const latestLmeRaw = lmeRows.at(-1) ?? null;
  const latestFxRaw = fxRows.at(-1) ?? null;
  const latestTatene = tateneRows.at(-1) ?? null;
  const latestLme =
    latestTatene
      ? (() => {
          const lme = valueAtOrBefore(lmeRows, latestTatene.date);
          if (lme === null) return null;
          return { date: latestTatene.date, value: lme };
        })()
      : latestLmeRaw;
  const premiumOnLatestTatene =
    latestTatene
      ? (() => {
          const lme = valueAtOrBefore(lmeRows, latestTatene.date);
          const fx = valueAtOrBefore(fxRows, latestTatene.date);
          if (lme === null || fx === null) return null;
          return { date: latestTatene.date, value: (latestTatene.value - lme * fx) / 1000 };
        })()
      : null;
  const latestFx =
    latestTatene
      ? (() => {
          const fx = valueAtOrBefore(fxRows, latestTatene.date);
          if (fx === null) return null;
          return { date: latestTatene.date, value: fx };
        })()
      : latestFxRaw;

  return (
    <NativePageShell
      active="tatene-calculator"
      title="銅建値計算ツール"
      description="LME・為替・諸コストから国内建値を即時計算。"
      hideStatusCard
      hideHeaderCards
    >
      <TateneCalculatorNative
        latestLme={latestLme ? { date: latestLme.date, value: latestLme.value } : null}
        latestFx={latestFx ? { date: latestFx.date, value: latestFx.value } : null}
        latestPremium={premiumOnLatestTatene}
        latestTatene={latestTatene ? { date: latestTatene.date, value: latestTatene.value / 1000 } : null}
      />
    </NativePageShell>
  );
}
