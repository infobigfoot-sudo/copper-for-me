import LmeNativeBoard from '@/components/native/LmeNativeBoard';
import NativePageShell from '@/components/native/NativePageShell';
import { getLmeBoardSeries } from '@/lib/selected_series_bundle';

export default async function LmePage() {
  const series = await getLmeBoardSeries();

  return (
    <NativePageShell active="lme" title="LME" description="LME銅価格、先物、在庫を可視化。">
      <LmeNativeBoard
        priceSeries={series.priceSeries}
        stockSeries={series.stockSeries}
        futures3mSeries={series.futures3mSeries}
        offWarrantSeries={series.offWarrantSeries}
        usdJpySeries={series.usdJpySeries}
        calculatorHref="/tatene-calculator"
      />
    </NativePageShell>
  );
}
