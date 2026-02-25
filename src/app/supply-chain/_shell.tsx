import Link from 'next/link';
import type { ReactNode } from 'react';
import SiteFooter from '@/components/SiteFooter';
import SupplyChainStageNavCard from './_stageNavCard';

type Props = {
  title: string;
  lead: string;
  eyebrow?: string;
  currentSlug?: string;
  children: ReactNode;
};

export default function SupplyChainShell({
  title,
  lead,
  eyebrow = 'Copper Supply Chain',
  currentSlug,
  children,
}: Props) {
  return (
    <div className="cf-page cf-supply-page">
      <nav className="cf-nav">
        <div className="cf-nav-inner">
          <div className="cf-logo-wrap">
            <div className="cf-logo"><Link href="/">Copper for me</Link></div>
            <p className="cf-logo-sub">Daily Scrap Learning</p>
          </div>
          <div className="cf-nav-links">
            <Link href="/">HOME</Link>
            <Link href="/category/info">相場記事</Link>
            <Link href="/category/index">指標記事</Link>
            <Link href="/learn/copper-price-basics">銅を見るポイント</Link>
            <Link href="/supply-chain">サプライチェーン</Link>
            <Link href="/category/about">このサイトについて</Link>
          </div>
          <details className="cf-nav-mobile">
            <summary>Menu</summary>
            <div className="cf-nav-mobile-panel">
              <Link href="/">HOME</Link>
              <Link href="/category/info">相場記事</Link>
              <Link href="/category/index">指標記事</Link>
              <Link href="/learn/copper-price-basics">銅を見るポイント</Link>
              <Link href="/supply-chain">サプライチェーン</Link>
              <Link href="/category/about">このサイトについて</Link>
            </div>
          </details>
        </div>
      </nav>

      <main className="cf-main">
        {currentSlug ? <SupplyChainStageNavCard currentSlug={currentSlug} /> : null}
        <section className="cf-latest cf-focus-section cf-supply-content-shell">{children}</section>
      </main>

      <SiteFooter />
    </div>
  );
}
