import Link from 'next/link';
import SiteFooter from '@/components/SiteFooter';
import { SUPPLY_CHAIN_PAGES } from './_pages';

const copperFieldPhotos = [
  '/images/copper-field/copper_1.jpg',
  '/images/copper-field/copper_2.jpg',
  '/images/copper-field/copper_3.jpg',
  '/images/copper-field/copper_4.jpg',
  '/images/copper-field/copper_5.jpg',
];

export const metadata = {
  title: '銅サプライチェーン（固定ページ）',
  description: '鉱山・精錬・用途・スクラップ回収・市場の5工程を整理した固定ページ一覧',
};

export default function SupplyChainIndexPage() {
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

      <header className="cf-hero">
        <p className="cf-eyebrow">Read the Market, Ahead</p>
        <h1 className="cf-hero-title">銅サプライチェーン</h1>
        <p>鉱山 → 精錬 → 用途 → スクラップ回収 → 市場 を、工程別の視点で整理</p>
      </header>

      <main className="cf-main">
        <section className="cf-dash-hero">
        <div className="cf-dash-hero-body">
          <h2>Supply Chain</h2>
          <p>銅サプライチェーンの全体像</p>
        </div>
      </section>

      <section id="what-is-copper" className="cf-latest cf-focus-section" style={{ marginTop: '16px', marginBottom: '16px' }}>
        <div className="cf-latest-head">
          <h3>そもそも銅とは？（種類・用途・サプライチェーンの見方）</h3>
        </div>
        <div className="cf-guide-block">
          <p className="cf-kpi-note">
            銅は「電気を通しやすい」「加工しやすい」「再利用しやすい」金属で、電線・住宅配線・モーター・家電・給湯器など、
            生活インフラの中核で使われる。
          </p>
          <p className="cf-kpi-note">
            身近なところでは、エアコン配管、電源ケーブル、ブレーカー周辺、EVやハイブリッド車の配線などに多く使われ、
            景気・建設・電力投資の影響を受けやすい。
          </p>

          <div className="cf-point-grid" style={{ marginTop: '12px' }}>
            <div className="cf-point-card">
              <p className="cf-point-no">POINT 01</p>
              <p className="cf-point-title">用途が広い</p>
              <p className="cf-point-note">電力・建設・家電・自動車にまたがるため、景気の影響を受けやすい。</p>
            </div>
            <div className="cf-point-card">
              <p className="cf-point-no">POINT 02</p>
              <p className="cf-point-title">再資源化しやすい</p>
              <p className="cf-point-note">スクラップとして循環しやすく、現場の選別品質が価格に直結しやすい。</p>
            </div>
            <div className="cf-point-card">
              <p className="cf-point-no">POINT 03</p>
              <p className="cf-point-title">価格要因が多い</p>
              <p className="cf-point-note">建値・為替・在庫に加え、鉱山/精錬/需要動向も価格に連動する。</p>
            </div>
          </div>

          <p className="cf-kpi-note" style={{ marginTop: '14px' }}>
            同じ「銅」でも、実務上は価値が一律ではない。純度、被覆の有無、混在状態、形状（線・管・板）、解体のしやすさによって、
            再資源化コストと売買価格が変わる。
          </p>
          <p className="cf-kpi-note">
            そのため、スクラップ現場では相場の数字だけでなく、現物の状態確認が重要になる。
          </p>

          <div className="cf-field-gallery">
            {copperFieldPhotos.map((src, idx) => (
              <figure key={src} className="cf-field-photo-card">
                <img src={src} alt={`現場の銅材写真 ${idx + 1}`} loading="lazy" />
              </figure>
            ))}
          </div>
          <p className="cf-kpi-note cf-field-gallery-note">
            現場で扱う銅材は、太さ・被覆・混在状況で実務価値が変わる。
            相場データに加えて、実物の状態を毎日確認することが仕入れ精度の底上げにつながる。
          </p>

          <p className="cf-kpi-note" style={{ marginTop: '14px' }}>
            この「現物の差」と「相場の差」をつなぐのがサプライチェーンの視点。銅価格は、鉱山での生産、精錬の稼働、
            最終用途（建設・電力・自動車）の需要、スクラップ回収量、LME在庫や為替の変化が連動して動く。
          </p>
          <p className="cf-kpi-note">
            スクラップ市場では「建値」「為替」「在庫」の3点を押さえると判断精度が上がるが、さらに一段深く見るなら、
            「どの工程で需給が詰まっているか（または緩んでいるか）」を把握することが重要。
          </p>
          <p className="cf-kpi-note">
            このサイトでは、銅サプライチェーンを工程別に分けて、どこまでデータで追えるかを整理している。
          </p>

          <div id="page-list" style={{ marginTop: 16 }}>
            <div style={{ display: 'grid', gap: 12 }}>
              {SUPPLY_CHAIN_PAGES.map((p) => (
                <Link
                  key={p.slug}
                  href={`/supply-chain/${p.slug}`}
                  style={{
                    display: 'block',
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    padding: '14px 40px 14px 16px',
                    background: '#fff',
                    textDecoration: 'none',
                    color: 'inherit',
                    position: 'relative',
                  }}
                >
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>{p.shortTitle}</div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{p.title}</div>
                  <div style={{ color: '#475569', lineHeight: 1.6 }}>{p.lead}</div>
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      right: 14,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#64748b',
                      fontWeight: 800,
                    }}
                  >
                    →
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <nav
            aria-label="ページ遷移"
            style={{
              marginTop: 16,
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 12,
            }}
          >
            <Link
              href="/"
              className="cf-supply-bottom-link cf-supply-bottom-link--left"
              style={{
                display: 'block',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: '12px 14px',
                background: '#fff',
                textDecoration: 'none',
                color: '#24324a',
                fontWeight: 500,
                fontFamily: 'var(--font-body-jp)',
                fontSize: '0.95rem',
              }}
            >
              HOME
            </Link>
            <Link
              href="/supply-chain/mining"
              className="cf-supply-bottom-link cf-supply-bottom-link--right"
              style={{
                display: 'block',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: '12px 14px',
                background: '#fff',
                textDecoration: 'none',
                color: '#24324a',
                fontWeight: 500,
                fontFamily: 'var(--font-body-jp)',
                fontSize: '0.95rem',
                textAlign: 'right',
              }}
            >
              鉱山
            </Link>
          </nav>
        </div>
      </section>

      </main>
      <SiteFooter />
    </div>
  );
}
