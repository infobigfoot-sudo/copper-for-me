import NativePageShell from '@/components/native/NativePageShell';
import PredictionNativeBoard from '@/components/native/PredictionNativeBoard';
import { readMergedPublishSeriesBundle, normalizeSeries } from '@/lib/publish_series_bundle';
import { readPredictionSummary } from '@/lib/prediction_summary';
import { getWarrantDashboardData } from '@/lib/warrant_dashboard';

export default async function PredictionPage() {
  const [prediction, merged, warrantDashboard] = await Promise.all([
    readPredictionSummary(),
    readMergedPublishSeriesBundle(),
    getWarrantDashboardData(),
  ]);
  const tateneSeries = normalizeSeries(merged?.series?.japan_tatene_jpy_t);
  const usdJpySeries = normalizeSeries(merged?.series?.america_dexjpus);
  const usdCnySeries = normalizeSeries(merged?.series?.america_dexchus);
  const us10ySeries = normalizeSeries(merged?.series?.dgs10);
  const copxSeries = normalizeSeries(merged?.series?.america_copx_close);
  const latestTatene = tateneSeries.length ? tateneSeries[tateneSeries.length - 1] : null;

  let updateDate = prediction?.date ?? latestTatene?.date ?? '2026-02-25';
  let adopted = prediction?.adopted ?? latestTatene?.value ?? 2_140_000;
  let reference = prediction?.reference ?? adopted;
  let rangeLow = prediction?.lower ?? Math.round(adopted * 0.98);
  let rangeHigh = prediction?.upper ?? Math.round(adopted * 1.02);

  if (prediction?.date && latestTatene?.date && prediction.date < latestTatene.date) {
    const staleBase = prediction.adopted ?? adopted;
    const staleRef = prediction.reference ?? staleBase;
    const staleLow = prediction.lower ?? staleBase;
    const staleHigh = prediction.upper ?? staleBase;
    const refRatio = staleBase !== 0 ? staleRef / staleBase : 1;
    const lowRatio = staleBase !== 0 ? staleLow / staleBase : 0.98;
    const highRatio = staleBase !== 0 ? staleHigh / staleBase : 1.02;
    adopted = latestTatene.value;
    reference = Math.round(adopted * refRatio);
    rangeLow = Math.round(adopted * lowRatio);
    rangeHigh = Math.round(adopted * highRatio);
    updateDate = latestTatene.date;
  }

  const maeDiffPct =
    prediction?.premiumProxyDevPct !== null && prediction?.premiumProxyDevPct !== undefined
      ? Number(prediction.premiumProxyDevPct) * 100
      : null;

  return (
    <NativePageShell active="prediction" title="予測" description="LME・為替・諸コストを統合し、銅調達向けの予測モデルを表示。">
      <PredictionNativeBoard
        rangeLow={rangeLow}
        rangeHigh={rangeHigh}
        adopted={adopted}
        reference={reference}
        warningReason={prediction?.warningReason ?? '供給緩和'}
        maeDiffPct={maeDiffPct}
        warrant7dPct={warrantDashboard.warrant.diffPct7d}
        offMoMPct={warrantDashboard.offWarrant.diffPctMoM}
        usdJpy={usdJpySeries.at(-1)?.value ?? null}
        usdCny={usdCnySeries.at(-1)?.value ?? null}
        us10y={us10ySeries.at(-1)?.value ?? null}
        copx={copxSeries.at(-1)?.value ?? null}
        updateDate={updateDate}
      />
    </NativePageShell>
  );
}
