import Link from 'next/link';
import type { ReactNode } from 'react';
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
  const displayTitle = title.replace(/^銅サプライチェーン：/, '');

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
              <Link href="/#conclusion">今日の結論</Link>
              <Link href="/#lme-domestic">LME価格と国内建値</Link>
              <Link href="/#fx-section">USD/JPY とUSD/CNY</Link>
              <Link href="/#inventory-section">LME在庫　Warrant / Off-warrant</Link>
              <Link href="/#details">個別指標</Link>
            </div>
          </details>
        </div>
      </nav>

      <header className="cf-hero">
        <p className="cf-eyebrow">Read the Market, Ahead</p>
        <h1 className="cf-hero-title cf-hero-title--supply">{displayTitle}</h1>
        <p>{lead}</p>
      </header>

      <main className="cf-main">
        {currentSlug ? <SupplyChainStageNavCard currentSlug={currentSlug} /> : null}
        <section className="cf-latest cf-focus-section cf-supply-content-shell">{children}</section>
      </main>

      <footer className="cf-footer">
        <p className="cf-footer-links">
          <Link href="/category/about">このサイトについて</Link>
          <span> / </span>
          <Link href="/blog/privacypolicy">プライバシーポリシー</Link>
          <span> / </span>
          <Link href="/blog/disclaimer">免責事項</Link>
        </p>
        <p className="cf-footer-note">
          本サイトは公開データ/APIをもとに情報を掲載しています。できるだけ最新化していますが、反映に時間差が出る場合があります。
        </p>
        <p>© 2026 Copper for me. All Rights Reserved.</p>
      </footer>
    </div>
  );
}
