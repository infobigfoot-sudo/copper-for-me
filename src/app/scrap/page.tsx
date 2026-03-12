import NativePageShell from '@/components/native/NativePageShell';
import IndicatorsNativeBoard from '@/components/native/IndicatorsNativeBoard';
import { getPosts } from '@/lib/microcms';
import { getIndicatorsDashboardSeries } from '@/lib/selected_series_bundle';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ScrapPage() {
  const [series, postsRes] = await Promise.all([
    getIndicatorsDashboardSeries(),
    getPosts(1, 'a').catch(() => ({ contents: [] as any[] })),
  ]);
  const latest = postsRes.contents?.[0];
  const latestArticle =
    latest?.slug || latest?.id
      ? { title: String(latest?.title || '-'), href: `/blog/${latest?.slug || latest?.id}` }
      : null;

  return (
    <NativePageShell
      active="indicators"
      title="スクラップ"
      description="スクラップ輸出入、国内需要、推定相場を整理。リサイクル市場の需給バランスを確認。"
      fullWidth
      hideStatusCard
      latestArticle={latestArticle}
    >
      <IndicatorsNativeBoard
        usdJpySeries={series.usdJpySeries}
        usdCnySeries={series.usdCnySeries}
        dgs10Series={series.dgs10Series}
        wtiSeries={series.wtiSeries}
        lmeSeries={series.lmeSeries}
        lmeMonthlySeries={series.lmeMonthlySeries}
        tateneSeries={series.tateneSeries}
        usdJpyMonthlySeries={series.usdJpyMonthlySeries}
        scrapExportUnitSeries={series.scrapExportUnitSeries}
        scrapImportUnitSeries={series.scrapImportUnitSeries}
        scrapExportWanSeries={series.scrapExportWanSeries}
        scrapImportWanSeries={series.scrapImportWanSeries}
        scrapNetImportSeries={series.scrapNetImportSeries}
      />
    </NativePageShell>
  );
}
