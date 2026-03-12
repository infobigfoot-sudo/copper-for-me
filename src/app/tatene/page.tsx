import NativePageShell from '@/components/native/NativePageShell';
import TateneNativeBoard from '@/components/native/TateneNativeBoard';
import { getPosts } from '@/lib/microcms';
import { getLmeBoardSeries } from '@/lib/selected_series_bundle';

export default async function TatenePage() {
  const [series, postsRes] = await Promise.all([
    getLmeBoardSeries(),
    getPosts(3, 'a').catch(() => ({ contents: [] })),
  ]);
  const marketArticles = (postsRes.contents || []).slice(0, 3).map((post: any) => ({
    title: String(post?.title || '記事'),
    href: `/blog/${post?.slug || post?.id || ''}`,
  }));
  const latest = postsRes.contents?.[0];
  const latestArticle =
    latest?.slug || latest?.id
      ? { title: String(latest?.title || '-'), href: `/blog/${latest?.slug || latest?.id}` }
      : null;

  return (
    <NativePageShell
      active="tatene"
      title="国内建値相場"
      description="国内銅建値を中心に、輸入価格・為替・在庫などを分析。国内価格形成の要因を可視化。"
      fullWidth
      hideStatusCard
      latestArticle={latestArticle}
    >
      <TateneNativeBoard
        priceSeries={series.priceSeries}
        usdJpySeries={series.usdJpySeries}
        tateneSeries={series.tateneSeries}
        importValueSeries={series.japanHs7403ImportValueSeries}
        importUnitSeries={series.japanHs7403ImportUnitSeries}
        electricCopperInventorySeries={series.electricCopperInventorySeries}
        marketArticles={marketArticles}
      />
    </NativePageShell>
  );
}
