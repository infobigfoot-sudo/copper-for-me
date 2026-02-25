import fs from 'node:fs/promises';
import path from 'node:path';

import Link from 'next/link';

import SupplyChainShell from '../_shell';
import SupplyChainSourceLinks from '../_sourceLinks';

type Point = { date: string; value: number };

function parseNum(v?: string) {
  if (!v) return null;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function csvSplitLine(line: string) {
  return line.split(',').map((x) => x.trim());
}

function formatYmd(value?: string) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function makeIndexed(points: Point[], take = 24) {
  const recent = points.slice(-take);
  const base = recent[0]?.value ?? null;
  return recent.map((p) => ({ ...p, index: base && base !== 0 ? (p.value / base) * 100 : null }));
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
  return points
    .map((p, i) => {
      if (p.index === null) return null;
      const x = padL + (innerW * i) / Math.max(points.length - 1, 1);
      const y = padT + innerH - ((p.index - minY) / Math.max(maxY - minY, 1)) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(' ');
}

function sumSeriesByDate(seriesList: Point[][]): Point[] {
  const m = new Map<string, number>();
  for (const series of seriesList) {
    for (const p of series) m.set(p.date, (m.get(p.date) ?? 0) + p.value);
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ date, value }));
}

async function loadEndUseMetiCopperProxy() {
  const dir = path.join(process.cwd(), '..', '..', 'stock-data-processor', 'data', 'japan', 'METI_COPPER');
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => /^meti_copper_long_\d{4}\.csv$/.test(f)).sort();
  } catch {
    // Vercel本番にはローカル集計元ディレクトリが存在しないため、空データで継続する。
    return {
      wireRod: [],
      copperProducts: [],
      brassProducts: [],
    };
  }

  const buckets: Record<string, Point[]> = {
    wireRod: [],
    copperProducts: [],
    brassProducts: [],
  };

  const copperProductNames = new Set(['銅製品(板)', '銅製品(条)', '銅製品(管)', '銅製品(棒・線)']);
  const brassProductNames = new Set(['黄銅製品(板)', '黄銅製品(条)', '黄銅製品(管)', '黄銅製品(棒・線)']);
  const wireRodNames = new Set(['銅裸線(電線メーカー向け心線)', '銅裸線(ユーザー向け)']);

  for (const file of files) {
    let raw = '';
    try {
      raw = await fs.readFile(path.join(dir, file), 'utf-8');
    } catch {
      continue;
    }
    const [header, ...lines] = raw.split(/\r?\n/).filter(Boolean);
    const cols = csvSplitLine(header).map((c) => c.replace(/^\ufeff/, ''));
    const idx = {
      itemName: cols.indexOf('品目名称'),
      metricName: cols.indexOf('アイテム名'),
      date: cols.indexOf('date'),
      value: cols.indexOf('value'),
    };
    if (Object.values(idx).some((v) => v < 0)) continue;
    for (const line of lines) {
      const cells = csvSplitLine(line);
      const itemName = cells[idx.itemName];
      const metricName = cells[idx.metricName];
      if (metricName !== '販売数量') continue;
      const date = cells[idx.date];
      const value = parseNum(cells[idx.value]);
      if (!date || value === null) continue;

      if (wireRodNames.has(itemName)) buckets.wireRod.push({ date, value });
      if (copperProductNames.has(itemName)) buckets.copperProducts.push({ date, value });
      if (brassProductNames.has(itemName)) buckets.brassProducts.push({ date, value });
    }
  }

  return {
    wireRod: sumSeriesByDate([buckets.wireRod]),
    copperProducts: sumSeriesByDate([buckets.copperProducts]),
    brassProducts: sumSeriesByDate([buckets.brassProducts]),
  };
}

export default async function SupplyChainEndUsePage() {
  const metiProxy = await loadEndUseMetiCopperProxy();
  const width = 920;
  const height = 300;
  const wireIdx = makeIndexed(metiProxy.wireRod, 24);
  const copperIdx = makeIndexed(metiProxy.copperProducts, 24);
  const brassIdx = makeIndexed(metiProxy.brassProducts, 24);
  const ys = [...wireIdx, ...copperIdx, ...brassIdx].map((p) => p.index).filter((v): v is number => v !== null);
  const yMin = ys.length ? Math.floor((Math.min(...ys) - 3) / 5) * 5 : 90;
  const yMax = ys.length ? Math.ceil((Math.max(...ys) + 3) / 5) * 5 : 120;
  const wireLine = buildPolyline(wireIdx, width, height, yMin, yMax);
  const copperLine = buildPolyline(copperIdx, width, height, yMin, yMax);
  const brassLine = buildPolyline(brassIdx, width, height, yMin, yMax);
  const ticks = [0, 1, 2, 3, 4].map((i) => yMin + ((yMax - yMin) * i) / 4);
  const latestWire = metiProxy.wireRod.at(-1);
  const latestCopper = metiProxy.copperProducts.at(-1);
  const latestBrass = metiProxy.brassProducts.at(-1);
  return (
    <SupplyChainShell
      title="銅サプライチェーン：用途（電線・建設・EV・家電）"
      lead="このページは、最終用途の実測値ではなく、中間材（電線材・伸銅品・黄銅品・鋳物など）の動きから用途側の地合いを読むためのページ。"
      currentSlug="end-use"
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
          / <span>用途</span>
        </nav>

        <header style={{ marginBottom: 14 }}>
          <p style={{ margin: 0, color: '#475569', lineHeight: 1.65 }}>
            建設・EV・家電などの最終用途で「実際に何トン使われたか」は現有データだけでは直接は分からない。その代わり、このページでは用途に向かう中間材の動きから、需要の強弱を proxy（近似）として読み取る。
          </p>
        </header>

        <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 12, marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: '1rem' }}>このページの前提（最終用途の実測ではなく proxy）</h2>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.65, color: '#475569' }}>
            <li>最終用途（建設・EV・家電など）の銅消費量を直接示す継続系列は未整備。</li>
            <li>そのため、電線材・伸銅品・黄銅品・鋳物などの「中間材」の動きから用途側を読む。</li>
            <li>増減の解釈は、景気・在庫調整・輸出入・価格要因も合わせて見る前提。</li>
          </ul>
        </section>

        <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 12, marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: '1rem' }}>中間材 → どのメーカー・用途に流れるか（整理カード）</h2>
          <p style={{ margin: '0 0 10px', color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6 }}>
            実際の最終用途トン数を直接示すものではなく、「どの工程・どのメーカーに流れやすい材料か」を整理した実務向けの読み方。
            中間材ごとの役割と、用途・メーカーへのつながりをこのカード群でまとめて確認する。
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            {[
              {
                material: '銅裸線（心線 / ユーザー向け）',
                maker: '電線メーカー',
                use: '電力ケーブル / 建設配線 / 設備配線 / インフラ',
                read: '電線材の動きとして、建設・設備更新・インフラ需要の proxy に使いやすい',
              },
              {
                material: '銅製品（板 / 条 / 管 / 棒・線）',
                maker: '伸銅メーカー・部品加工メーカー',
                use: '電子部品 / 熱交換器 / 配管 / 機械部材',
                read: '幅広い加工用途に流れるため、製造業全体の地合いを見る proxy として使う',
              },
              {
                material: '黄銅製品（板 / 条 / 管 / 棒・線）',
                maker: '合金加工メーカー',
                use: '建材 / 水回り部品 / バルブ / 継手 / 機械部品',
                read: '建材・機械向けの中間材として、設備投資や住宅関連の動きを補助的に読む',
              },
              {
                material: '銅・銅合金鋳物',
                maker: '鋳物メーカー・部品メーカー',
                use: '機械部品 / 設備部品 / 産業機器',
                read: 'より部品に近い段階の動きとして、設備・機械需要の proxy に向く',
              },
              {
                material: '銅合金塊',
                maker: '鋳造・合金加工メーカー',
                use: '再溶解して鋳造品・加工材へ',
                read: '合金加工の前段原料として、鋳造・再加工の動きを見る補助指標になる',
              },
            ].map((item) => (
              <article
                key={item.material}
                style={{
                  border: '1px solid #edf0f5',
                  borderRadius: 10,
                  background: '#fbfcfe',
                  padding: 12,
                }}
              >
                <p style={{ margin: '0 0 8px', color: '#0f172a', fontWeight: 700 }}>{item.material}</p>
                <div style={{ display: 'grid', gap: 6 }}>
                  <p style={{ margin: 0, color: '#334155', fontSize: '0.9rem' }}>
                    <strong>主に使う側:</strong> {item.maker}
                  </p>
                  <p style={{ margin: 0, color: '#334155', fontSize: '0.9rem' }}>
                    <strong>つながりやすい用途:</strong> {item.use}
                  </p>
                  <p style={{ margin: 0, color: '#475569', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    <strong>このページでの見方:</strong> {item.read}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>


        <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 12, marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: '1rem' }}>METI_COPPER 実データ（販売数量, 直近24か月・指数化）</h2>
          <p style={{ margin: '0 0 10px', color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6 }}>
            まずは用途に近い proxy として、販売数量ベースで指数化（初月=100）した方向感を比較する。実数値は下のカードを参照。
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginBottom: 12 }}>
            {[
              { label: '銅裸線（電線材）販売数量 合計', point: latestWire, color: '#2563eb', help: '電線・配線需要の proxy' },
              { label: '銅製品（板/条/管/棒・線）販売数量 合計', point: latestCopper, color: '#0f766e', help: '加工材需要の proxy' },
              { label: '黄銅製品（板/条/管/棒・線）販売数量 合計', point: latestBrass, color: '#b45309', help: '合金加工需要の proxy' },
            ].map((c) => (
              <article key={c.label} style={{ border: '1px solid #edf0f5', borderRadius: 8, padding: 8, background: '#fbfcfe', textAlign: 'right' }}>
                <p style={{ margin: 0, color: '#475569', fontWeight: 700, textAlign: 'left' }}>{c.label}</p>
                <p style={{ margin: '8px 0 0', fontSize: '1.5rem', color: c.color }}>{c.point ? c.point.value.toLocaleString('ja-JP') : '-'}</p>
                <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>t / {formatYmd(c.point?.date)}</p>
                <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 12 }}>{c.help}</p>
              </article>
            ))}
          </div>
          <div style={{ border: '1px solid #edf0f5', borderRadius: 8, background: '#fbfcfe', padding: 8 }}>
            <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="auto" role="img" aria-label="用途proxyの月次指数化グラフ">
              <rect x="0" y="0" width={width} height={height} fill="#fbfcfe" rx="8" />
              {ticks.map((t, i) => {
                const padT = 12;
                const padB = 24;
                const innerH = height - padT - padB;
                const y = padT + innerH - ((t - yMin) / Math.max(yMax - yMin, 1)) * innerH;
                return (
                  <g key={i}>
                    <line x1="40" x2={width - 10} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
                    <text x="4" y={y + 4} fontSize="11" fill="#64748b">
                      {t.toFixed(0)}
                    </text>
                  </g>
                );
              })}
              <polyline fill="none" stroke="#2563eb" strokeWidth="2.4" points={wireLine} />
              <polyline fill="none" stroke="#0f766e" strokeWidth="2.4" points={copperLine} />
              <polyline fill="none" stroke="#b45309" strokeWidth="2.4" points={brassLine} />
              {[wireIdx, copperIdx, brassIdx].map((series, si) => {
                const padL = 40;
                const padR = 10;
                const padB = 24;
                const innerW = width - padL - padR;
                const label = series.at(-1)?.date?.slice(0, 7) ?? '';
                const x = padL + (innerW * (series.length - 1)) / Math.max(series.length - 1, 1);
                return label ? (
                  <text key={`${si}-${label}`} x={x} y={height - 6} textAnchor="middle" fontSize="10" fill="#64748b">
                    {label}
                  </text>
                ) : null;
              })}
            </svg>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8, fontSize: 12, color: '#475569' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: '#2563eb', display: 'inline-block' }} />
                銅裸線（電線材）
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: '#0f766e', display: 'inline-block' }} />
                銅製品（板/条/管/棒・線）
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: '#b45309', display: 'inline-block' }} />
                黄銅製品（板/条/管/棒・線）
              </span>
            </div>
          </div>
        </section>

        <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 12, marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: '1rem' }}>データを読むコツ（実務向け）</h2>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.65, color: '#475569' }}>
            <li>単月の増減だけでなく、3か月程度の方向感で見る</li>
            <li>価格（LME/建値）と一緒に見る（価格高で需要が一時鈍ることがある）</li>
            <li>輸出入フロー（MOF/HS）と合わせると、国内需要か外需かのヒントになる</li>
            <li>在庫の増減は「需要減」だけでなく「先回り調達」の可能性もある</li>
          </ul>
        </section>

        <section style={{ marginBottom: 16 }}>
          <h2 style={{ marginBottom: 8, fontSize: '1rem' }}>このページの限界・注意点</h2>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.65 }}>
          <li>建設・EV・家電ごとの銅使用量を直接示すページではない。</li>
          <li>中間材は複数用途にまたがるため、用途の切り分けは近似的。</li>
          <li>proxy 指標は「方向感の確認」向きであり、厳密配分の断定には使えない。</li>
        </ul>
      </section>

      <SupplyChainSourceLinks
        links={[
          { label: '経産省（METI）', href: 'https://www.meti.go.jp/' },
          { label: '財務省通関統計（MOF）', href: 'https://www.customs.go.jp/toukei/info/' },
        ]}
      />

        <nav style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <Link href="/supply-chain/refining" style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, textDecoration: 'none', color: 'inherit' }}>
            ← 前の工程: 精錬
          </Link>
          <Link href="/supply-chain/scrap" style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, textDecoration: 'none', color: 'inherit', textAlign: 'right' }}>
            次の工程: スクラップ回収 →
          </Link>
        </nav>
      </div>
    </SupplyChainShell>
  );
}
