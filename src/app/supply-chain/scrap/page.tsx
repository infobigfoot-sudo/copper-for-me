import fs from 'node:fs/promises';
import path from 'node:path';

import Link from 'next/link';
import SupplyChainShell from '../_shell';
import SupplyChainSourceLinks from '../_sourceLinks';

type Point = { date: string; value: number };
type ScrapProxyJson = {
  series?: {
    jp_hs7404_export_tonnes?: Array<{ date?: string; value?: number }>;
    jp_hs7404_import_tonnes?: Array<{ date?: string; value?: number }>;
  };
};

function formatYmd(value?: string) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtPct(value: number | null) {
  if (value === null) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function changeClass(value: number | null) {
  if (value === null) return 'neutral';
  return value >= 0 ? 'up' : 'down';
}

function toPoints(points?: Array<{ date?: string; value?: number }>): Point[] {
  return (points || [])
    .map((p) => ({ date: String(p?.date || ''), value: Number(p?.value) }))
    .filter((p) => p.date && Number.isFinite(p.value))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function loadHs7404Series(kind: 'export' | 'import'): Promise<Point[]> {
  const p = path.join(process.cwd(), 'public', 'data', 'supply_chain_scrap_hs7404_japan.json');
  try {
    const raw = await fs.readFile(p, 'utf-8');
    const json = JSON.parse(raw) as ScrapProxyJson;
    return kind === 'export'
      ? toPoints(json.series?.jp_hs7404_export_tonnes)
      : toPoints(json.series?.jp_hs7404_import_tonnes);
  } catch {
    return [];
  }
}

function buildPolyline(points: Point[], width: number, height: number, minY: number, maxY: number) {
  const padL = 46;
  const padR = 10;
  const padT = 12;
  const padB = 24;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  return points
    .map((p, i) => {
      const x = padL + (innerW * i) / Math.max(points.length - 1, 1);
      const y = padT + innerH - ((p.value - minY) / Math.max(maxY - minY, 1)) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export default async function SupplyChainScrapPage() {
  const [exp, imp] = await Promise.all([loadHs7404Series('export'), loadHs7404Series('import')]);
  const expRecent = exp.slice(-36);
  const impRecent = imp.slice(-36);
  const xLen = Math.max(expRecent.length, impRecent.length);
  const allVals = [...expRecent.map((p) => p.value), ...impRecent.map((p) => p.value)];
  const yMin = 0;
  const yMax = allVals.length ? Math.ceil((Math.max(...allVals) * 1.1) / 50) * 50 : 100;
  const width = 920;
  const height = 320;
  const expLine = buildPolyline(expRecent, width, height, yMin, yMax);
  const impLine = buildPolyline(impRecent, width, height, yMin, yMax);
  const yTicks = [0, 1, 2, 3, 4].map((i) => yMin + ((yMax - yMin) * i) / 4);

  const latestExp = exp.at(-1);
  const prevExp = exp.at(-2);
  const latestImp = imp.at(-1);
  const prevImp = imp.at(-2);
  const expMom =
    latestExp && prevExp && prevExp.value !== 0 ? ((latestExp.value - prevExp.value) / prevExp.value) * 100 : null;
  const impMom =
    latestImp && prevImp && prevImp.value !== 0 ? ((latestImp.value - prevImp.value) / prevImp.value) * 100 : null;

  return (
    <SupplyChainShell
      title="銅サプライチェーン：スクラップ回収・流通"
      lead="HS7404（銅くず・スクラップ）の日本輸出入を月次で集計し、スクラップ流通の変化を確認するページ。回収実量そのものではなく、国際フローの proxy として使う。"
      currentSlug="scrap"
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
          / <span>スクラップ回収</span>
        </nav>

        <header style={{ marginBottom: 14 }}>
          <p style={{ margin: 0, color: '#475569', lineHeight: 1.65 }}>
            HS7404（銅くず・スクラップ）の日本輸出入を月次で集計し、スクラップ流通の変化を確認するページ。回収実量そのものではなく、国際フローの proxy として使う。
          </p>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginBottom: 16 }}>
          <article style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 12, textAlign: 'right' }}>
            <p style={{ margin: 0, color: '#475569', fontWeight: 700, textAlign: 'left' }}>日本 HS7404 輸出（月次）</p>
            <p style={{ margin: '8px 0 0', fontSize: '1.8rem', lineHeight: 1.05 }}>
              {latestExp ? latestExp.value.toLocaleString('ja-JP', { maximumFractionDigits: 0 }) : '-'}
            </p>
            <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>tonnes / {formatYmd(latestExp?.date)}</p>
            <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
              前月比:<span className={`cf-change-pill ${changeClass(expMom)}`}>{fmtPct(expMom)}</span>
            </p>
          </article>
          <article style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 12, textAlign: 'right' }}>
            <p style={{ margin: 0, color: '#475569', fontWeight: 700, textAlign: 'left' }}>日本 HS7404 輸入（月次）</p>
            <p style={{ margin: '8px 0 0', fontSize: '1.8rem', lineHeight: 1.05 }}>
              {latestImp ? latestImp.value.toLocaleString('ja-JP', { maximumFractionDigits: 0 }) : '-'}
            </p>
            <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>tonnes / {formatYmd(latestImp?.date)}</p>
            <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
              前月比:<span className={`cf-change-pill ${changeClass(impMom)}`}>{fmtPct(impMom)}</span>
            </p>
          </article>
        </section>

        <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 12, marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 10px', fontSize: '1rem' }}>なぜ日本は HS7404（銅くず）で輸出が大きく見えるのか</h2>
          <div style={{ color: '#475569', lineHeight: 1.9, display: 'grid', gap: 8 }}>
            <p style={{ margin: 0 }}>
              HS7404 は主に <strong>銅スクラップ（銅くず）</strong> の分類。電気銅や銅精鉱の輸出入とは別の分類なので、
              「日本は銅を輸入しているはず」というイメージと、HS7404 の動きが違って見えることがある。
            </p>
            <p style={{ margin: 0 }}>
              日本では製造業・設備更新・解体などからスクラップが発生し、<strong>品位の高いスクラップ（例: ピカ線）</strong> も流通する。
              そのため、資源として海外へ出す量が大きくなりやすい傾向がある。
            </p>
            <p style={{ margin: 0 }}>
              特にアジア向け需要が強い局面では、<strong>国内より海外の方が値が付きやすく</strong>、輸出が増えることがある。
              このページは、そうしたスクラップの国際フローの変化を月次で見るためのページ。
            </p>
          </div>
        </section>

        <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 12, marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: '1rem' }}>HS7404 の日本輸出入推移（月次・直近36か月）</h2>
          <p style={{ margin: '0 0 10px', color: '#64748b', fontSize: '0.9rem' }}>
            MOF 品別国別表から <code>item_code</code> が <code>7404</code> で始まる行を合算して月次推移を作成している（単位: tonnes）。
          </p>
          <div style={{ overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="auto" role="img" aria-label="HS7404 日本輸出入推移グラフ">
              <rect x="0" y="0" width={width} height={height} fill="#fff" />
              {yTicks.map((t, idx) => {
                const padL = 46;
                const padR = 10;
                const padT = 12;
                const padB = 24;
                const innerH = height - padT - padB;
                const y = padT + innerH - ((t - yMin) / Math.max(yMax - yMin, 1)) * innerH;
                return (
                  <g key={idx}>
                    <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                    <text x={42} y={y + 4} textAnchor="end" fontSize="11" fill="#64748b">
                      {Math.round(t)}
                    </text>
                  </g>
                );
              })}
              {expRecent.map((p, i) => {
                if (i % 4 !== 0) return null;
                const padL = 46;
                const padR = 10;
                const innerW = width - padL - padR;
                const x = padL + (innerW * i) / Math.max(xLen - 1, 1);
                return (
                  <text key={p.date} x={x} y={height - 6} textAnchor="middle" fontSize="10" fill="#94a3b8">
                    {p.date.slice(2, 7)}
                  </text>
                );
              })}
              <polyline fill="none" stroke="#0b8f5a" strokeWidth="2.5" points={expLine} />
              <polyline fill="none" stroke="#2563eb" strokeWidth="2.5" points={impLine} />
            </svg>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, fontSize: '0.9rem' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: '#0b8f5a', display: 'inline-block' }} />
              日本輸出（HS7404）
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: '#2563eb', display: 'inline-block' }} />
              日本輸入（HS7404）
            </span>
          </div>
        </section>

        <SupplyChainSourceLinks
          links={[{ label: '財務省通関統計（MOF）', href: 'https://www.customs.go.jp/toukei/info/' }]}
        />

        <nav
          aria-label="前後工程"
          style={{
            marginTop: 16,
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 12,
          }}
        >
          <Link
            href="/supply-chain/end-use"
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
            用途
          </Link>
          <Link
            href="/supply-chain/market"
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
            市場
          </Link>
        </nav>

      </div>
    </SupplyChainShell>
  );
}
