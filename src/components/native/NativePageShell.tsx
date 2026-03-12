import Link from 'next/link';
import type { ReactNode } from 'react';

import CurrentJstTime from '@/components/CurrentJstTime';
import DataDisclaimerBlock from '@/components/native/DataDisclaimerBlock';
import MobileBottomNavClient from '@/components/native/MobileBottomNavClient';
import { isOtherNavKey, OTHER_NAV_LINKS, PRIMARY_NAV_LINKS } from '@/components/native/nav';
import TopNativeTheme from '@/components/TopNativeTheme';

type ActiveKey = Parameters<typeof isOtherNavKey>[0];

export default function NativePageShell({
  active,
  title,
  description,
  hideStatusCard = false,
  hideHeaderCards = false,
  fullWidth = false,
  latestArticle,
  children,
}: {
  active: ActiveKey;
  title: string;
  description: string;
  hideStatusCard?: boolean;
  hideHeaderCards?: boolean;
  fullWidth?: boolean;
  latestArticle?: { title: string; href: string } | null;
  children: ReactNode;
}) {
  const isOtherActive = isOtherNavKey(active);
  const showStatusCard = !hideStatusCard;
  const widthClass = fullWidth ? 'w-full' : 'max-w-[1440px] mx-auto';

  return (
    <TopNativeTheme>
      <nav className="sticky top-0 z-50 border-b border-[#e6dfd3] bg-[#f3f1ed]/95 backdrop-blur-xl">
        <div className={`${widthClass} px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between`}>
          <div className="flex w-full items-center gap-4">
            <div className="flex flex-col">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-off-white">
                <Link href="/">COPPER FOR ME</Link>
              </h1>
              <span className="text-[9px] uppercase tracking-[0.4em] text-cool-grey font-bold">daily copper learning</span>
            </div>
            <div className="hidden md:flex flex-1 items-center justify-end gap-6 text-xs font-bold uppercase tracking-widest text-cool-grey">
              {PRIMARY_NAV_LINKS.map((item) => (
                <Link key={`native-nav-${item.href}`} href={item.href} className={item.key === active ? 'nav-link-active' : 'hover:text-positive transition-all'}>
                  {item.label}
                </Link>
              ))}
              <details className="relative group">
                <summary
                  className={`list-none cursor-pointer select-none [&::-webkit-details-marker]:hidden ${
                    isOtherActive ? 'nav-link-active' : 'hover:text-positive transition-all'
                  }`}
                >
                  その他
                </summary>
                <div className="absolute right-0 top-full mt-3 w-44 rounded-xl border border-[#d9d2c6] bg-[#f9f7f3] p-2 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                  {OTHER_NAV_LINKS.map((item) => (
                    <Link
                      key={`native-other-${item.href}`}
                      href={item.href}
                      className={`block rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] ${
                        item.key === active ? 'bg-white text-[#1f3a5f]' : 'text-cool-grey hover:bg-white/70 hover:text-[#1f3a5f]'
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </details>
              <Link
                href="/tatene-calculator"
                className="inline-flex items-center justify-center rounded-lg border border-[#285949] bg-[#2f6d5a] px-4 py-2 text-[10px] font-black tracking-[0.2em] text-white"
              >
                国内建値計算
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className={`main-unified-14 flex-1 w-full ${widthClass} px-4 sm:px-6 lg:px-8 py-10 sm:py-12 pb-24 md:pb-4`}>
        <header className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,460px)] lg:items-end">
          <div className="max-w-3xl">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 leading-tight text-off-white">{title}</h2>
            <p className="text-cool-grey text-base sm:text-lg max-w-xl leading-relaxed">{description}</p>
          </div>
          {hideHeaderCards ? null : (
            <div className={`grid w-full grid-cols-1 gap-4 ${showStatusCard ? 'sm:grid-cols-2' : ''}`}>
              {showStatusCard ? (
                <div className="glass-card p-4 rounded-xl min-w-0">
                  <p className="text-[10px] font-bold text-cool-grey uppercase tracking-tighter mb-1">更新ステータス</p>
                  <p className="text-[9px] sm:text-[14px] font-black text-cool-grey uppercase tracking-[0.2em] sm:tracking-[0.3em]">稼働中</p>
                  <p className="text-xs text-cool-grey mt-1">最新データを順次反映</p>
                </div>
              ) : null}
              <div className="glass-card p-4 rounded-xl min-w-0 text-left sm:text-right">
                <p className="text-[10px] font-bold text-cool-grey uppercase tracking-tighter mb-1">基準時刻</p>
                <CurrentJstTime />
              </div>
            </div>
          )}
        </header>

        {latestArticle ? (
          <div className="mb-4 glass-card rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <p className="flex-1 text-xs sm:text-sm font-medium text-cool-grey text-left line-clamp-1">
              最新記事：
              <Link href={latestArticle.href} className="ml-1 font-bold text-[#1f3a5f] hover:text-positive hover:underline">
                {latestArticle.title}
              </Link>
            </p>
          </div>
        ) : null}

        {children}
      </main>

      <footer className="bg-[#f3f1ed] border-t border-[#e6dfd3] pt-4 pb-24 md:pb-4">
        <div className={`${widthClass} px-4 sm:px-6 lg:px-8`}>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-16 mb-4">
            <div className="col-span-1 md:col-span-2">
              <div className="flex flex-col mb-8">
                <h1 className="text-3xl font-black tracking-tight text-off-white">COPPER FOR ME</h1>
              </div>
              <p className="text-cool-grey text-sm max-w-md leading-relaxed">
                非鉄金属業界向けに、月次の市場データと予測分析を提供します。世界中の取引所と独自のインデックスから集約されています。
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 md:col-span-3">
              <div>
                <h6 className="text-[10px] font-black text-off-white uppercase tracking-[0.3em] mb-10">Market</h6>
                <ul className="space-y-5 text-xs font-bold text-cool-grey uppercase tracking-widest">
                  <li><Link className="hover:text-positive transition-colors" href="/">概要</Link></li>
                  <li><Link className="hover:text-positive transition-colors" href="/lme">LME</Link></li>
                  <li><Link className="hover:text-positive transition-colors" href="/tatene">建値</Link></li>
                  <li><Link className="hover:text-positive transition-colors" href="/scrap">スクラップ</Link></li>
                </ul>
              </div>
              <div>
                <h6 className="text-[10px] font-black text-off-white uppercase tracking-[0.3em] mb-10">Analytics</h6>
                <ul className="space-y-5 text-xs font-bold text-cool-grey uppercase tracking-widest">
                  <li><Link className="hover:text-positive transition-colors" href="/prediction">予測</Link></li>
                  <li><Link className="hover:text-positive transition-colors" href="/article">記事</Link></li>
                  <li><Link className="hover:text-positive transition-colors" href="/tatene-calculator">建値計算</Link></li>
                </ul>
              </div>
              <div>
                <h6 className="text-[10px] font-black text-off-white uppercase tracking-[0.3em] mb-10">Information</h6>
                <ul className="space-y-5 text-xs font-bold text-cool-grey uppercase tracking-widest">
                  <li><Link className="hover:text-positive transition-colors" href="/blog/privacypolicy">プライバシーポリシーについて</Link></li>
                  <li><Link className="hover:text-positive transition-colors" href="/blog/disclaimer">免責事項</Link></li>
                  <li><Link className="hover:text-positive transition-colors" href="/blog/about">このサイトについて</Link></li>
                </ul>
              </div>
            </div>
          </div>
          <DataDisclaimerBlock />
        </div>
      </footer>
      <MobileBottomNavClient />
    </TopNativeTheme>
  );
}
