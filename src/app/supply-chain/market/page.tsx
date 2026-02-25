import Link from 'next/link';

import { formatIndicatorValue, getEconomyIndicators } from '@/lib/economy';
import { getWarrantDashboardData } from '@/lib/warrant_dashboard';
import SupplyChainShell from '../_shell';
import SupplyChainSourceLinks from '../_sourceLinks';

function formatYmd(value?: string) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseNum(v?: string) {
  if (!v) return null;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function fmtPct(value: number | null) {
  if (value === null) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function changeClass(value: number | null) {
  if (value === null) return 'neutral';
  return value >= 0 ? 'up' : 'down';
}

export default async function SupplyChainMarketPage() {
  const [economy, warrant] = await Promise.all([getEconomyIndicators(), getWarrantDashboardData()]);
  const indicators = [...(economy.fred || []), ...(economy.alpha || [])];
  const byId = new Map(indicators.map((i) => [i.id, i]));

  const lmeUsd = byId.get('lme_copper_usd');
  const usdJpy = byId.get('usd_jpy');
  const dgs10 = byId.get('DGS10');
  const wti = byId.get('DCOILWTICO');
  const brent = byId.get('DCOILBRENTEU');
  const vix = byId.get('VIXCLS');
  const dxy = byId.get('DTWEXBGS');

  const lmeUsdNum = parseNum(lmeUsd?.value);
  const usdJpyNum = parseNum(usdJpy?.value);
  const lmeJpyApprox =
    lmeUsdNum !== null && usdJpyNum !== null ? Math.round(lmeUsdNum * usdJpyNum).toLocaleString('ja-JP') : '-';

  const statCards = [
    { label: 'LME銅（USD建て）', value: lmeUsd ? formatIndicatorValue(lmeUsd.value) : '-', unit: lmeUsd?.units || 'USD/mt', date: formatYmd(lmeUsd?.date), pct: lmeUsd?.changePercent || '-' },
    {
      label: '国内建値',
      value: warrant.copperTate.latest ? formatIndicatorValue(String(warrant.copperTate.latest.value)) : '-',
      unit: 'JPY/mt',
      date: formatYmd(warrant.copperTate.latest?.date),
      pct: fmtPct(warrant.copperTate.diffPct1d),
    },
    { label: 'USD/JPY', value: usdJpy ? formatIndicatorValue(usdJpy.value) : '-', unit: usdJpy?.units || 'JPY/USD', date: formatYmd(usdJpy?.date), pct: usdJpy?.changePercent || '-' },
    { label: '米10年金利', value: dgs10 ? formatIndicatorValue(dgs10.value) : '-', unit: dgs10?.units || '%', date: formatYmd(dgs10?.date), pct: dgs10?.changePercent || '-' },
    { label: 'WTI', value: wti ? formatIndicatorValue(wti.value) : '-', unit: wti?.units || 'USD/bbl', date: formatYmd(wti?.date), pct: wti?.changePercent || '-' },
    { label: 'Brent', value: brent ? formatIndicatorValue(brent.value) : '-', unit: brent?.units || 'USD/bbl', date: formatYmd(brent?.date), pct: brent?.changePercent || '-' },
  ];

  return (
    <SupplyChainShell
      title="銅サプライチェーン：市場（LME・在庫・建値・為替）"
      lead="LME価格・在庫・国内建値・為替をまとめて見て、銅サプライチェーンの最終価格形成を確認するページ。"
      currentSlug="market"
    >
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: 0 }}>
      <nav style={{ fontSize: '0.9rem', marginBottom: 12, color: '#64748b' }}>
        <Link href="/" style={{ color: 'inherit' }}>
          トップ
        </Link>{' '}
        /{' '}
        <Link href="/supply-chain" style={{ color: 'inherit' }}>
          銅サプライチェーン
        </Link>{' '}
        / <span>市場</span>
      </nav>

      <header style={{ marginBottom: 14 }}>
        <p style={{ margin: 0, color: '#475569', lineHeight: 1.65 }}>
          LME価格・在庫・国内建値・為替をまとめて見て、銅サプライチェーンの最終価格形成を確認するページ。
        </p>
      </header>

      <section style={{ marginBottom: 12, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', padding: 10 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: '1rem' }}>最新の価格は？</h2>
        <p style={{ margin: '0 0 10px', color: '#64748b', fontSize: '0.9rem' }}>LME（USD建て） / 国内建値（JPY建て） / 表示基準日: {economy.cacheBucketJst || '-'}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          {statCards.map((card) => {
            const n = Number(String(card.pct).replace('%', '').replace('+', ''));
            const validPct = Number.isFinite(n) && card.pct !== '-';
            const pillClass = changeClass(validPct ? (String(card.pct).startsWith('-') ? -Math.abs(n) : Math.abs(n)) : null);
            return (
              <article key={card.label} style={{ border: '1px solid #edf0f5', borderRadius: 8, padding: 8, background: '#fbfcfe' }}>
                <p style={{ margin: 0, color: '#475569', fontWeight: 700 }}>{card.label}</p>
                <p style={{ margin: '6px 0 8px', color: '#64748b', fontSize: '0.9rem', textAlign: 'right' }}>
                  前回比:
                  <span className={`cf-change-pill ${pillClass}`} style={{ fontSize: 12 }}>
                    {card.pct}
                  </span>
                </p>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 8, whiteSpace: 'nowrap' }}>
                  <p style={{ margin: 0, fontSize: '1.8rem', lineHeight: 1.05, fontFamily: "'Avenir Next Condensed','Franklin Gothic Medium',sans-serif" }}>{card.value}</p>
                  <small style={{ color: '#94a3b8' }}>{card.unit}</small>
                </div>
                <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: '0.9rem', textAlign: 'right' }}>{card.date}</p>
              </article>
            );
          })}
        </div>
        <p style={{ margin: '10px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
          参考: LME円換算（概算） {lmeJpyApprox} JPY/mt（LME USD × USD/JPY）
        </p>
      </section>

      <section style={{ marginBottom: 12, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', padding: 10 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '1rem' }}>在庫・需給の見方（簡易）</h2>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.65 }}>
          <li>Warrant銅在庫（最新）: {warrant.warrant.latest ? formatIndicatorValue(String(warrant.warrant.latest.value)) : '-'} mt</li>
          <li>Warrant 20日平均比: {warrant.warrant.ma20 && warrant.warrant.latest ? fmtPct(((warrant.warrant.latest.value - warrant.warrant.ma20) / warrant.warrant.ma20) * 100) : '-'}</li>
          <li>Warrant比率（月次）: {warrant.ratio !== null ? `${(warrant.ratio * 100).toFixed(1)}%` : '-'}</li>
        </ul>
      </section>

      <section style={{ marginBottom: 16, border: '1px dashed #cbd5e1', borderRadius: 12, padding: 14 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '1rem' }}>主要指標（市場系）</h2>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.65 }}>
          {[dxy, vix].filter(Boolean).map((ind) => (
            <li key={ind!.id}>
              {ind!.name}: {formatIndicatorValue(ind!.value || '-')} {ind!.units || ''}（{formatYmd(ind!.date)}）
            </li>
          ))}
        </ul>
      </section>

      <SupplyChainSourceLinks
        links={[
          { label: 'LME', href: 'https://www.lme.com/' },
          { label: 'FRED', href: 'https://fred.stlouisfed.org/' },
          { label: 'Alpha Vantage', href: 'https://www.alphavantage.co/' },
          { label: 'JX金属（建値）', href: 'https://www.jx-nmm.com/cuprice/' },
        ]}
      />

      <nav style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        <Link href="/supply-chain/scrap" className="cf-supply-bottom-link cf-supply-bottom-link--left" style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, textDecoration: 'none', color: 'inherit' }}>
          スクラップ回収
        </Link>
        <Link href="/supply-chain" className="cf-supply-bottom-link cf-supply-bottom-link--right" style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, textDecoration: 'none', color: 'inherit', textAlign: 'right' }}>
          一覧へ戻る
        </Link>
      </nav>
      </div>
    </SupplyChainShell>
  );
}
