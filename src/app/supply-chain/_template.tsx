import Link from 'next/link';
import { SUPPLY_CHAIN_PAGES, SupplyChainPageConfig } from './_pages';
import SupplyChainShell from './_shell';

type Props = {
  page: SupplyChainPageConfig;
};

export default function SupplyChainPageTemplate({ page }: Props) {
  const idx = SUPPLY_CHAIN_PAGES.findIndex((p) => p.slug === page.slug);
  const prev = idx > 0 ? SUPPLY_CHAIN_PAGES[idx - 1] : null;
  const next = idx >= 0 && idx < SUPPLY_CHAIN_PAGES.length - 1 ? SUPPLY_CHAIN_PAGES[idx + 1] : null;

  return (
    <SupplyChainShell title={page.title} lead={page.lead} currentSlug={page.slug}>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: 0 }}>
      <nav style={{ fontSize: 14, marginBottom: 12, color: '#64748b' }}>
        <Link href="/" style={{ color: 'inherit' }}>
          トップ
        </Link>{' '}
        /{' '}
        <Link href="/supply-chain" style={{ color: 'inherit' }}>
          銅サプライチェーン
        </Link>{' '}
        / <span>{page.shortTitle}</span>
      </nav>

      <header style={{ marginBottom: 20 }}>
        <p style={{ margin: 0, color: '#475569', lineHeight: 1.8 }}>{page.lead}</p>
      </header>

      <section style={{ marginBottom: 16 }}>
        <h2 style={{ marginBottom: 8, fontSize: '1rem' }}>見出しテンプレ（実装用）</h2>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
          {page.sections.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>

      <section style={{ marginBottom: 16 }}>
        <h2 style={{ marginBottom: 8, fontSize: '1rem' }}>このページの限界・注意点</h2>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          {page.limits.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>

      <section
        style={{
          border: '1px dashed #cbd5e1',
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
        }}
      >
        <h2 style={{ margin: '0 0 8px', fontSize: '1rem' }}>実装メモ（次段）</h2>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          <li>日次 / 月次 / 四半期の粒度バッジを表示</li>
          <li>直接データ / proxy のラベルを各指標に付与</li>
          <li>主要グラフ（直近12〜24か月）を追加</li>
          <li>前後工程へのリンクを固定表示</li>
        </ul>
      </section>

      <nav
        aria-label="前後工程"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 12,
        }}
      >
        <div
          className="cf-supply-bottom-link cf-supply-bottom-link--left"
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: 14,
            minHeight: 64,
            background: '#fff',
          }}
        >
          {prev ? (
            <Link href={`/supply-chain/${prev.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              {prev.shortTitle}
            </Link>
          ) : (
            <span style={{ color: '#94a3b8' }}>なし</span>
          )}
        </div>
        <div
          className="cf-supply-bottom-link cf-supply-bottom-link--right"
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: 14,
            minHeight: 64,
            background: '#fff',
            textAlign: 'right',
          }}
        >
          {next ? (
            <Link href={`/supply-chain/${next.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              {next.shortTitle}
            </Link>
          ) : (
            <span style={{ color: '#94a3b8' }}>なし</span>
          )}
        </div>
      </nav>
      </div>
    </SupplyChainShell>
  );
}
