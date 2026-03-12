import Link from 'next/link';
import Image from 'next/image';

import NativePageShell from '@/components/native/NativePageShell';
import { formatDateLabel } from '@/lib/date_label';
import { getPosts } from '@/lib/microcms';

export default async function ArticlePage() {
  const postsRes = await getPosts(12, 'a').catch(() => ({ contents: [] as any[] }));
  const posts = (postsRes.contents || []).slice(0, 12);
  const featured = posts[0] ?? null;
  const featuredTitle = featured ? String(featured?.title || 'Untitled') : '銅価格を読む指標まとめ（毎日・週次・地合い確認）';
  const featuredHref = featured ? `/blog/${featured?.slug || featured?.id || ''}` : '/learn/copper-price-basics';
  const featuredDate = featured ? formatDateLabel(featured?.publishedAt) : '-';
  const featuredExcerpt = featured
    ? String(featured?.excerpt || '').trim() || '相場を追うときに「何を・どの順で見るか」を整理した短い解説です。'
    : '相場を追うときに「何を・どの順で見るか」がわかる短い解説です。';
  const featuredImage = featured?.coverImage?.url || null;
  const fallbackCards = [
    {
      title: '免責事項',
      href: '/blog/disclaimer',
      excerpt: '当サイトの情報利用に関する注意事項（正確性・投資判断・責任範囲）を記載。',
    },
    {
      title: 'プライバシーポリシー',
      href: '/blog/privacypolicy',
      excerpt: '当サイトのプライバシーポリシーです。Cookie、広告配信、個人情報の取り扱いを掲載。',
    },
    {
      title: 'このサイトについて',
      href: '/category/about',
      excerpt: '運営方針、データ出所、価格情報の反映頻度、指標の見方を説明します。',
    },
  ];
  const secondaryCards = Array.from({ length: 3 }, (_, index) => {
    const post = posts[index + 1];
    if (post) {
      return {
        title: String(post?.title || 'Untitled'),
        href: `/blog/${post?.slug || post?.id || ''}`,
        excerpt:
          String(post?.excerpt || '').trim() ||
          '相場・指標の更新内容を短く整理した記事です。',
        date: formatDateLabel(post?.publishedAt),
      };
    }
    return {
      ...fallbackCards[index],
      date: featuredDate,
    };
  });

  return (
    <NativePageShell active="article" title="記事" description="相場・指標の最新情報" hideHeaderCards>
      <section className="mb-4">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cool-grey">最新コンテンツ</p>
      </section>

      <article className="glass-card rounded-2xl p-0 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
          <div className="relative min-h-[240px] sm:min-h-[300px] bg-[#1f2d3a]">
            {featuredImage ? (
              <Image
                src={featuredImage}
                alt={featuredTitle}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 420px"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-[#203246] via-[#2d4359] to-[#1e2c3b]" />
            )}
          </div>

          <div className="p-5 sm:p-7">
            <p className="text-[11px] font-bold text-cool-grey mb-3">{featuredDate}</p>
            <h3 className="text-off-white text-2xl sm:text-3xl font-black leading-snug mb-4">
              <Link href={featuredHref} className="hover:text-positive transition-colors">
                {featuredTitle}
              </Link>
            </h3>
            <p className="text-cool-grey text-sm sm:text-base leading-relaxed mb-6 max-w-2xl">{featuredExcerpt}</p>
            <Link
              href={featuredHref}
              className="inline-flex items-center rounded-full bg-[#1f3a5f] px-5 py-2 text-xs font-black tracking-[0.08em] text-white hover:bg-[#24466f] transition-colors"
            >
              詳しく読む
            </Link>
          </div>
        </div>
      </article>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        {secondaryCards.map((card) => (
          <article key={`${card.href}-${card.title}`} className="glass-card rounded-2xl p-5">
            <p className="text-cool-grey text-[10px] mb-2">{card.date}</p>
            <h4 className="text-[14px] font-black text-off-white mb-3">{card.title}</h4>
            <p className="text-cool-grey text-sm leading-relaxed mb-4">{card.excerpt}</p>
            <Link href={card.href} className="text-positive text-sm font-bold hover:underline">詳細を確認する</Link>
          </article>
        ))}
      </div>

    </NativePageShell>
  );
}
