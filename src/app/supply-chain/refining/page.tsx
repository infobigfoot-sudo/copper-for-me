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

function ymToMonthEnd(ym: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const d = new Date(Number(m[1]), Number(m[2]), 0);
  return d.toISOString().slice(0, 10);
}

async function loadIcsgAnnual(): Promise<Record<string, Point[]>> {
  const p = path.join(
    process.cwd(),
    '..',
    '..',
    'stock-data-processor',
    'data',
    '予測用',
    'icsg_core_v1',
    'monthly_master_core_v1_icsg_addon_actual.csv',
  );
  let raw = '';
  try {
    raw = await fs.readFile(p, 'utf-8');
  } catch {
    return {
      icsg_world_refined_balance: [],
      icsg_world_refined_production: [],
      icsg_world_refined_usage: [],
    };
  }
  const [header, ...lines] = raw.split(/\r?\n/).filter(Boolean);
  const cols = csvSplitLine(header).map((c) => c.replace(/^\ufeff/, ''));
  const idx = {
    date: cols.indexOf('date'),
    key: cols.indexOf('series_key'),
    value: cols.indexOf('value'),
  };
  const target = new Set([
    'icsg_world_refined_balance',
    'icsg_world_refined_production',
    'icsg_world_refined_usage',
  ]);
  const out: Record<string, Point[]> = {
    icsg_world_refined_balance: [],
    icsg_world_refined_production: [],
    icsg_world_refined_usage: [],
  };
  for (const line of lines) {
    const cells = csvSplitLine(line);
    const key = cells[idx.key];
    if (!target.has(key)) continue;
    const value = parseNum(cells[idx.value]);
    const date = cells[idx.date];
    if (!date || value === null) continue;
    out[key].push({ date, value });
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

async function loadJapanMetiCopperElectric(): Promise<Record<string, Point[]>> {
  const dir = path.join(process.cwd(), '..', '..', 'stock-data-processor', 'data', 'japan', 'METI_COPPER');
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir))
      .filter((f) => /^meti_copper_long_\d{4}\.csv$/.test(f))
      .sort();
  } catch {
    return {
      production: [],
      sales: [],
      inventory: [],
    };
  }
  const buckets: Record<string, Point[]> = {
    production: [],
    sales: [],
    inventory: [],
  };
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
      if (cells[idx.itemName] !== '電気銅') continue;
      const metricName = cells[idx.metricName];
      const date = cells[idx.date];
      const value = parseNum(cells[idx.value]);
      if (!date || value === null) continue;
      if (metricName === '生産数量') buckets.production.push({ date, value });
      if (metricName === '販売数量') buckets.sales.push({ date, value });
      if (metricName === '月末在庫数量') buckets.inventory.push({ date, value });
    }
  }
  for (const k of Object.keys(buckets)) {
    buckets[k].sort((a, b) => a.date.localeCompare(b.date));
  }
  return buckets;
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

export default async function SupplyChainRefiningPage() {
  const [icsg, japanMeti] = await Promise.all([loadIcsgAnnual(), loadJapanMetiCopperElectric()]);
  const width = 920;
  const height = 320;

  const icsgBalance = icsg.icsg_world_refined_balance.at(-1);
  const icsgProd = icsg.icsg_world_refined_production.at(-1);
  const icsgUse = icsg.icsg_world_refined_usage.at(-1);

  const jpProd = japanMeti.production;
  const jpSales = japanMeti.sales;
  const jpInv = japanMeti.inventory;
  const jpProdIdx = makeIndexed(jpProd, 24);
  const jpSalesIdx = makeIndexed(jpSales, 24);
  const jpInvIdx = makeIndexed(jpInv, 24);
  const jpYs = [...jpProdIdx, ...jpSalesIdx, ...jpInvIdx].map((p) => p.index).filter((v): v is number => v !== null);
  const jpYMin = jpYs.length ? Math.floor((Math.min(...jpYs) - 2) / 5) * 5 : 90;
  const jpYMax = jpYs.length ? Math.ceil((Math.max(...jpYs) + 2) / 5) * 5 : 120;
  const jpProdLine = buildPolyline(jpProdIdx, width, height, jpYMin, jpYMax);
  const jpSalesLine = buildPolyline(jpSalesIdx, width, height, jpYMin, jpYMax);
  const jpInvLine = buildPolyline(jpInvIdx, width, height, jpYMin, jpYMax);
  const jpTicks = [0, 1, 2, 3, 4].map((i) => jpYMin + ((jpYMax - jpYMin) * i) / 4);
  const latestJpProd = jpProd.at(-1);
  const prevJpProd = jpProd.at(-2);
  const latestJpSales = jpSales.at(-1);
  const prevJpSales = jpSales.at(-2);
  const latestJpInv = jpInv.at(-1);
  const prevJpInv = jpInv.at(-2);
  const jpProdMom = latestJpProd && prevJpProd && prevJpProd.value !== 0 ? ((latestJpProd.value - prevJpProd.value) / prevJpProd.value) * 100 : null;
  const jpSalesMom = latestJpSales && prevJpSales && prevJpSales.value !== 0 ? ((latestJpSales.value - prevJpSales.value) / prevJpSales.value) * 100 : null;
  const jpInvMom = latestJpInv && prevJpInv && prevJpInv.value !== 0 ? ((latestJpInv.value - prevJpInv.value) / prevJpInv.value) * 100 : null;
  const jpGapApprox =
    latestJpProd && latestJpSales ? latestJpProd.value - latestJpSales.value : null;
  const jpInvDiff =
    latestJpInv && prevJpInv ? latestJpInv.value - prevJpInv.value : null;

  return (
    <SupplyChainShell
      title="銅サプライチェーン：精錬（中流供給・需給）"
      lead="日本の電気銅（METI）の月次データを中流の実務指標として見つつ、ICSGの世界需給（年次/補助）で中期バランスを確認するページ。"
      currentSlug="refining"
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
          / <span>精錬</span>
        </nav>

        <header style={{ marginBottom: 14 }}>
          <p style={{ margin: 0, color: '#475569', lineHeight: 1.65 }}>
            日本の電気銅（METI）の月次データを中流の実務指標として見つつ、ICSGの世界需給（年次/補助）で中期バランスを確認するページ。
          </p>
        </header>

        <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 12, marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: '1rem' }}>ICSGベースの世界需給バランス（年次/補助）</h2>
          <p style={{ margin: '0 0 10px', color: '#64748b', fontSize: '0.9rem' }}>
            ICSG addon は現状、年次中心の補助系列。月次トレンドではなく、中期の需給バランス確認に使う。
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
            <article style={{ border: '1px solid #edf0f5', borderRadius: 8, padding: 8, background: '#fbfcfe', textAlign: 'right' }}>
              <p style={{ margin: 0, color: '#475569', fontWeight: 700, textAlign: 'left' }}>ICSG 世界精錬需給バランス</p>
              <p style={{ margin: '8px 0 0', fontSize: '1.6rem' }}>{icsgBalance ? icsgBalance.value.toLocaleString('ja-JP') : '-'}</p>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>kt Cu / {formatYmd(icsgBalance?.date)}</p>
            </article>
            <article style={{ border: '1px solid #edf0f5', borderRadius: 8, padding: 8, background: '#fbfcfe', textAlign: 'right' }}>
              <p style={{ margin: 0, color: '#475569', fontWeight: 700, textAlign: 'left' }}>ICSG 世界精錬生産</p>
              <p style={{ margin: '8px 0 0', fontSize: '1.6rem' }}>{icsgProd ? icsgProd.value.toLocaleString('ja-JP') : '-'}</p>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>kt Cu / {formatYmd(icsgProd?.date)}</p>
            </article>
            <article style={{ border: '1px solid #edf0f5', borderRadius: 8, padding: 8, background: '#fbfcfe', textAlign: 'right' }}>
              <p style={{ margin: 0, color: '#475569', fontWeight: 700, textAlign: 'left' }}>ICSG 世界精錬使用</p>
              <p style={{ margin: '8px 0 0', fontSize: '1.6rem' }}>{icsgUse ? icsgUse.value.toLocaleString('ja-JP') : '-'}</p>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>kt Cu / {formatYmd(icsgUse?.date)}</p>
            </article>
          </div>
        </section>

        <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 12, marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: '1rem' }}>日本の電気銅（METI, 月次 / 補助）</h2>
          <p style={{ margin: '0 0 10px', color: '#64748b', fontSize: '0.9rem' }}>
            日本の電気銅（生産・販売・月末在庫）を補助的に表示する。中流供給そのものの世界指標ではなく、日本の実需・在庫の地合い確認に使う。
          </p>
          <p style={{ margin: '0 0 10px', color: '#64748b', fontSize: '0.9rem' }}>
            ※ 電気銅は精錬後の基礎材として扱いやすく、生産・販売・在庫が月次で揃うため、日本の中流工程の代表指標として採用している。
          </p>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc', padding: 8, marginBottom: 12 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#334155' }}>電気銅とは（かんたん説明）</p>
            <p style={{ margin: '0 0 8px', color: '#475569', lineHeight: 1.6, fontSize: '0.9rem' }}>
              電気銅（でんきどう）は、粗銅を電気分解で精製して純度を高めた銅地金。一般に高純度（99.99%以上）が求められ、電線・電子部品・EV関連などの基礎材料として使われる。
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, color: '#475569', lineHeight: 1.6, fontSize: '0.9rem' }}>
              <li>作り方: 粗銅を電解精製して、陰極側に高純度の銅を析出させる</li>
              <li>重要な理由: わずかな不純物でも導電性や加工性に影響しやすい</li>
              <li>代表的な流通形態: カソード（板状の銅地金）</li>
              <li>このページでの見方: 生産・販売・在庫の月次推移から、中流の地合いを把握する</li>
            </ul>
          </div>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc', padding: 8, marginBottom: 12 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#334155' }}>電気銅の原料（銅精鉱だけではない）</p>
            <p style={{ margin: '0 0 8px', color: '#475569', lineHeight: 1.6, fontSize: '0.9rem' }}>
              電気銅の原料は、海外から入る銅精鉱（コンセントレート）だけではない。国内で回収された銅スクラップ（ピカ線・込銅など）も、製錬・精製工程に投入される重要な原料。
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, color: '#475569', lineHeight: 1.6, fontSize: '0.9rem' }}>
              <li>製錬炉の原料は、銅精鉱とスクラップが混ざることがある（工程・設備・運用次第）</li>
              <li>スクラップはすでに金属銅なので、鉱石からの抽出よりエネルギー負荷を抑えやすい</li>
              <li>高品位スクラップ（例: ピカ線）は、全体の品位・歩留まりの面でも扱いやすい</li>
              <li>国内調達できるスクラップは、輸送期間・調達コスト面でも利点がある</li>
            </ul>
          </div>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc', padding: 8, marginBottom: 12 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#334155' }}>なぜスクラップ価格は電気銅価格と連動しやすいのか</p>
            <p style={{ margin: '0 0 8px', color: '#475569', lineHeight: 1.6, fontSize: '0.9rem' }}>
              スクラップは「電気銅を作るための原料」として評価されるため、LMEなどの電気銅価格が上がる局面では、製錬・加工側の買い意欲が強まり、スクラップ価格も連動して上がりやすくなる。
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, color: '#475569', lineHeight: 1.6, fontSize: '0.9rem' }}>
              <li>基準価格: 世界の銅価格はLME電気銅が基準になりやすい</li>
              <li>原料価値: スクラップは電気銅生産・加工の代替/補完原料として評価される</li>
              <li>実務の見方: LME・建値・スクラップ市況をセットで見ると判断しやすい</li>
            </ul>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginBottom: 12 }}>
            <article style={{ border: '1px solid #edf0f5', borderRadius: 8, padding: 8, background: '#fbfcfe', textAlign: 'right' }}>
              <p style={{ margin: 0, color: '#475569', fontWeight: 700, textAlign: 'left' }}>電気銅 生産数量</p>
              <p style={{ margin: '8px 0 0', fontSize: '1.5rem' }}>{latestJpProd ? latestJpProd.value.toLocaleString('ja-JP') : '-'}</p>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>t / {formatYmd(latestJpProd?.date)}</p>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>前月比: {jpProdMom === null ? '-' : `${jpProdMom >= 0 ? '+' : ''}${jpProdMom.toFixed(2)}%`}</p>
            </article>
            <article style={{ border: '1px solid #edf0f5', borderRadius: 8, padding: 8, background: '#fbfcfe', textAlign: 'right' }}>
              <p style={{ margin: 0, color: '#475569', fontWeight: 700, textAlign: 'left' }}>電気銅 販売数量</p>
              <p style={{ margin: '8px 0 0', fontSize: '1.5rem' }}>{latestJpSales ? latestJpSales.value.toLocaleString('ja-JP') : '-'}</p>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>t / {formatYmd(latestJpSales?.date)}</p>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>前月比: {jpSalesMom === null ? '-' : `${jpSalesMom >= 0 ? '+' : ''}${jpSalesMom.toFixed(2)}%`}</p>
            </article>
            <article style={{ border: '1px solid #edf0f5', borderRadius: 8, padding: 8, background: '#fbfcfe', textAlign: 'right' }}>
              <p style={{ margin: 0, color: '#475569', fontWeight: 700, textAlign: 'left' }}>電気銅 月末在庫数量</p>
              <p style={{ margin: '8px 0 0', fontSize: '1.5rem' }}>{latestJpInv ? latestJpInv.value.toLocaleString('ja-JP') : '-'}</p>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>t / {formatYmd(latestJpInv?.date)}</p>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>前月比: {jpInvMom === null ? '-' : `${jpInvMom >= 0 ? '+' : ''}${jpInvMom.toFixed(2)}%`}</p>
            </article>
            <article style={{ border: '1px solid #edf0f5', borderRadius: 8, padding: 8, background: '#fbfcfe', textAlign: 'right' }}>
              <p style={{ margin: 0, color: '#475569', fontWeight: 700, textAlign: 'left' }}>需給ギャップ近似（生産-販売）</p>
              <p style={{ margin: '8px 0 0', fontSize: '1.5rem' }}>
                {jpGapApprox === null ? '-' : `${jpGapApprox >= 0 ? '+' : ''}${Math.round(jpGapApprox).toLocaleString('ja-JP')}`}
              </p>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>t / {formatYmd(latestJpProd?.date || latestJpSales?.date)}</p>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>在庫積み上がり/取り崩しの近似（proxy）</p>
            </article>
            <article style={{ border: '1px solid #edf0f5', borderRadius: 8, padding: 8, background: '#fbfcfe', textAlign: 'right' }}>
              <p style={{ margin: 0, color: '#475569', fontWeight: 700, textAlign: 'left' }}>在庫差分（前月比）</p>
              <p style={{ margin: '8px 0 0', fontSize: '1.5rem' }}>
                {jpInvDiff === null ? '-' : `${jpInvDiff >= 0 ? '+' : ''}${Math.round(jpInvDiff).toLocaleString('ja-JP')}`}
              </p>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>t / {formatYmd(latestJpInv?.date)}</p>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>月末在庫数量の前月差（proxy）</p>
            </article>
          </div>
          <p style={{ margin: '0 0 10px', color: '#64748b', fontSize: 12 }}>
            ※ 「需給ギャップ近似」「在庫差分」はMETIの電気銅系列から作る参考指標。原材料投入量そのものではない。
          </p>
          <div style={{ overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="auto" role="img" aria-label="日本の電気銅（生産・販売・在庫）指数グラフ">
              <rect x="0" y="0" width={width} height={height} fill="#fff" />
              {jpTicks.map((t, idx) => {
                const padL = 40;
                const padR = 10;
                const padT = 12;
                const padB = 24;
                const innerH = height - padT - padB;
                const y = padT + innerH - ((t - jpYMin) / Math.max(jpYMax - jpYMin, 1)) * innerH;
                return (
                  <g key={idx}>
                    <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                    <text x={36} y={y + 4} textAnchor="end" fontSize="11" fill="#64748b">{Math.round(t)}</text>
                  </g>
                );
              })}
              {jpProdIdx.map((p, i) => {
                if (i % 3 !== 0) return null;
                const padL = 40;
                const padR = 10;
                const innerW = width - padL - padR;
                const x = padL + (innerW * i) / Math.max(jpProdIdx.length - 1, 1);
                return (
                  <text key={`jp-${p.date}`} x={x} y={height - 6} textAnchor="middle" fontSize="10" fill="#94a3b8">
                    {p.date.slice(2, 7)}
                  </text>
                );
              })}
              <polyline fill="none" stroke="#f59e0b" strokeWidth="2.4" points={jpProdLine} />
              <polyline fill="none" stroke="#14b8a6" strokeWidth="2.4" points={jpSalesLine} />
              <polyline fill="none" stroke="#8b5cf6" strokeWidth="2.4" points={jpInvLine} />
            </svg>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, fontSize: '0.9rem' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 999, background: '#f59e0b', display: 'inline-block' }} />電気銅 生産数量</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 999, background: '#14b8a6', display: 'inline-block' }} />電気銅 販売数量</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 999, background: '#8b5cf6', display: 'inline-block' }} />電気銅 月末在庫数量</span>
          </div>
        </section>

        <SupplyChainSourceLinks
          links={[
            { label: '経産省（METI）', href: 'https://www.meti.go.jp/' },
            { label: 'ICSG', href: 'https://www.icsg.org/' },
          ]}
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
            href="/supply-chain/mining"
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
            ← 前の工程: 鉱山
          </Link>
          <Link
            href="/supply-chain/end-use"
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
            次の工程: 用途 →
          </Link>
        </nav>

      </div>
    </SupplyChainShell>
  );
}
