import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '銅価格の見方入門 | Copper for me',
  description: 'LME・為替・在庫の3点で銅価格を読む基礎ガイド。',
};

const navItems = [
  { href: '/', label: 'NEW' },
  { href: '/lme', label: 'LME' },
  { href: '/tatene', label: '建値' },
  { href: '/indicators', label: '指標' },
  { href: '/supply-chain', label: '供給と需要' },
  { href: '/prediction', label: '予測' },
  { href: '/article', label: '記事' },
];

export default function CopperPriceBasicsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f7f3ec] via-[#efe7dc] to-[#f9f6f0] text-[#0f172a]">
      <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 w-full max-w-[1440px] items-center justify-between px-8">
          <div className="flex items-center gap-12">
            <div className="flex flex-col">
              <h1 className="text-2xl font-extrabold tracking-tight">COPPER FOR ME</h1>
              <span className="text-[9px] font-bold uppercase tracking-[0.4em] text-[#475569]">Daily Scrap Learning</span>
            </div>
            <div className="hidden items-center gap-8 text-xs font-bold uppercase tracking-widest text-[#475569] md:flex">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} className="transition-all hover:text-[#1f3a5f]">
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-[1440px] px-8 py-12">
        <header className="mb-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.4em] text-[#c9734f]">Read the Market, Ahead</p>
          <h2 className="mb-4 text-5xl font-bold tracking-tight">
            銅価格の見方 <span className="font-light italic text-[#475569]">Basics</span>
          </h2>
          <p className="max-w-3xl text-lg text-[#475569]">LME・為替・在庫の3点から、仕入れ/在庫/売値判断の基本を整理します。</p>
        </header>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#475569]">Point 1</p>
            <h3 className="mb-3 text-2xl font-bold">LME銅価格</h3>
            <p className="text-sm leading-relaxed text-[#475569]">
              世界の基準価格。まずは「今いくらか」と「前日比」を確認し、方向感を掴みます。
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#475569]">Point 2</p>
            <h3 className="mb-3 text-2xl font-bold">USD/JPY</h3>
            <p className="text-sm leading-relaxed text-[#475569]">
              円安なら輸入コスト増で建値の上昇圧力、円高なら低下圧力として働きやすくなります。
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#475569]">Point 3</p>
            <h3 className="mb-3 text-2xl font-bold">Warrant / Off-warrant</h3>
            <p className="text-sm leading-relaxed text-[#475569]">
              Warrantは短期需給、Off-warrantは中期供給余力のヒント。両方を合わせて確認します。
            </p>
          </article>
        </section>
      </main>
    </div>
  );
}
