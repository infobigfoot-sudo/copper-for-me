import type { Metadata } from 'next';
import Link from 'next/link';

import FooterReferenceLinks from '@/components/FooterReferenceLinks';
import SiteFooter from '@/components/SiteFooter';
import { formatIndicatorValue, getEconomyIndicators } from '@/lib/economy';
import { getWarrantDashboardData } from '@/lib/warrant_dashboard';

export const metadata: Metadata = {
  title: '銅価格の見方入門｜LME・為替（USD/JPY）・在庫（Warrant/Off-warrant）の基本 | Copper for me',
  description:
    '銅価格を読むときにまず押さえる3つのポイント（LME銅価格、USD/JPY、Warrant/Off-warrant在庫）を、スクラップ・建値の実務目線で解説。日次の見方、建値への影響、需給の読み方を整理。',
};

function formatYmd(value?: string) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatYearMonth(value?: string) {
  if (!value) return '-';
  const [y, m] = String(value).split(/[-_/]/);
  if (!y || !m) return value;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function normalizeUnitLabel(unit: string) {
  const u = String(unit || '');
  if (!u) return '-';
  if (u === 'USD / JPY') return 'JPY/USD';
  return u;
}

function fmtPct(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export default async function CopperPriceBasicsPage() {
  const [economy, warrantDashboard] = await Promise.all([getEconomyIndicators(), getWarrantDashboardData()]);
  const indicators = [...(economy.fred || []), ...(economy.alpha || [])];
  const byId = new Map(indicators.map((i) => [i.id, i]));
  const lme = byId.get('lme_copper_usd');
  const usdJpy = byId.get('usd_jpy');

  const lmeValue = lme ? formatIndicatorValue(String(lme.value || '')) : '-';
  const lmeUnit = lme?.units || 'USD/mt';
  const usdJpyValue = usdJpy ? formatIndicatorValue(String(usdJpy.value || '')) : '-';
  const usdJpyUnit = normalizeUnitLabel(usdJpy?.units || 'JPY/USD');

  return (
    <div className="cf-page cf-learn-page">
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
        <h1 className="cf-hero-title">銅価格の見方</h1>
        <p>LME・為替・在庫の3点から、仕入れ/在庫/売値判断の基本を整理</p>
      </header>

      <main className="cf-main">
        <section className="cf-dash-hero">
          <div className="cf-dash-hero-body">
            <h2>Copper Price Guide</h2>
            <p>銅価格を知るうえで見るポイント（LME・為替・在庫）を整理</p>
          </div>
        </section>

        <section id="three-points-summary" className="cf-latest cf-focus-section">
        <div className="cf-latest-head">
          <h3>銅価格を知るうえで見るポイント</h3>
        </div>
        <div className="cf-guide-block">
          <h4>まず押さえる3つのポイント</h4>
          <p className="cf-kpi-note">
            銅の仕入れ・在庫・売値判断でまず見るのは「LME銅価格」「USD/JPY」「Warrant / Off-warrant」の3つ。
            日次の変化と組み合わせで、目先の動きと中期の流れを読みやすくなります。
          </p>

          <div className="cf-point-grid">
            <article className="cf-point-card">
              <p className="cf-point-no">POINT 1</p>
              <p className="cf-point-title">LME銅価格</p>
              <p className="cf-point-note">世界の銅価格の基準点。価格水準と直近の増減を、在庫・為替と合わせて見る。</p>
              <div className="cf-latest-row" style={{ marginTop: 8 }}>
                <span className="cf-latest-label">最新値:</span>
                <span className="cf-latest-value">{lmeValue}</span>
                <span className="cf-latest-unit">{lmeUnit}</span>
                <span className="cf-latest-date">（{formatYmd(lme?.date)}）</span>
              </div>
            </article>

            <article className="cf-point-card">
              <p className="cf-point-no">POINT 2</p>
              <p className="cf-point-title">USD/JPY</p>
              <p className="cf-point-note">円建てコストに直結。円安は建値の上昇圧力、円高は低下要因になりやすい。</p>
              <div className="cf-latest-row" style={{ marginTop: 8 }}>
                <span className="cf-latest-label">最新値:</span>
                <span className="cf-latest-value">{usdJpyValue}</span>
                <span className="cf-latest-unit">{usdJpyUnit}</span>
                <span className="cf-latest-date">（{formatYmd(usdJpy?.date)}）</span>
              </div>
            </article>

            <article className="cf-point-card">
              <p className="cf-point-no">POINT 3</p>
              <p className="cf-point-title">Warrant / Off-warrant</p>
              <p className="cf-point-note">短期の需給温度感（Warrant）と中期の供給余力（Off-warrant）を分けて確認する。</p>
              <div className="cf-latest-row" style={{ marginTop: 8 }}>
                <span className="cf-latest-label">Warrant:</span>
                <span className="cf-latest-value">
                  {warrantDashboard.warrant.latest ? formatIndicatorValue(String(warrantDashboard.warrant.latest.value)) : '-'}
                </span>
                <span className="cf-latest-unit">t</span>
                <span className="cf-latest-date">（{formatYmd(warrantDashboard.warrant.latest?.date)}）</span>
              </div>
              <p className="cf-latest-detail">
                前日比: {fmtPct(warrantDashboard.warrant.diffPct1d)} / 7日比: {fmtPct(warrantDashboard.warrant.diffPct7d)}
              </p>
              <div className="cf-latest-row">
                <span className="cf-latest-label">Off-warrant:</span>
                <span className="cf-latest-value">
                  {warrantDashboard.offWarrant.latest
                    ? formatIndicatorValue(String(warrantDashboard.offWarrant.latest.value))
                    : '-'}
                </span>
                <span className="cf-latest-unit">t</span>
                <span className="cf-latest-date">（{formatYearMonth(warrantDashboard.offWarrant.latest?.month)}）</span>
              </div>
              <p className="cf-latest-detail">前月比: {fmtPct(warrantDashboard.offWarrant.diffPctMoM)}</p>
            </article>
          </div>

          <p id="qa-reading" className="cf-kpi-note">
            上の3ポイントの「意味」と「実務での見方」を、Q&A形式で整理。ホームでは最新値を確認し、このページでは判断の考え方を確認する。
          </p>

          <h5>POINT 1: LME銅価格</h5>
          <ol className="cf-guide-list">
            <li>
              <p className="cf-qa-q">Q. LMEってなに？</p>
              <p className="cf-qa-a">
                A. London Metal Exchange。非鉄金属の国際取引所で、銅の世界価格を判断するもっとも基本的な基準点。
              </p>
            </li>
            <li>
              <p className="cf-qa-q">Q. 日本価格への影響は？</p>
              <p className="cf-qa-a">
                A. 国内建値はLME価格と為替を土台に決まるため、LMEが上がる局面では日本の仕入れ価格にも上昇圧力がかかりやすい。
              </p>
            </li>
            <li>
              <p className="cf-qa-q">Q. LMEの見方は？</p>
              <p className="cf-qa-a">
                A. 「価格水準」と「直近の増減」をセットで見る。さらに在庫や為替と合わせると、単なる一時的な上下か、トレンド変化かを判別しやすくなる。
              </p>
            </li>
          </ol>

          <h5>POINT 2: USD/JPY</h5>
          <ol className="cf-guide-list">
            <li>
              <p className="cf-qa-q">Q. 為替ってなに？</p>
              <p className="cf-qa-a">
                A. 1ドルを買うのに必要な円の価格。銅はドル建てで取引されるため、日本では為替の影響を強く受ける。
              </p>
            </li>
            <li>
              <p className="cf-qa-q">Q. 日本価格への影響は？</p>
              <p className="cf-qa-a">
                A. 円安（USD/JPY上昇）ほど輸入コストが上がり、建値の上昇要因になりやすい。円高は逆にコスト低下要因として働く。
              </p>
            </li>
            <li>
              <p className="cf-qa-q">Q. 為替の見方は？</p>
              <p className="cf-qa-a">
                A. 日次の向きだけでなく、節目となる価格帯（例: 150円台）を確認する。短期のブレと中期の方向を分けて見ると、仕入れ判断が安定する。
              </p>
            </li>
          </ol>

          <h5>POINT 3: Warrant / Off-warrant</h5>
          <ol className="cf-guide-list">
            <li>
              <p className="cf-qa-q">Q. Warrant / Off-warrantとは？</p>
              <p className="cf-qa-a">
                A. Warrantは「すぐ引き渡し可能な在庫」、Off-warrantは「倉庫にはあるが市場に出ていない潜在在庫」。
              </p>
            </li>
            <li>
              <p className="cf-qa-q">Q. 日本価格への影響は？</p>
              <p className="cf-qa-a">
                A. Warrant減少は目先の供給ひっ迫を示し、上昇圧力になりやすい。逆にOff-warrant増加は将来の供給余力を示し、下押し要因として意識される。
              </p>
            </li>
            <li>
              <p className="cf-qa-q">Q. 見方は？</p>
              <p className="cf-qa-a">
                A. 短期はWarrant（日次）で需給の温度感を確認。中期はOff-warrant（月次）とWarrant比率を合わせて、供給余力の積み上がりを読む。
              </p>
            </li>
          </ol>

          <h5>その他（実務で合わせて見る視点）</h5>
          <ul className="cf-guide-list">
            <li>
              銅の流れ: 鉱山→精錬→電線・建設・EV・家電→スクラップ回収→銅市場へ。この循環のどこで詰まりが起きるかが、価格変動の起点になる。
            </li>
            <li>
              国内で見るべき指標: 建値、円相場、国内在庫回転、需要先の稼働感。実務では「いくらで買えるか」と「いつ売れるか」の両方を同時に見る。
            </li>
            <li>
              海外で見るべき指標: LME在庫、米中景気指標、エネルギー価格、生産国動向（チリ・ペルーなど）。海外指標は国内価格の先行シグナルとして機能しやすい。
            </li>
          </ul>

          <div
            style={{
              marginTop: 16,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <Link className="cf-pricing-link" href="/">
              今日の相場を見る
            </Link>
            <Link className="cf-pricing-link" href="/supply-chain">
              サプライチェーンを見る
            </Link>
          </div>
        </div>
      </section>

      </main>
      <SiteFooter />
    </div>
  );
}
