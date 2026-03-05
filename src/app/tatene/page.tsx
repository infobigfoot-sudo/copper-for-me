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

  return (
    <NativePageShell active="tatene" title="国内建値相場" description="国内建値相場を日々の判断に使える形で表示。">
      <TateneNativeBoard
        priceSeries={series.priceSeries}
        usdJpySeries={series.usdJpySeries}
        tateneSeries={series.tateneSeries}
        marketArticles={marketArticles}
      />
    </NativePageShell>
  );
}
