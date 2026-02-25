import fs from 'node:fs/promises';
import path from 'node:path';

import Link from 'next/link';
import SupplyChainShell from '../_shell';
import SupplyChainSourceLinks from '../_sourceLinks';

function parseNum(v?: string) {
  if (!v) return null;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}
type MiningProxyJson = {
  series?: {
    chile_mine_output_total_thousand_tmf_cochilco?: Array<{ date?: string; value?: number }>;
    peru_mine_output_total_tmf_bem?: Array<{ date?: string; value?: number }>;
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

type MonthlyPoint = {
  date: string;
  value: number;
};

function dedupeMonthlyPoints(
  points: MonthlyPoint[],
  opts?: { maxReasonable?: number },
): MonthlyPoint[] {
  const grouped = new Map<string, number[]>();
  for (const p of points) {
    const arr = grouped.get(p.date) ?? [];
    arr.push(p.value);
    grouped.set(p.date, arr);
  }
  const out: MonthlyPoint[] = [];
  for (const [date, values] of grouped.entries()) {
    const valid =
      opts?.maxReasonable !== undefined ? values.filter((v) => v <= opts.maxReasonable!) : values;
    const candidates = valid.length ? valid : values;
    // Duplicates occasionally include annual/YTD-like outliers; prefer the lower monthly-like value.
    const picked = [...candidates].sort((a, b) => a - b)[0];
    out.push({ date, value: picked });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function toMonthlyPoints(points?: Array<{ date?: string; value?: number }>): MonthlyPoint[] {
  return dedupeMonthlyPoints(
    (points || [])
      .map((p) => ({ date: String(p?.date || ''), value: Number(p?.value) }))
      .filter((p) => p.date && Number.isFinite(p.value)),
  );
}

async function loadMiningProxy() {
  const p = path.join(process.cwd(), 'public', 'data', 'supply_chain_mining_chile_peru.json');
  try {
    const raw = await fs.readFile(p, 'utf-8');
    const json = JSON.parse(raw) as MiningProxyJson;
    return {
      chile: toMonthlyPoints(json.series?.chile_mine_output_total_thousand_tmf_cochilco),
      peru: toMonthlyPoints(json.series?.peru_mine_output_total_tmf_bem),
    };
  } catch {
    return { chile: [], peru: [] };
  }
}

function makeIndexedSeries(points: MonthlyPoint[], take = 24) {
  const recent = points.slice(-take);
  const base = recent[0]?.value ?? null;
  return recent.map((p) => ({
    ...p,
    index: base && base !== 0 ? (p.value / base) * 100 : null,
  }));
}

function buildPolyline(
  points: Array<{ date: string; index: number | null }>,
  width: number,
  height: number,
  minY: number,
  maxY: number,
) {
  const padL = 40;
  const padR = 10;
  const padT = 12;
  const padB = 24;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const valid = points.map((p) => p.index).filter((v): v is number => v !== null);
  if (!valid.length || maxY <= minY) return '';
  return points
    .map((p, i) => {
      if (p.index === null) return null;
      const x = padL + (innerW * i) / Math.max(points.length - 1, 1);
      const y = padT + innerH - ((p.index - minY) / (maxY - minY)) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(' ');
}

export default async function SupplyChainMiningPage() {
  const mining = await loadMiningProxy();
  const chileRaw = mining.chile;
  const peruRaw = mining.peru;
  const chile = makeIndexedSeries(chileRaw, 24);
  const peru = makeIndexedSeries(peruRaw, 24);
  const mergedY = [...chile.map((p) => p.index), ...peru.map((p) => p.index)].filter((v): v is number => v !== null);
  const yMinRaw = mergedY.length ? Math.min(...mergedY) : 80;
  const yMaxRaw = mergedY.length ? Math.max(...mergedY) : 120;
  const yMin = Math.floor((yMinRaw - 2) / 5) * 5;
  const yMax = Math.ceil((yMaxRaw + 2) / 5) * 5;
  const width = 920;
  const height = 320;
  const chileLine = buildPolyline(chile, width, height, yMin, yMax);
  const peruLine = buildPolyline(peru, width, height, yMin, yMax);
  const yTicks = [0, 1, 2, 3, 4].map((i) => yMin + ((yMax - yMin) * i) / 4);
  const latestChile = chileRaw.at(-1);
  const latestPeru = peruRaw.at(-1);
  const latestChilePrev = chileRaw.at(-2);
  const latestPeruPrev = peruRaw.at(-2);
  const chileMom =
    latestChile && latestChilePrev && latestChilePrev.value !== 0
      ? ((latestChile.value - latestChilePrev.value) / latestChilePrev.value) * 100
      : null;
  const peruMom =
    latestPeru && latestPeruPrev && latestPeruPrev.value !== 0
      ? ((latestPeru.value - latestPeruPrev.value) / latestPeruPrev.value) * 100
      : null;

  return (
    <SupplyChainShell
      title="銅サプライチェーン：鉱山（上流供給）"
      lead="チリ・ペルーの月次鉱山生産を上流供給の基礎指標として確認する。比較しやすいよう、グラフは直近24か月を指数化（初月=100）で表示する。"
      currentSlug="mining"
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
        / <span>鉱山</span>
      </nav>

      <header style={{ marginBottom: 14 }}>
        <p style={{ margin: 0, color: '#475569', lineHeight: 1.65 }}>
          チリ・ペルーの月次鉱山生産を上流供給の基礎指標として確認する。比較しやすいよう、グラフは直近24か月を指数化（初月=100）で表示する。
        </p>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginBottom: 16 }}>
        <article style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 12, textAlign: 'right' }}>
          <p style={{ margin: 0, color: '#475569', fontWeight: 700, textAlign: 'left' }}>チリ鉱山生産（COCHILCO）</p>
          <p style={{ margin: '8px 0 0', fontSize: '1.8rem', lineHeight: 1.05 }}>{latestChile ? latestChile.value.toFixed(1) : '-'}</p>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>thousand TMF / {formatYmd(latestChile?.date)}</p>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            前月比:
            <span className={`cf-change-pill ${changeClass(chileMom)}`}>{fmtPct(chileMom)}</span>
          </p>
        </article>
        <article style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 12, textAlign: 'right' }}>
          <p style={{ margin: 0, color: '#475569', fontWeight: 700, textAlign: 'left' }}>ペルー鉱山生産（BEM）</p>
          <p style={{ margin: '8px 0 0', fontSize: '1.8rem', lineHeight: 1.05 }}>{latestPeru ? latestPeru.value.toLocaleString('ja-JP', { maximumFractionDigits: 0 }) : '-'}</p>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>TMF / {formatYmd(latestPeru?.date)}</p>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            前月比:
            <span className={`cf-change-pill ${changeClass(peruMom)}`}>{fmtPct(peruMom)}</span>
          </p>
        </article>
      </section>

      <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 12, marginBottom: 14 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '1rem' }}>チリ・ペルー鉱山が重要な理由（かんたん説明）</h2>
        <p style={{ margin: '0 0 10px', color: '#475569', lineHeight: 1.65, fontSize: '0.9rem' }}>
          チリとペルーは世界の銅供給で非常に重要な上流産地。とくにチリは世界最大級、ペルーも上位の生産国で、この2か国の生産動向は世界の銅需給や価格に大きく影響する。
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
          <div style={{ border: '1px solid #edf0f5', borderRadius: 8, padding: 8, background: '#fbfcfe' }}>
            <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#334155' }}>鉱山から電気銅まで（主な流れ）</p>
            <ol style={{ margin: 0, paddingLeft: 18, color: '#475569', lineHeight: 1.6, fontSize: '0.9rem' }}>
              <li>採掘・破砕（鉱石を掘って細かくする）</li>
              <li>選鉱（銅分を濃縮して銅精鉱を作る）</li>
              <li>製錬（溶錬して粗銅を作る）</li>
              <li>電解精製（高純度の電気銅＝カソードにする）</li>
            </ol>
          </div>
          <div style={{ border: '1px solid #edf0f5', borderRadius: 8, padding: 8, background: '#fbfcfe' }}>
            <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#334155' }}>チリで広く使われる別ルート（SX-EW法）</p>
            <p style={{ margin: 0, color: '#475569', lineHeight: 1.6, fontSize: '0.9rem' }}>
              酸化鉱では、浸出（リーチング）で銅を溶かし出し、溶媒抽出・電解採取（SX-EW）で直接カソードを得る方法も使われる。熱を使う製錬工程を通らないため、鉱石の性質によってはコスト面で有利。
            </p>
          </div>
        </div>
        <div style={{ border: '1px solid #edf0f5', borderRadius: 8, padding: 8, background: '#fbfcfe', marginTop: 12 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#334155' }}>日本への出荷と流通（かんたん補足）</p>
          <p style={{ margin: 0, color: '#475569', lineHeight: 1.6, fontSize: '0.9rem' }}>
            鉱山で生産された銅は、精鉱やカソードとして港へ運ばれ、海上輸送で日本を含む消費国へ届く。日本ではメーカーが受け入れた後、電線・電子部品・各種加工材へ流れていく。
          </p>
        </div>
        <div style={{ border: '1px solid #edf0f5', borderRadius: 8, padding: 8, background: '#fbfcfe', marginTop: 12 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#334155' }}>鉱山からの主な3ルート（A/B/C）</p>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, background: '#fff' }}>
              <p style={{ margin: 0, fontWeight: 700, color: '#1f2937', fontSize: '0.9rem' }}>A. 掘るだけ（山側）</p>
              <p style={{ margin: '4px 0 0', color: '#475569', fontSize: '0.9rem' }}>
                採掘 → 選鉱（銅分を濃縮）
              </p>
              <p style={{ margin: '4px 0 0', color: '#0f172a', fontWeight: 700, fontSize: '0.9rem' }}>出荷物: 銅精鉱（コンセントレート）</p>
              <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 12 }}>
                ※ 純度は概ね3割前後の砂状原料。日本などの製錬所へ運ばれることが多い。
              </p>
            </div>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, background: '#fff' }}>
              <p style={{ margin: 0, fontWeight: 700, color: '#1f2937', fontSize: '0.9rem' }}>B. 溶かして精製（一貫体制）</p>
              <p style={{ margin: '4px 0 0', color: '#475569', fontSize: '0.9rem' }}>
                採掘 → 選鉱 → 溶錬 → 電解精製
              </p>
              <p style={{ margin: '4px 0 0', color: '#0f172a', fontWeight: 700, fontSize: '0.9rem' }}>出荷物: 電気銅（カソード）</p>
              <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 12 }}>
                ※ 純度99.99%級。完成品に近い形で世界へ流通する。
              </p>
            </div>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, background: '#fff' }}>
              <p style={{ margin: 0, fontWeight: 700, color: '#1f2937', fontSize: '0.9rem' }}>C. 溶かさず抽出（SX-EW法）</p>
              <p style={{ margin: '4px 0 0', color: '#475569', fontSize: '0.9rem' }}>
                採掘 → 浸出（リーチング） → 電解採取
              </p>
              <p style={{ margin: '4px 0 0', color: '#0f172a', fontWeight: 700, fontSize: '0.9rem' }}>出荷物: 電気銅（カソード）</p>
              <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 12 }}>
                ※ 主にチリなどの乾燥地帯で広く使われる手法。
              </p>
            </div>
          </div>
        </div>
        <p style={{ margin: '10px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
          ※ このページは「鉱山生産量」を主に見る。電気銅の完成量や最終需要は、精錬・用途・市場ページと合わせて確認する。
        </p>
        <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
          ※ 現有データだけでは、日本の電気銅が「精鉱・粗銅・スクラップのどの配合で作られたか」までは特定できない（このページは上流生産量の把握が中心）。
        </p>
      </section>

      <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 12, marginBottom: 14 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '1rem' }}>チリ・ペルー鉱山生産（月次、直近24か月・指数化）</h2>
        <p style={{ margin: '0 0 10px', color: '#64748b', fontSize: '0.9rem' }}>
          指数化（初月=100）により、国ごとの増減の方向感を比較しやすくしている。実数値は上のカードを参照。
        </p>
        <div style={{ overflowX: 'auto' }}>
          <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="auto" role="img" aria-label="チリ・ペルー鉱山生産指数グラフ">
            <rect x="0" y="0" width={width} height={height} fill="#fff" />
            {yTicks.map((t, idx) => {
              const padL = 40;
              const padR = 10;
              const padT = 12;
              const padB = 24;
              const innerH = height - padT - padB;
              const y = padT + innerH - ((t - yMin) / Math.max(yMax - yMin, 1)) * innerH;
              return (
                <g key={idx}>
                  <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                  <text x={36} y={y + 4} textAnchor="end" fontSize="11" fill="#64748b">
                    {Math.round(t)}
                  </text>
                </g>
              );
            })}
            {chile.map((p, i) => {
              if (i % 3 !== 0) return null;
              const padL = 40;
              const padR = 10;
              const padT = 12;
              const padB = 24;
              const innerW = width - padL - padR;
              const x = padL + (innerW * i) / Math.max(chile.length - 1, 1);
              return (
                <text key={p.date} x={x} y={height - 6} textAnchor="middle" fontSize="10" fill="#94a3b8">
                  {p.date.slice(2, 7)}
                </text>
              );
            })}
            <polyline fill="none" stroke="#0b8f5a" strokeWidth="2.5" points={chileLine} />
            <polyline fill="none" stroke="#2563eb" strokeWidth="2.5" points={peruLine} />
          </svg>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, fontSize: '0.9rem' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: '#0b8f5a', display: 'inline-block' }} />
            チリ（COCHILCO）
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: '#2563eb', display: 'inline-block' }} />
            ペルー（BEM）
          </span>
        </div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <h2 style={{ marginBottom: 8, fontSize: '1rem' }}>このページの限界・注意点</h2>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.65 }}>
          <li>チリ/ペルー中心のため、世界の上流供給全体を直接カバーするわけではない。</li>
          <li>COCHILCO（千TMF）とBEM（TMF）は単位スケールが異なるため、グラフは指数化して比較している。</li>
          <li>需給判断は精錬・在庫・価格ページと合わせて見る前提。</li>
        </ul>
      </section>

      <SupplyChainSourceLinks
        links={[
          { label: 'COCHILCO', href: 'https://www.cochilco.cl/' },
          { label: 'INE Chile', href: 'https://www.ine.gob.cl/' },
          { label: 'Peru政府統計', href: 'https://www.gob.pe/' },
        ]}
      />

      <nav style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        <Link href="/supply-chain" className="cf-supply-bottom-link cf-supply-bottom-link--left" style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, textDecoration: 'none', color: 'inherit' }}>
          一覧へ戻る
        </Link>
        <Link href="/supply-chain/refining" className="cf-supply-bottom-link cf-supply-bottom-link--right" style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, textDecoration: 'none', color: 'inherit', textAlign: 'right' }}>
          精錬
        </Link>
      </nav>
      </div>
    </SupplyChainShell>
  );
}
