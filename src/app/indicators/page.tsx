import NativePageShell from '@/components/native/NativePageShell';
import IndicatorsNativeBoard from '@/components/native/IndicatorsNativeBoard';
import { getIndicatorsDashboardSeries } from '@/lib/selected_series_bundle';

export default async function IndicatorsPage() {
  const series = await getIndicatorsDashboardSeries();

  return (
    <NativePageShell active="indicators" title="指標" description="為替・金利・主要マクロ指標をリアルタイムで追跡し、銅市場への影響を可視化。">
      <IndicatorsNativeBoard
        usdJpySeries={series.usdJpySeries}
        usdCnySeries={series.usdCnySeries}
        dgs10Series={series.dgs10Series}
        wtiSeries={series.wtiSeries}
        lmeSeries={series.lmeSeries}
        tateneSeries={series.tateneSeries}
      />
    </NativePageShell>
  );
}
