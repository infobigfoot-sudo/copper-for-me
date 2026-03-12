import LmeNativeBoard from '@/components/native/LmeNativeBoard';
import NativePageShell from '@/components/native/NativePageShell';
import { getPosts } from '@/lib/microcms';
import { getLmeBoardSeries } from '@/lib/selected_series_bundle';

export default async function LmePage() {
  const [series, postsRes] = await Promise.all([
    getLmeBoardSeries(),
    getPosts(1, 'a').catch(() => ({ contents: [] as any[] })),
  ]);
  const latest = postsRes.contents?.[0];
  const latestArticle =
    latest?.slug || latest?.id
      ? { title: String(latest?.title || '-'), href: `/blog/${latest?.slug || latest?.id}` }
      : null;

  return (
    <NativePageShell
      active="lme"
      title="LME"
      description="LME銅価格、輸出入動向、為替などの関連指標を統合し、世界の銅市場トレンドを把握。"
      fullWidth
      hideStatusCard
      latestArticle={latestArticle}
    >
      <LmeNativeBoard
        priceSeries={series.priceSeries}
        stockSeries={series.stockSeries}
        futures3mSeries={series.futures3mSeries}
        offWarrantSeries={series.offWarrantSeries}
        usdJpySeries={series.usdJpySeries}
        usdCnySeries={series.usdCnySeries}
        rawMaterialExportSeries={series.rawMaterialExportSeries}
        copperExportUnitSeries={series.copperExportUnitSeries}
        calculatorHref="/tatene-calculator"
      />
    </NativePageShell>
  );
}
