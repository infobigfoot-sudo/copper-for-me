
import { notFound } from 'next/navigation';
import Link from 'next/link';

import AdSlot from '@/components/AdSlot';
import TradingViewMarketOverview from '@/components/TradingViewMarketOverview';
import SafeImage from '@/components/SafeImage';
import { getAnnouncements, getCategories, getPosts, getSiteSettings } from '@/lib/microcms';
import { readRecentIndicatorValuesFromEconomySnapshots } from '@/lib/microcms_snapshot';
import { formatIndicatorValue, getEconomyIndicators } from '@/lib/economy';
import { SITE_KEYS, normalizeSite, siteLabel, sitePath } from '@/lib/site';
import { getWarrantDashboardData } from '@/lib/warrant_dashboard';

const fallbackImages = [
  '/images/article-placeholder.svg',
  '/images/article-placeholder.svg',
  '/images/article-placeholder.svg',
  '/images/article-placeholder.svg'
];

const copperFieldPhotos = [
  '/images/copper-field/copper_1.jpg',
  '/images/copper-field/copper_2.jpg',
  '/images/copper-field/copper_3.jpg',
  '/images/copper-field/copper_4.jpg',
  '/images/copper-field/copper_5.jpg'
];

function resolveCardImage(url: string | undefined, fallback: string, slug?: string) {
  const src = String(url || '').trim();
  if (!src) return fallback;
  if (src.includes('undefined') || src.includes('null')) return fallback;
  return src;
}

function formatDate(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatYmd(value?: string) {
  if (!value) return '-';
  const normalized = value.replace(/_/g, '-');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatYearMonth(value?: string) {
  if (!value) return '-';
  const m = value.match(/^(\d{4})[_-](\d{2})$/) || value.match(/^(\d{4})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}`;
  return formatYmd(value);
}

function displayIndicatorName(name: string): string {
  return name.replace(/\s*[（(]Metals\.dev[）)]\s*/g, '');
}

function todayYmdJst() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function toTimeMs(value?: string): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function fmtPct(value: number | null) {
  if (value === null) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function changeClass(value: number | null) {
  if (value === null) return 'neutral';
  return value >= 0 ? 'up' : 'down';
}

function parsePct(text?: string): number | null {
  if (!text) return null;
  const v = Number(String(text).replace('%', '').trim());
  return Number.isFinite(v) ? v : null;
}

function parseNum(text?: string): number | null {
  if (!text) return null;
  const v = Number(String(text).replace(/,/g, '').trim());
  return Number.isFinite(v) ? v : null;
}

function formatRawValue(value: number | null, unit = ''): string {
  if (value === null || !Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  const formatted =
    abs >= 1000
      ? formatIndicatorValue(String(Math.round(value)))
      : value.toLocaleString('ja-JP', { maximumFractionDigits: 3 });
  return unit ? `${formatted} ${unit}` : formatted;
}

function normalizeUnitLabel(unit?: string): string {
  const u = String(unit || '').trim();
  if (!u) return '';
  const low = u.toLowerCase();
  if (low.includes('index')) return 'Index';
  if (low.includes('dollars per barrel')) return 'USD/bbl';
  if (low.includes('dollars per gallon')) return 'USD/gal';
  if (low.includes('dollars per hour')) return 'USD/hour';
  if (low.includes('billions of dollars')) return 'Bn USD';
  if (low.includes('millions of dollars')) return 'Mn USD';
  if (low.includes('thousands of units')) return 'k units';
  if (low.includes('thousands of persons')) return 'k persons';
  return u;
}

function buildSparkline(
  values: number[],
  width = 360,
  height = 120
): { points: string; first: number; last: number } {
  if (!values.length) return { points: '', first: 0, last: 0 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  return { points, first: values[0], last: values[values.length - 1] };
}

function buildBars(values: number[]) {
  if (!values.length) return { heights: [] as number[], first: 0, last: 0, min: 0, max: 0 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const heights = values.map((v) => Math.max(8, Math.round(((v - min) / range) * 100)));
  return { heights, first: values[0], last: values[values.length - 1], min, max };
}

function pickFourAxisLabels(labels: string[]) {
  if (!labels.length) return ['', '', '', ''];
  const n = labels.length;
  if (n === 1) return [labels[0], '', '', labels[0]];
  const idx0 = 0;
  const idx1 = Math.floor((n - 1) / 3);
  const idx2 = Math.floor(((n - 1) * 2) / 3);
  const idx3 = n - 1;
  return [labels[idx0], labels[idx1], labels[idx2], labels[idx3]];
}

type Tone = 'beginner' | 'pro';
type Horizon = '1w' | '1m' | '3m';

function indicatorHelp(id: string, tone: Tone): { what: string; copperImpact: string } {
  const mapBeginner: Record<string, { what: string; copperImpact: string }> = {
    lme_copper_usd: {
      what: '世界の銅価格（LME）をUSD/mtで見た基準値です。',
      copperImpact: '上がると国内の銅価格も上がりやすく、仕入れ負担が増えやすいです。'
    },
    TLRESCONS: {
      what: 'アメリカで建設にどれだけお金が使われたかです。',
      copperImpact: '建設が活発だと銅が多く使われ、価格が上がりやすくなります。'
    },
    DTWEXBGS: {
      what: '主要通貨に対するドルの強さです。',
      copperImpact: 'ドル高はドル建て銅を重くしやすく、価格の上値を抑える要因になりやすいです。'
    },
    FEDFUNDS: {
      what: 'アメリカの政策金利です。',
      copperImpact: '高金利は景気を冷やしやすく、銅需要の抑制要因になりえます。'
    },
    DGS10: {
      what: '米10年国債の利回りです。',
      copperImpact: '長期金利上昇は景気減速観測を強め、銅の上値を抑えることがあります。'
    },
    VIXCLS: {
      what: '株式市場の不安度を示す指数です。',
      copperImpact: 'VIX上昇時はリスク回避でコモディティから資金が抜けやすくなります。'
    },
    IPMAN: {
      what: 'アメリカ製造業の生産量の動きです。',
      copperImpact: '生産増は工業向け銅需要の増加に直結しやすいです。'
    },
    CHNPIEATI01GYQ: {
      what: '中国の工業部門の生産者物価の伸びです。',
      copperImpact: '中国の製造業コストや需要の強さを通じて、銅価格に波及します。'
    },
    PERMIT: {
      what: '建設許可の件数で、着工の先行指標です。',
      copperImpact: '建設需要の先読みとして、銅需要の先行判断に使えます。'
    },
    HOUST: {
      what: '新しい住宅の工事がどれだけ始まったかです。',
      copperImpact: '住宅配線に銅を使うため、件数が増えると銅需要の増加につながります。'
    },
    TCU: {
      what: '設備の稼働率です。',
      copperImpact: '稼働率上昇は生産活動の強さを示し、銅需要を押し上げやすいです。'
    },
    DCOILWTICO: {
      what: '原油の代表的な価格です。',
      copperImpact: '輸送やエネルギー費が上がると、銅の流通コストにも影響します。'
    },
    DCOILBRENTEU: {
      what: '欧州基準の原油価格（Brent）です。',
      copperImpact: '世界のエネルギーコスト上昇を通じて、銅の供給コストに影響します。'
    },
    DHHNGSP: {
      what: '米国天然ガス価格（Henry Hub）です。',
      copperImpact: '精錬・発電コストに波及し、銅価格の下支え/上押し材料になります。'
    },
    GASREGCOVW: {
      what: 'アメリカのガソリン小売価格です。',
      copperImpact: '物流コストと景気感に影響し、金属需要の強さを測る補助になります。'
    },
    CES3000000003: {
      what: 'アメリカ製造業の平均時給です。',
      copperImpact: '人件費が上がると製造コスト全体が上がり、金属価格にも波及しやすいです。'
    },
    GDP: {
      what: 'アメリカ経済全体の大きさを示す指標です。',
      copperImpact: '景気が強いと工業需要が増え、銅価格の追い風になります。'
    },
    CPIAUCSL: {
      what: 'アメリカの消費者物価指数です。',
      copperImpact: 'インフレ動向は金融政策を通じて、銅の需給と資金フローに影響します。'
    },
    PPIACO: {
      what: '企業の仕入れ価格の動きを示す指標です。',
      copperImpact: '企業コストが上がると、金属価格へ転嫁される流れが強まりやすいです。'
    },
    CES1021210001: {
      what: '鉱業で働く人の数です。',
      copperImpact: '供給側の稼働感を把握でき、銅の供給見通しの参考になります。'
    },
    CHLPROINDMISMEI: {
      what: 'チリの鉱工業生産の動きです。',
      copperImpact: '主要生産国の供給動向として、供給余力の判断材料になります。'
    },
    PERPROINDMISMEI: {
      what: 'ペルーの鉱工業生産の動きです。',
      copperImpact: '主要生産国の供給動向として、銅供給の変化を先読みできます。'
    },
    DGORDER: {
      what: '工場が新しく受けた注文の金額です。',
      copperImpact: '受注が増えると今後の生産増が見込まれ、銅需要先行のヒントになります。'
    },
    TTLCONS: {
      what: '建設全体で使われたお金です。',
      copperImpact: 'インフラ需要の強弱が銅需要に直結しやすい指標です。'
    },
    usd_jpy: {
      what: '1ドルを買うのに必要な円の価格です。',
      copperImpact: '円安だと輸入銅が高くなり、日本の仕入れコストが上がりやすいです。'
    },
    copx: {
      what: '銅関連企業の株価をまとめたETFです。',
      copperImpact: '市場の銅セクター期待を映し、銅価格に先行することがあります。'
    },
    usd_cny: {
      what: 'ドルと人民元の為替レートです。',
      copperImpact: '中国の輸入採算に影響し、世界の銅需給バランスに波及します。'
    },
    fcx: {
      what: '大手銅生産企業FCXの株価です。',
      copperImpact: '供給見通しと投資心理の温度感を把握するのに役立ちます。'
    },
    sp500: {
      what: '米国株全体の地合いを示す代表ETFです。',
      copperImpact: 'リスク選好が強いと商品市況にも資金が向かいやすくなります。'
    }
  };
  const mapPro: Record<string, { what: string; copperImpact: string }> = {
    lme_copper_usd: {
      what: 'LME銅価格（USD/mt）の実務ベンチマーク。',
      copperImpact: '建値算定・在庫評価・短期ヘッジ判断の基準値。'
    },
    TLRESCONS: {
      what: '米民間建設投資（名目）。',
      copperImpact: '建設系実需の強弱を通じて銅実需の底堅さを確認。'
    },
    DTWEXBGS: {
      what: '名目実効ドル指数（Broad）。',
      copperImpact: 'ドル高局面はドル建て銅の割高感を強め、価格上昇の抑制要因。'
    },
    FEDFUNDS: {
      what: 'FF金利（政策金利）。',
      copperImpact: '高金利は信用収縮・需要減速を通じ、銅価格の逆風になりやすい。'
    },
    DGS10: {
      what: '米10年金利。',
      copperImpact: '実質金利上昇時は景気・投資の重石になり、非鉄に逆風。'
    },
    VIXCLS: {
      what: 'VIX（ボラティリティ指数）。',
      copperImpact: 'リスクオフ局面で商品市況への資金流入が鈍化。'
    },
    IPMAN: {
      what: '米製造業生産指数。',
      copperImpact: '工業実需の実体を示し、銅需要トレンド判断に有効。'
    },
    CHNPIEATI01GYQ: {
      what: '中国PPI（工業）。',
      copperImpact: '中国工業の価格環境から、需要・採算の転換点を把握。'
    },
    PERMIT: {
      what: '建設許可件数。',
      copperImpact: '住宅・建設需要の先行指標として銅需要の先読みに有効。'
    },
    HOUST: {
      what: '米住宅着工（先行指標）。',
      copperImpact: '電線・配管需要の先読み。銅需要の数か月先行確認に有効。'
    },
    TCU: {
      what: '設備稼働率。',
      copperImpact: '生産能力の逼迫/緩和を通じて、工業金属需要の強弱を判定。'
    },
    DCOILWTICO: {
      what: 'WTIスポット。',
      copperImpact: '精錬・輸送コストのインフレ圧力を通じて採算に波及。'
    },
    DCOILBRENTEU: {
      what: 'Brentスポット。',
      copperImpact: '欧州起点のエネルギー価格ショックを補足し、コスト圧力を点検。'
    },
    DHHNGSP: {
      what: 'Henry Hub天然ガス。',
      copperImpact: '精錬・電力コストの変動を通じ、非鉄コストカーブに影響。'
    },
    GASREGCOVW: {
      what: '米小売ガソリン価格。',
      copperImpact: '物流コストと消費体感の代理指標として需給心理に影響。'
    },
    CES3000000003: {
      what: '米製造業平均時給。',
      copperImpact: 'コストプッシュ圧力把握、PPI連動で金属価格転嫁を点検。'
    },
    GDP: {
      what: '米GDP（四半期）。',
      copperImpact: 'マクロ需要局面の判定。景気拡張局面は非鉄全般に追い風。'
    },
    CPIAUCSL: {
      what: '米CPI（総合）。',
      copperImpact: 'インフレ経路から政策金利期待に波及し、銅価格の資金面に影響。'
    },
    PPIACO: {
      what: '米PPI（総合）。',
      copperImpact: '上流価格転嫁の強弱を把握し、非鉄価格の粘着性を確認。'
    },
    CES1021210001: {
      what: '米鉱業雇用。',
      copperImpact: '供給サイドの稼働温度感と増産余地を点検。'
    },
    CHLPROINDMISMEI: {
      what: 'チリ鉱工業生産指数。',
      copperImpact: '主要供給国の生産動向として供給増減の先行判断に有効。'
    },
    PERPROINDMISMEI: {
      what: 'ペルー鉱工業生産指数。',
      copperImpact: '主要供給国の稼働変化を補足し、供給リスク評価に活用。'
    },
    DGORDER: {
      what: '米耐久財/製造業新規受注。',
      copperImpact: '工業循環の先行指標として銅需要の先読み精度を上げる。'
    },
    TTLCONS: {
      what: '米総建設支出。',
      copperImpact: 'インフラ・非住宅需要を含む銅実需総量の把握に有効。'
    },
    usd_jpy: {
      what: 'ドル円スポット。',
      copperImpact: '円建て輸入採算に直結。円安は建値上昇圧力。'
    },
    copx: {
      what: '銅鉱山株ETF。',
      copperImpact: '銅セクター期待の先行センチメント指標。'
    },
    usd_cny: {
      what: 'ドル/人民元。',
      copperImpact: '中国の輸入採算・需要心理を通じて国際需給へ波及。'
    },
    fcx: {
      what: 'FCX株価（主要生産企業）。',
      copperImpact: '供給見通しと資本市場の評価を反映。'
    },
    sp500: {
      what: '米株式市場ベータ。',
      copperImpact: 'リスクオン/オフで商品への資金フローに間接影響。'
    }
  };
  const map = tone === 'pro' ? mapPro : mapBeginner;
  return (
    map[id] || {
      what: tone === 'pro' ? '景気・市場状態を示す補助指標。' : '景気や市場の動きを見るための指標です。',
      copperImpact:
        tone === 'pro'
          ? '銅の需要・供給・為替・投資心理を通じて価格形成に波及。'
          : '銅の需要・供給・為替の変化を通じて、価格に影響します。'
    }
  );
}

function indicatorUpDownImpact(id: string): { up: string; down: string } {
  const map: Record<string, { up: string; down: string }> = {
    lme_copper_usd: {
      up: '国内建値の上昇圧力が強まりやすい。',
      down: '国内建値の上昇圧力が和らぎやすい。'
    },
    usd_jpy: {
      up: '円安進行で輸入銅コストが上がりやすい。',
      down: '円高進行で輸入銅コストが下がりやすい。'
    },
    usd_cny: {
      up: '人民元安で中国の輸入採算が悪化し、需要が鈍る可能性。',
      down: '人民元高で中国の輸入採算が改善し、需要が戻りやすい。'
    },
    TLRESCONS: {
      up: '建設需要の強さを示し、銅実需の追い風。',
      down: '建設需要の鈍化を示し、銅需要の逆風。'
    },
    TTLCONS: {
      up: 'インフラ/非住宅を含む総需要が強く、銅に追い風。',
      down: '総建設需要の鈍化で銅の需要見通しが弱まる。'
    },
    PERMIT: {
      up: '先行的な建設需要増を示し、銅需要の先高感。',
      down: '先行的な建設需要減を示し、銅需要の先安感。'
    },
    HOUST: {
      up: '住宅配線需要増で銅に追い風。',
      down: '住宅配線需要減で銅に逆風。'
    },
    DGORDER: {
      up: '製造業の先行需要が強く、銅消費増の示唆。',
      down: '製造業の先行需要が弱く、銅消費減の示唆。'
    },
    IPMAN: {
      up: '工業生産の拡大で銅実需に追い風。',
      down: '工業生産の減速で銅実需に逆風。'
    },
    TCU: {
      up: '設備稼働が高く、生産現場の銅需要は強め。',
      down: '設備稼働が低く、生産現場の銅需要は弱め。'
    },
    GDP: {
      up: '景気拡大で工業金属需要が強まりやすい。',
      down: '景気減速で工業金属需要が弱まりやすい。'
    },
    DTWEXBGS: {
      up: 'ドル高でドル建て銅の上値を抑えやすい。',
      down: 'ドル安でドル建て銅の上値余地が広がりやすい。'
    },
    FEDFUNDS: {
      up: '金融引き締め方向で需要減速リスクが増える。',
      down: '金融緩和方向で需要回復期待が高まる。'
    },
    DGS10: {
      up: '長期金利上昇で景気減速観測が強まりやすい。',
      down: '長期金利低下で景気下支え期待が出やすい。'
    },
    VIXCLS: {
      up: 'リスク回避で商品市況に資金が入りにくい。',
      down: 'リスク選好で商品市況に資金が戻りやすい。'
    },
    DCOILWTICO: {
      up: 'エネルギー/物流コスト上昇で銅コスト高要因。',
      down: 'エネルギー/物流コスト低下で銅コスト高が緩和。'
    },
    DCOILBRENTEU: {
      up: '世界的なコスト圧力上昇で銅の下支え要因。',
      down: '世界的なコスト圧力低下で銅の下支えが弱まる。'
    },
    DHHNGSP: {
      up: '精錬電力コスト増で供給コストを押し上げやすい。',
      down: '精錬電力コスト減で供給コストを押し下げやすい。'
    },
    GASREGCOVW: {
      up: '物流コストと景気体感の上振れを示しやすい。',
      down: '物流コストと景気体感の下振れを示しやすい。'
    },
    CES3000000003: {
      up: '人件費上昇でコスト転嫁圧力が強まりやすい。',
      down: '人件費伸び鈍化でコスト転嫁圧力が和らぎやすい。'
    },
    CPIAUCSL: {
      up: 'インフレ警戒で金融引き締め観測が強まりやすい。',
      down: 'インフレ鈍化で金融環境の改善期待が出やすい。'
    },
    PPIACO: {
      up: '上流コスト高で価格転嫁・金属価格の粘着性が強まる。',
      down: '上流コスト低下で価格転嫁圧力が弱まりやすい。'
    },
    CES1021210001: {
      up: '供給側の稼働余力が増え、供給不安が和らぎやすい。',
      down: '供給側の稼働余力が縮み、供給不安が高まりやすい。'
    },
    CHLPROINDMISMEI: {
      up: 'チリの供給増で世界需給は緩みやすい。',
      down: 'チリの供給減で世界需給は締まりやすい。'
    },
    PERPROINDMISMEI: {
      up: 'ペルーの供給増で世界需給は緩みやすい。',
      down: 'ペルーの供給減で世界需給は締まりやすい。'
    },
    copx: {
      up: '銅セクターの期待改善で地合いに追い風。',
      down: '銅セクターの期待悪化で地合いに逆風。'
    },
    fcx: {
      up: '主要銅企業への評価改善で銅市況に強気示唆。',
      down: '主要銅企業への評価悪化で銅市況に弱気示唆。'
    },
    sp500: {
      up: 'リスクオン地合いで商品にも資金が向かいやすい。',
      down: 'リスクオフ地合いで商品から資金が離れやすい。'
    }
  };
  return (
    map[id] || {
      up: '一般的には銅価格の上昇圧力につながりやすい。',
      down: '一般的には銅価格の下落圧力につながりやすい。'
    }
  );
}

function toPlainStyle(text: string): string {
  return text
    .replace(/できます。/g, 'できる。')
    .replace(/なります。/g, 'なる。')
    .replace(/されます。/g, 'される。')
    .replace(/します。/g, 'する。')
    .replace(/です。/g, '。')
    .replace(/ます。/g, '。')
    .replace(/です$/g, '')
    .replace(/ます$/g, '');
}

function indicatorUrl(id: string): string | null {
  const map: Record<string, string> = {
    lme_copper_usd: 'https://www.lme.com/Metals/Non-ferrous/Copper',
    TLRESCONS: 'https://fred.stlouisfed.org/series/TLRESCONS',
    DTWEXBGS: 'https://fred.stlouisfed.org/series/DTWEXBGS',
    FEDFUNDS: 'https://fred.stlouisfed.org/series/FEDFUNDS',
    DGS10: 'https://fred.stlouisfed.org/series/DGS10',
    VIXCLS: 'https://fred.stlouisfed.org/series/VIXCLS',
    IPMAN: 'https://fred.stlouisfed.org/series/IPMAN',
    CHNPIEATI01GYQ: 'https://fred.stlouisfed.org/series/CHNPIEATI01GYQ',
    PERMIT: 'https://fred.stlouisfed.org/series/PERMIT',
    HOUST: 'https://fred.stlouisfed.org/series/HOUST',
    TCU: 'https://fred.stlouisfed.org/series/TCU',
    DCOILWTICO: 'https://fred.stlouisfed.org/series/DCOILWTICO',
    DCOILBRENTEU: 'https://fred.stlouisfed.org/series/DCOILBRENTEU',
    DHHNGSP: 'https://fred.stlouisfed.org/series/DHHNGSP',
    GASREGCOVW: 'https://fred.stlouisfed.org/series/GASREGCOVW',
    CES3000000003: 'https://fred.stlouisfed.org/series/CES3000000003',
    GDP: 'https://fred.stlouisfed.org/series/GDP',
    CPIAUCSL: 'https://fred.stlouisfed.org/series/CPIAUCSL',
    PPIACO: 'https://fred.stlouisfed.org/series/PPIACO',
    CES1021210001: 'https://fred.stlouisfed.org/series/CES1021210001',
    CHLPROINDMISMEI: 'https://fred.stlouisfed.org/series/CHLPROINDMISMEI',
    PERPROINDMISMEI: 'https://fred.stlouisfed.org/series/PERPROINDMISMEI',
    DGORDER: 'https://fred.stlouisfed.org/series/DGORDER',
    TTLCONS: 'https://fred.stlouisfed.org/series/TTLCONS',
    usd_jpy: 'https://www.tradingview.com/symbols/USDJPY/',
    copx: 'https://finance.yahoo.com/quote/COPX',
    usd_cny: 'https://www.tradingview.com/symbols/USDCNY/',
    fcx: 'https://finance.yahoo.com/quote/FCX',
    sp500: 'https://finance.yahoo.com/quote/SPY'
  };
  return map[id] || null;
}

function factorDirection(id: string, pct: number): 'up' | 'down' | null {
  const positiveUp = new Set([
    'lme_copper_usd',
    'TLRESCONS',
    'HOUST',
    'DCOILWTICO',
    'GASREGCOVW',
    'CES3000000003',
    'GDP',
    'PPIACO',
    'DGORDER',
    'TTLCONS',
    'usd_jpy',
    'copx',
    'fcx',
    'sp500'
  ]);
  const positiveDown = new Set([
    'usd_cny',
    'CES1021210001',
    'DTWEXBGS',
    'FEDFUNDS',
    'DGS10',
    'VIXCLS'
  ]);
  positiveDown.add('CHLPROINDMISMEI');
  positiveDown.add('PERPROINDMISMEI');
  if (positiveUp.has(id)) return pct >= 0 ? 'up' : 'down';
  if (positiveDown.has(id)) return pct >= 0 ? 'down' : 'up';
  return null;
}

function directionSummary(direction: 'up' | 'down' | null): string {
  if (direction === 'up') return '銅価格への圧力: 上昇';
  if (direction === 'down') return '銅価格への圧力: 下落';
  return '銅価格への圧力: 中立';
}

function directionAction(direction: 'up' | 'down' | null): { buy: string; sell: string } {
  if (direction === 'up') {
    return {
      buy: '仕入れ目線: 早めの分割仕入れを検討',
      sell: '売値目線: 値上げ交渉の根拠に使いやすい'
    };
  }
  if (direction === 'down') {
    return {
      buy: '仕入れ目線: 直近の買い急ぎを抑える',
      sell: '売値目線: 先出し販売で在庫リスクを圧縮'
    };
  }
  return {
    buy: '仕入れ目線: 通常ロットで様子見',
    sell: '売値目線: 現行価格維持で回転重視'
  };
}

function ageDays(value?: string): number | null {
  if (!value) return null;
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000)));
}

function freshnessLimitDays(horizon: Horizon, frequency: string): number {
  const freq = String(frequency || '').toLowerCase();
  const table: Record<Horizon, Record<string, number>> = {
    '1w': { daily: 10, weekly: 21, monthly: 45, quarterly: 120, realtime: 7, default: 30 },
    '1m': { daily: 35, weekly: 45, monthly: 75, quarterly: 150, realtime: 35, default: 60 },
    '3m': { daily: 100, weekly: 110, monthly: 130, quarterly: 220, realtime: 100, default: 120 },
  };
  if (freq.includes('daily')) return table[horizon].daily;
  if (freq.includes('weekly')) return table[horizon].weekly;
  if (freq.includes('monthly')) return table[horizon].monthly;
  if (freq.includes('quarter')) return table[horizon].quarterly;
  if (freq.includes('real')) return table[horizon].realtime;
  return table[horizon].default;
}

function isFreshForHorizon(dateText: string | undefined, frequency: string, horizon: Horizon): boolean {
  const age = ageDays(dateText);
  if (age === null) return false;
  return age <= freshnessLimitDays(horizon, frequency);
}

export function generateStaticParams() {
  return SITE_KEYS.map((site) => ({ site }));
}

export default async function SiteHomePage({
  params,
  searchParams
}: {
  params: Promise<{ site: string }>;
  searchParams?: Promise<{ driver?: string; horizon?: string; show?: string }>;
}) {
  const resolved = await params;
  const query = (await searchParams) || {};
  const site = normalizeSite(resolved.site);
  if (site !== resolved.site) notFound();
  const to = (path: string) => sitePath(site, path);

  const [postsRes, categoriesRes, economyBundle, warrantDashboard, siteSettings, announcements] = await Promise.all([
    getPosts(8, site).catch(() => ({ contents: [] })),
    getCategories(site).catch(() => ({ contents: [] })),
    site === 'a'
      ? getEconomyIndicators().catch(() => ({ updatedAt: '', cacheBucketJst: '', fred: [], alpha: [] }))
      : Promise.resolve({ updatedAt: '', cacheBucketJst: '', fred: [], alpha: [] }),
    site === 'a'
      ? getWarrantDashboardData().catch(() => ({
          copperTate: { latest: null, prev: null, diffPct1d: null },
          warrant: {
            latest: null,
            prev: null,
            diffPct1d: null,
            diffPct7d: null,
            ma20: null,
            monthlyLatest: null,
            monthlyPrev: null,
            diffPctMoM: null
          },
          offWarrant: { latest: null, prev: null, diffPctMoM: null },
          ratio: null,
          alerts: [],
          charts: { warrantDaily: [], offWarrantMonthly: [], copperTateDaily: [] },
          breakdown: { warrantLatestByLocation: [], offWarrantLatestByPoint: [] }
        }))
      : Promise.resolve({
          copperTate: { latest: null, prev: null, diffPct1d: null },
          warrant: {
            latest: null,
            prev: null,
            diffPct1d: null,
            diffPct7d: null,
            ma20: null,
            monthlyLatest: null,
            monthlyPrev: null,
            diffPctMoM: null
          },
          offWarrant: { latest: null, prev: null, diffPctMoM: null },
          ratio: null,
          alerts: [],
          charts: { warrantDaily: [], offWarrantMonthly: [], copperTateDaily: [] },
          breakdown: { warrantLatestByLocation: [], offWarrantLatestByPoint: [] }
        }),
    getSiteSettings(site).catch(() => null),
    getAnnouncements(3, site).catch(() => [])
  ]);
  const posts = [...postsRes.contents].sort((a: any, b: any) => {
    const at = toTimeMs(String(a?.publishedAt || a?.updatedAt || a?.createdAt || ''));
    const bt = toTimeMs(String(b?.publishedAt || b?.updatedAt || b?.createdAt || ''));
    return bt - at;
  });
  const categories = categoriesRes.contents;
  const fredIndicators = economyBundle.fred;
  const alphaIndicators = economyBundle.alpha;
  const featured = posts[0];
  const others = posts.slice(1, 4);
  const adsEnabled = Boolean(process.env.NEXT_PUBLIC_ADSENSE_CLIENT) && siteSettings?.adEnabled !== false;
  const adSlotTop = process.env.NEXT_PUBLIC_ADSENSE_SLOT_TOP;
  const adSlotMid = process.env.NEXT_PUBLIC_ADSENSE_SLOT_MID;
  const lmeIndicator = fredIndicators.find((i) => i.id === 'lme_copper_jpy');
  const lmeUsdIndicator = fredIndicators.find((i) => i.id === 'lme_copper_usd');
  const usdJpyIndicator = alphaIndicators.find((i) => i.id === 'usd_jpy');
  const usdCnyIndicator = alphaIndicators.find((i) => i.id === 'usd_cny');
  const warrantValues = warrantDashboard.charts.warrantDaily.map((p) => p.value);
  const offValues = warrantDashboard.charts.offWarrantMonthly.map((p) => p.value);
  const copperTateValues = warrantDashboard.charts.copperTateDaily.map((p) => p.value);
  const copperTateSpark = buildSparkline(copperTateValues, 360, 180);
  const copperTateAxisLabels = pickFourAxisLabels(
    warrantDashboard.charts.copperTateDaily.map((p) => p.date.slice(0, 7))
  );
  const copperTateBars = buildBars(copperTateValues);
  const copperTateMid = (copperTateBars.max + copperTateBars.min) / 2;
  const warrantAxisLabels = pickFourAxisLabels(
    warrantDashboard.charts.warrantDaily.map((p) => p.date.slice(0, 7))
  );
  const offAxisLabels = pickFourAxisLabels(
    warrantDashboard.charts.offWarrantMonthly.map((p) => p.month.replace('_', '-'))
  );
  const warrantBars = buildBars(warrantValues);
  const offBars = buildBars(offValues);
  const warrantSpark = buildSparkline(warrantValues, 360, 180);
  const offSpark = buildSparkline(offValues, 360, 180);
  const warrantMid = (warrantBars.max + warrantBars.min) / 2;
  const offMid = (offBars.max + offBars.min) / 2;
  const warrantDeltaPct =
    warrantBars.first !== 0 ? ((warrantBars.last - warrantBars.first) / Math.abs(warrantBars.first)) * 100 : null;
  const offDeltaPct =
    offBars.first !== 0 ? ((offBars.last - offBars.first) / Math.abs(offBars.first)) * 100 : null;
  const tone: Tone = 'beginner';
  const lmeRecentFromUsdSnapshots = await readRecentIndicatorValuesFromEconomySnapshots('lme_copper_usd').catch(() => []);
  const lmeRecentFromJpySnapshots = await readRecentIndicatorValuesFromEconomySnapshots('lme_copper_jpy').catch(() => []);
  const lmeFallbackChangePercent = (() => {
    if ((lmeUsdIndicator?.changePercent || '').trim()) return lmeUsdIndicator?.changePercent || null;
    if ((lmeIndicator?.changePercent || '').trim()) return lmeIndicator?.changePercent || null;
    const recent = lmeRecentFromUsdSnapshots.length >= 2 ? lmeRecentFromUsdSnapshots : lmeRecentFromJpySnapshots;
    const latest = recent[0];
    const prev = recent[1];
    const latestVal = parseNum(latest?.value);
    const prevVal = parseNum(prev?.value);
    if (latestVal === null || prevVal === null || prevVal === 0) return null;
    return fmtPct(((latestVal - prevVal) / Math.abs(prevVal)) * 100);
  })();
  const driverRaw = String(query.driver || 'all').toLowerCase();
  const driverFilter: 'all' | 'bullish' | 'bearish' =
    driverRaw === 'bullish' || driverRaw === 'bearish' ? (driverRaw as 'bullish' | 'bearish') : 'all';
  const horizonRaw = String(query.horizon || '1m').toLowerCase();
  const horizon: Horizon =
    horizonRaw === '1w' || horizonRaw === '3m' ? (horizonRaw as Horizon) : '1m';
  const showAllIndicators = String(query.show || '').toLowerCase() === 'all';
  const warrant7dPct = warrantDashboard.warrant.diffPct7d;
  const offMoMPct = warrantDashboard.offWarrant.diffPctMoM;
  const dashboardIndicators = [...fredIndicators, ...alphaIndicators].map((ind) => {
    const pct = parsePct(ind.changePercent);
    const direction = pct === null ? null : factorDirection(ind.id, pct);
    const help = indicatorHelp(ind.id, tone);
    return {
      ...ind,
      direction,
      help,
      category: ind.source === 'FRED' ? 'Macro/FRED' : 'Market',
      pct,
    };
  });
  const byUpdatedDesc = (
    a: { lastUpdated?: string; date: string },
    b: { lastUpdated?: string; date: string }
  ) => toTimeMs(b.lastUpdated || b.date) - toTimeMs(a.lastUpdated || a.date);
  const freshIndicators = dashboardIndicators.filter((ind) =>
    isFreshForHorizon(ind.date, ind.frequency, horizon)
  );
  const allIndicatorsWithFresh = dashboardIndicators
    .map((ind) => ({
      ...ind,
      isFresh: isFreshForHorizon(ind.date, ind.frequency, horizon)
    }))
    .sort((a, b) => {
      const freshDiff = Number(b.isFresh) - Number(a.isFresh);
      if (freshDiff !== 0) return freshDiff;
      return byUpdatedDesc(a, b);
    });
  const staleIndicatorsCount = allIndicatorsWithFresh.filter((ind) => !ind.isFresh).length;
  const filteredIndicators =
    driverFilter === 'all'
      ? freshIndicators
      : freshIndicators.filter((ind) => ind.direction === (driverFilter === 'bullish' ? 'up' : 'down'));
  const decisionIds = new Set([
    'usd_jpy',
    'TLRESCONS',
    'HOUST',
    'DCOILWTICO',
    'GASREGCOVW',
    'PPIACO',
    'DGORDER',
    'copx',
    'fcx'
  ]);
  const decisionPrimary = filteredIndicators
    .filter((ind) => decisionIds.has(ind.id))
    .sort(byUpdatedDesc);
  const decisionSupplemental = filteredIndicators
    .filter((ind) => !decisionIds.has(ind.id))
    .sort(byUpdatedDesc);
  const decisionIndicatorsToShow = [...decisionPrimary, ...decisionSupplemental].slice(0, 8);
  const buildBiasFactors = (target: Horizon): Array<{ dir: 'up' | 'down'; label: string }> => {
    const list: Array<{ dir: 'up' | 'down'; label: string }> = [];
    const scope = dashboardIndicators.filter((ind) => isFreshForHorizon(ind.date, ind.frequency, target));
    for (const ind of scope) {
      if (ind.pct === null || ind.pct === undefined || !ind.direction) continue;
      list.push({
        dir: ind.direction,
        label: `${displayIndicatorName(ind.name)} ${ind.pct >= 0 ? '+' : ''}${ind.pct.toFixed(2)}%`
      });
    }
    if (warrant7dPct !== null) {
      list.push({
        dir: warrant7dPct <= 0 ? 'up' : 'down',
        label: `Warrant 7日比 ${warrant7dPct >= 0 ? '+' : ''}${warrant7dPct.toFixed(2)}%`
      });
    }
    if (target !== '1w' && offMoMPct !== null) {
      list.push({
        dir: offMoMPct >= 0 ? 'down' : 'up',
        label: `off-warrant 前月比 ${offMoMPct >= 0 ? '+' : ''}${offMoMPct.toFixed(2)}%`
      });
    }
    return list;
  };
  const horizonBiasFactors = buildBiasFactors(horizon);
  const horizonUpCount = horizonBiasFactors.filter((f) => f.dir === 'up').length;
  const horizonDownCount = horizonBiasFactors.filter((f) => f.dir === 'down').length;
  const biasLabel = horizonUpCount > horizonDownCount ? '上昇バイアス' : horizonUpCount < horizonDownCount ? '下落バイアス' : '中立';
  const biasClass = horizonUpCount > horizonDownCount ? 'up' : horizonUpCount < horizonDownCount ? 'down' : 'neutral';
  const totalBias = horizonUpCount + horizonDownCount;
  const upPct = totalBias > 0 ? Math.round((horizonUpCount / totalBias) * 100) : 0;
  const downPct = totalBias > 0 ? Math.max(0, 100 - upPct) : 0;
  const statusIndicators = freshIndicators
    .filter((ind) => ind.pct !== null && ind.pct !== undefined && ind.direction)
    .map((ind) => ({
      key: ind.id,
      label: displayIndicatorName(ind.name),
      pct: ind.pct as number,
      dir: ind.direction as 'up' | 'down',
      unit: normalizeUnitLabel(ind.units || ''),
      current: parseNum(ind.value),
      prev:
        parseNum(ind.value) !== null && ind.pct !== null && ind.pct !== -100
          ? (parseNum(ind.value) as number) / (1 + (ind.pct as number) / 100)
          : null
    }));
  if (warrant7dPct !== null) {
    statusIndicators.push({
      key: 'warrant_7d',
      label: 'Warrant 7日比',
      pct: warrant7dPct,
      dir: warrant7dPct <= 0 ? 'up' : 'down',
      unit: 't',
      current: warrantDashboard.warrant.latest?.value ?? null,
      prev:
        warrantDashboard.charts.warrantDaily.length >= 8
          ? warrantDashboard.charts.warrantDaily[warrantDashboard.charts.warrantDaily.length - 8].value
          : null
    });
  }
  if (horizon !== '1w' && offMoMPct !== null) {
    statusIndicators.push({
      key: 'offwarrant_mom',
      label: 'off-warrant 前月比',
      pct: offMoMPct,
      dir: offMoMPct >= 0 ? 'down' : 'up',
      unit: 't',
      current: warrantDashboard.offWarrant.latest?.value ?? null,
      prev: warrantDashboard.offWarrant.prev?.value ?? null
    });
  }
  const statusPriority: Record<string, number> = {
    lme_copper_usd: 0,
    warrant_7d: 1,
    offwarrant_mom: 2
  };
  statusIndicators.sort((a, b) => {
    const pa = statusPriority[a.key] ?? 99;
    const pb = statusPriority[b.key] ?? 99;
    if (pa !== pb) return pa - pb;
    return Math.abs(b.pct) - Math.abs(a.pct);
  });
  const statusUpIndicators = statusIndicators.filter((ind) => ind.dir === 'up');
  const statusDownIndicators = statusIndicators.filter((ind) => ind.dir === 'down');
  const warrantSignal =
    warrantDashboard.warrant.diffPct7d !== null && warrantDashboard.warrant.diffPct7d <= -5
      ? '需給ひっ迫'
      : warrantDashboard.warrant.diffPct7d !== null && warrantDashboard.warrant.diffPct7d >= 5
        ? '供給緩和'
        : '中立';
  const usdJpyValue = formatIndicatorValue(usdJpyIndicator?.value || '');
  const lmeUsdDirect = parseNum(lmeUsdIndicator?.value);
  const lmeJpyPerMt = parseNum(lmeIndicator?.value);
  const usdJpyRate = parseNum(usdJpyIndicator?.value);
  const lmeJpyPerMtDerived =
    lmeUsdDirect !== null && usdJpyRate !== null && usdJpyRate > 0 ? lmeUsdDirect * usdJpyRate : null;
  const lmeUsdPerMtDerived =
    lmeJpyPerMt !== null && usdJpyRate !== null && usdJpyRate > 0 ? lmeJpyPerMt / usdJpyRate : null;
  const lmeUsdPerMt = lmeUsdDirect ?? lmeUsdPerMtDerived;
  const lmeJpyPerMtDisplay = lmeJpyPerMt ?? lmeJpyPerMtDerived;
  const lmeJpyValue =
    lmeJpyPerMtDisplay !== null ? formatIndicatorValue(String(Math.round(lmeJpyPerMtDisplay))) : '-';
  const lmeHeadlineValue =
    lmeUsdPerMt !== null ? formatIndicatorValue(String(Math.round(lmeUsdPerMt))) : lmeJpyValue;
  const lmeUnitLabel = lmeUsdPerMt !== null ? 'USD/mt' : 'JPY/mt';
  const lmeDisplayDate = lmeUsdIndicator?.date || lmeIndicator?.date;
  const lmeJpyDisplayDate = lmeIndicator?.date || lmeUsdIndicator?.date;
  const tateValue = warrantDashboard.copperTate.latest
    ? formatIndicatorValue(String(warrantDashboard.copperTate.latest.value))
    : '-';
  const horizonTitleMap: Record<Horizon, string> = {
    '1w': '1週間軸',
    '1m': '1ヶ月軸',
    '3m': '3ヶ月軸'
  };
  const horizonTitle = horizonTitleMap[horizon];
  const todayYmd = todayYmdJst();
  const yesterdayYmd = (() => {
    const d = new Date(`${todayYmd}T00:00:00+09:00`);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const todayOrYesterdayIndicators = dashboardIndicators.filter((ind) => {
    const dataDate = formatYmd(ind.date);
    return dataDate === todayYmd || dataDate === yesterdayYmd;
  });
  const latestIndicatorPriority: Record<string, number> = {
    lme_copper_usd: 0,
    usd_jpy: 1,
    DGS10: 2,
    DCOILWTICO: 3,
    DCOILBRENTEU: 4,
    DTWEXBGS: 5,
    VIXCLS: 6,
    copx: 7,
    fcx: 8,
    sp500: 9
  };
  const sortByLatestIndicatorPriority = (a: typeof dashboardIndicators[number], b: typeof dashboardIndicators[number]) => {
    const pa = latestIndicatorPriority[a.id] ?? 999;
    const pb = latestIndicatorPriority[b.id] ?? 999;
    if (pa !== pb) return pa - pb;
    return toTimeMs(b.lastUpdated || b.date) - toTimeMs(a.lastUpdated || a.date);
  };
  const todayOrYesterdayItems = todayOrYesterdayIndicators
    .sort(sortByLatestIndicatorPriority)
    .map((ind) => ({
      id: ind.id,
      label: `${displayIndicatorName(ind.name)}（${formatYmd(ind.date)}）`
    }));
  const latestUpdatedItems = [...dashboardIndicators]
    .sort(sortByLatestIndicatorPriority)
    .map((ind) => ({
      id: ind.id,
      label: `${displayIndicatorName(ind.name)}（${formatYmd(ind.lastUpdated || ind.date)}）`
    }));
  const baseUpdateItems = todayOrYesterdayItems.length
    ? todayOrYesterdayItems
    : latestUpdatedItems.slice(0, 4);
  const lmeOverviewSource = lmeUsdIndicator || lmeIndicator;
  const lmeOverviewItem = lmeOverviewSource
    ? {
        id: lmeOverviewSource.id,
        label: `${displayIndicatorName(lmeOverviewSource.name)}（${formatYmd(lmeOverviewSource.date)}）`
      }
    : null;
  const updateItemsToShow = (lmeOverviewItem ? [lmeOverviewItem, ...baseUpdateItems] : baseUpdateItems).filter(
    (item, idx, arr) => arr.findIndex((x) => x.id === item.id) === idx
  );
  const decisionIndicatorIdSet = new Set(decisionIndicatorsToShow.map((ind) => ind.id));
  const fixedCategoryNav = [
    { slug: 'info', label: '相場情報' },
    { slug: 'index', label: '指標まとめ' },
    { slug: 'about', label: 'このサイトについて' }
  ] as const;

  return (
    <div className="cf-page">
      <nav className="cf-nav">
        <div className="cf-nav-inner">
          <div className="cf-logo-wrap">
            <div className="cf-logo">
              Copper for me
            </div>
            <p className="cf-logo-sub">Daily Scrap Learning</p>
          </div>
          <div className="cf-nav-links">
            <Link href={to('/')}>Home</Link>
            {fixedCategoryNav.map((cat) => (
              <Link key={cat.slug} href={to(`/category/${cat.slug}`)}>
                {cat.label}
              </Link>
            ))}
          </div>
          <details className="cf-nav-mobile">
            <summary>Menu</summary>
            <div className="cf-nav-mobile-panel">
              <Link href={to('/')}>Home</Link>
              <Link href={to(`/?driver=${driverFilter}&horizon=1m#conclusion`)} scroll={false}>
                1ヶ月軸の結論
              </Link>
              <a href="#market-guide">
                銅価格を知るうえで見るポイント
              </a>
              <a href="#lme-domestic">
                LME価格と国内建値
              </a>
              <a href="#fx-section">
                USD/JPY とUSD/CNY
              </a>
              <a href="#inventory-section">
                LME在庫　Warrant / Off-warrant
              </a>
              <a href="#other-indicators">
                その他指標
              </a>
              {fixedCategoryNav.map((cat) => (
                <Link key={`mobile-${cat.slug}`} href={to(`/category/${cat.slug}`)}>
                  {cat.label}
                </Link>
              ))}
            </div>
          </details>
        </div>
      </nav>

      <header className="cf-hero">
        <p className="cf-eyebrow">Read the Market, Ahead</p>
        <h1 className="cf-hero-title">
          銅の「いま」と「次」を
        </h1>
        <p>LME・為替・在庫から、仕入れ/売値判断に使える指標を更新</p>
      </header>

      <main className="cf-main">
        {site === 'a' ? (
          <>
            <section className="cf-dash-hero">
              <div className="cf-dash-hero-body">
                <h2>Market Overview</h2>
                <p>
                  非鉄金属・市況のインサイトを表示中
                  {economyBundle.cacheBucketJst
                    ? ` / 表示基準日: ${new Date(economyBundle.cacheBucketJst).toLocaleDateString('ja-JP')}`
                    : ''}
                </p>
                <div className="cf-today-updates">
                  <div className="cf-today-updates-head">
                    <p className="cf-today-updates-title">最新記事・主要指標</p>
                    <p className="cf-kpi-note">※ 市場休場日や統計の更新頻度により、指標の日付は当日以外になる場合があります。</p>
                  </div>
                  <ul className="cf-today-updates-list">
                    {featured ? (
                      <li key={`today-latest-post-${featured.id}`} className="cf-today-item-featured">
                        <Link href={to(`/blog/${featured.slug || featured.id}`)}>最新記事: {featured.title}</Link>
                      </li>
                    ) : null}
                    {updateItemsToShow.length ? (
                      updateItemsToShow.map((item, idx) => (
                        <li key={`today-update-${idx}-${item.id}`}>
                          <Link
                            href={
                              decisionIndicatorIdSet.has(item.id)
                                ? to(`/?driver=${driverFilter}&horizon=${horizon}#indicator-${item.id}`)
                                : to(`/?driver=all&horizon=${horizon}&show=all#all-indicators`)
                            }
                          >
                            {item.label}
                          </Link>
                        </li>
                      ))
                    ) : null}
                  </ul>
                </div>
                <div className="cf-card cf-insight-card" style={{ marginTop: '12px' }}>
                  <h4>データソースと更新方針</h4>
                  <p className="cf-kpi-note">データソース: FRED / Metals.dev / Alpha Vantage</p>
                  <p className="cf-kpi-note">取得時刻: 原則 毎日12:00 JST（キャッシュ更新）</p>
                  <p className="cf-kpi-note">
                    取得失敗時は直近値を表示。詳細は
                    {' '}
                    <Link href={to('/blog/disclaimer')}>免責事項</Link>
                    {' '}
                    を参照。
                  </p>
                </div>
                {announcements.length ? (
                  <div className="cf-card cf-insight-card" style={{ marginTop: '12px' }}>
                    <h4>お知らせ</h4>
                    <ul className="cf-guide-list">
                      {announcements.map((item) => (
                        <li key={item.id}>
                          {item.link ? <a href={item.link}>{item.title}</a> : item.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </section>

            <section id="conclusion" className="cf-latest cf-focus-section">
              <div className="cf-latest-head">
                <div className="cf-latest-head-row">
                  <h3>{horizonTitle}の結論</h3>
                  <div className="cf-head-controls">
                    <div className="cf-tone-switch">
                      <Link
                        className={`cf-tone-btn ${horizon === '1w' ? 'active' : ''}`}
                        href={to(`/?driver=${driverFilter}&horizon=1w#conclusion`)}
                        scroll={false}
                        prefetch
                      >
                        1週間軸
                      </Link>
                      <Link
                        className={`cf-tone-btn ${horizon === '1m' ? 'active' : ''}`}
                        href={to(`/?driver=${driverFilter}&horizon=1m#conclusion`)}
                        scroll={false}
                        prefetch
                      >
                        1ヶ月軸
                      </Link>
                      <Link
                        className={`cf-tone-btn ${horizon === '3m' ? 'active' : ''}`}
                        href={to(`/?driver=${driverFilter}&horizon=3m#conclusion`)}
                        scroll={false}
                        prefetch
                      >
                        3ヶ月軸
                      </Link>
                    </div>
                    <span className="cf-econ-update cf-head-update">
                      有効指標: {freshIndicators.length}/{dashboardIndicators.length}
                    </span>
                  </div>
                </div>
              </div>
              <div className="cf-dashboard-top">
                <article className="cf-card cf-econ-card cf-stock-chart-card">
                  <h4>最新の価格は？</h4>
                  <p className="cf-kpi-note">LME（USD建て） / 国内建値（JPY建て）</p>
                  <div className="cf-dual-price">
                    <div className="cf-dual-price-item">
                      <p className="cf-kpi-note">LME</p>
                      <p className="cf-kpi-note">
                        前回比:
                        <span
                          className={`cf-change-pill ${
                            parsePct(lmeFallbackChangePercent || undefined) === null
                              ? 'neutral'
                              : String(lmeFallbackChangePercent || '').startsWith('+')
                                ? 'up'
                                : 'down'
                          }`}
                        >
                          {lmeFallbackChangePercent || '-'}
                        </span>
                      </p>
                      <p className="cf-kpi-value">{lmeHeadlineValue}</p>
                      <p className="cf-kpi-note">{lmeUnitLabel} ・ {formatYmd(lmeDisplayDate)}</p>
                    </div>
                    <div className="cf-dual-price-item">
                      <p className="cf-kpi-note">国内建値</p>
                      <p className="cf-kpi-note">
                        前回比:
                        <span className={`cf-change-pill ${changeClass(warrantDashboard.copperTate.diffPct1d)}`}>
                          {fmtPct(warrantDashboard.copperTate.diffPct1d)}
                        </span>
                      </p>
                      <p className="cf-kpi-value">{tateValue}</p>
                      <p className="cf-kpi-note">JPY/mt ・ {formatYmd(warrantDashboard.copperTate.latest?.date)}</p>
                    </div>
                  </div>
                  <p className="cf-kpi-note">為替（USD/JPY）: {usdJpyValue}</p>
                </article>
                <article className="cf-card cf-econ-card cf-stock-chart-card">
                  <h4>今後上昇？下降？（要因スコア）</h4>
                  <p className={`cf-kpi-value cf-bias-value ${biasClass}`}>{biasLabel}</p>
                  <p className="cf-kpi-note">上昇要因 {horizonUpCount} / 下落要因 {horizonDownCount}</p>
                  <p className="cf-kpi-note">需給シグナル: {warrantSignal}</p>
                  <p className="cf-kpi-note">
                    上昇要因 / 下落要因は複数指標の合算スコア。{horizonUpCount} 対 {horizonDownCount} なら全体は{biasLabel}。
                  </p>
                  <p className="cf-kpi-note">
                    需給シグナルは Warrant 7日比のみで判定（&lt;= -5%: 上昇圧力 / &gt;= +5%: 下落圧力 / その間は中立）。
                  </p>
                  <p className="cf-kpi-note">
                    つまり「全体は上昇寄りだが、在庫需給だけでは決定打なし」という状態がありえる。
                  </p>
                  <p className="cf-kpi-note">
                    ※本表示は公開データに基づく簡易推定であり、将来の価格や収益を保証するものではない。最終判断は自身で行うこと。
                  </p>
                </article>
              </div>
              <div className="cf-dashboard-bottom">
                <article className="cf-card cf-econ-card">
                  <h4>上昇圧力ステータス（指標一覧）</h4>
                  <ul className="cf-status-ind-list">
                    {statusUpIndicators.map((ind) => (
                      <li key={ind.key}>
                        <div className="cf-status-ind-head">
                          <span>{ind.label}</span>
                          <span className={`cf-change-pill ${ind.dir === 'up' ? 'up' : 'down'}`}>
                            {ind.pct >= 0 ? '+' : ''}{ind.pct.toFixed(2)}% / {ind.dir === 'up' ? '上昇圧力' : '下落圧力'}
                          </span>
                        </div>
                        <div className="cf-status-ind-meta">
                          <span>現在: {formatRawValue(ind.current, ind.unit)}</span>
                          <span>前回: {formatRawValue(ind.prev, ind.unit)}</span>
                        </div>
                        <div className="cf-status-delta-track">
                          <span className="cf-status-delta-center" />
                          <span
                            className={`cf-status-delta-fill ${ind.dir === 'up' ? 'up' : 'down'}`}
                            style={{
                              width: `${Math.min(50, Math.max(4, Math.round((Math.abs(ind.pct) / 5) * 50)))}%`,
                              left: ind.dir === 'up' ? '50%' : undefined,
                              right: ind.dir === 'down' ? '50%' : undefined
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="cf-kpi-note">ゲージは変化率の強さ（0%中心、目安±5%で最大）。実数値は上段に表示。</p>
                </article>
                <article className="cf-card cf-econ-card">
                  <h4>下落圧力ステータス（指標一覧）</h4>
                  <ul className="cf-status-ind-list">
                    {statusDownIndicators.map((ind) => (
                      <li key={ind.key}>
                        <div className="cf-status-ind-head">
                          <span>{ind.label}</span>
                          <span className={`cf-change-pill ${ind.dir === 'up' ? 'up' : 'down'}`}>
                            {ind.pct >= 0 ? '+' : ''}{ind.pct.toFixed(2)}% / {ind.dir === 'up' ? '上昇圧力' : '下落圧力'}
                          </span>
                        </div>
                        <div className="cf-status-ind-meta">
                          <span>現在: {formatRawValue(ind.current, ind.unit)}</span>
                          <span>前回: {formatRawValue(ind.prev, ind.unit)}</span>
                        </div>
                        <div className="cf-status-delta-track">
                          <span className="cf-status-delta-center" />
                          <span
                            className={`cf-status-delta-fill ${ind.dir === 'up' ? 'up' : 'down'}`}
                            style={{
                              width: `${Math.min(50, Math.max(4, Math.round((Math.abs(ind.pct) / 5) * 50)))}%`,
                              left: ind.dir === 'up' ? '50%' : undefined,
                              right: ind.dir === 'down' ? '50%' : undefined
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="cf-kpi-note">ゲージは変化率の強さ（0%中心、目安±5%で最大）。実数値は上段に表示。</p>
                </article>
              </div>
            </section>

            <section id="market-guide" className="cf-latest cf-focus-section">
              <div className="cf-latest-head">
                <h3>銅価格を知るうえで見るポイント</h3>
              </div>
              <div className="cf-guide-block">
                <h4>まず押さえる3つのポイント</h4>
                <p className="cf-kpi-note">
                  この3つを日次で見れば、仕入れ・在庫・売値判断の精度が上がる。
                </p>

                <h5>POINT 1: LME銅価格</h5>
                <ol className="cf-guide-list">
                  <li>
                    <p className="cf-qa-q">Q. LMEってなに？</p>
                    <p className="cf-qa-a">
                      A. London Metal Exchange。非鉄金属の国際取引所で、銅の世界価格を判断する
                      もっとも基本的な基準点。
                    </p>
                  </li>
                  <li>
                    <p className="cf-qa-q">Q. 日本価格への影響は？</p>
                    <p className="cf-qa-a">
                      A. 国内建値はLME価格と為替を土台に決まるため、LMEが上がる局面では
                      日本の仕入れ価格にも上昇圧力がかかりやすい。
                    </p>
                  </li>
                  <li>
                    <p className="cf-qa-q">Q. LMEの見方は？</p>
                    <p className="cf-qa-a">
                      A. 「価格水準」と「直近の増減」をセットで見る。さらに在庫や為替と合わせると、
                      単なる一時的な上下か、トレンド変化かを判別しやすくなる。
                    </p>
                  </li>
                  <li className="cf-latest-row">
                    <span className="cf-latest-label">最新値:</span>
                    <span className="cf-latest-value">{lmeHeadlineValue}</span>
                    <span className="cf-latest-unit">{lmeUnitLabel}</span>
                    <span className="cf-latest-date">（{formatYmd(lmeDisplayDate)}）</span>
                  </li>
                </ol>

                <h5>POINT 2: USD/JPY</h5>
                <ol className="cf-guide-list">
                  <li>
                    <p className="cf-qa-q">Q. 為替ってなに？</p>
                    <p className="cf-qa-a">
                      A. 1ドルを買うのに必要な円の価格。銅はドル建てで取引されるため、日本では
                      為替の影響を強く受ける。
                    </p>
                  </li>
                  <li>
                    <p className="cf-qa-q">Q. 日本価格への影響は？</p>
                    <p className="cf-qa-a">
                      A. 円安（USD/JPY上昇）ほど輸入コストが上がり、建値の上昇要因になりやすい。
                      円高は逆にコスト低下要因として働く。
                    </p>
                  </li>
                  <li>
                    <p className="cf-qa-q">Q. 為替の見方は？</p>
                    <p className="cf-qa-a">
                      A. 日次の向きだけでなく、節目となる価格帯（例: 150円台）を確認する。
                      短期のブレと中期の方向を分けて見ると、仕入れ判断が安定する。
                    </p>
                  </li>
                  <li className="cf-latest-row">
                    <span className="cf-latest-label">最新値:</span>
                    <span className="cf-latest-value">{usdJpyValue}</span>
                    <span className="cf-latest-unit">{normalizeUnitLabel(usdJpyIndicator?.units || 'JPY/USD')}</span>
                    <span className="cf-latest-date">（{formatYmd(usdJpyIndicator?.date)}）</span>
                  </li>
                </ol>

                <h5>POINT 3: Warrant / Off-warrant</h5>
                <ol className="cf-guide-list">
                  <li>
                    <p className="cf-qa-q">Q. Warrant / Off-warrantとは？</p>
                    <p className="cf-qa-a">
                      A. Warrantは「すぐ引き渡し可能な在庫」、
                      Off-warrantは「倉庫にはあるが市場に出ていない潜在在庫」。
                    </p>
                  </li>
                  <li>
                    <p className="cf-qa-q">Q. 日本価格への影響は？</p>
                    <p className="cf-qa-a">
                      A. Warrant減少は目先の供給ひっ迫を示し、上昇圧力になりやすい。
                      逆にOff-warrant増加は将来の供給余力を示し、下押し要因として意識される。
                    </p>
                  </li>
                  <li>
                    <p className="cf-qa-q">Q. 見方は？</p>
                    <p className="cf-qa-a">
                      A. 短期はWarrant（日次）で需給の温度感を確認。中期はOff-warrant（月次）と
                      Warrant比率を合わせて、供給余力の積み上がりを読む。
                    </p>
                  </li>
                  <li>
                    <div className="cf-latest-row">
                      <span className="cf-latest-label">最新値:</span>
                      <span className="cf-latest-name">Warrant</span>
                      <span className="cf-latest-value">
                        {warrantDashboard.warrant.latest
                          ? formatIndicatorValue(String(warrantDashboard.warrant.latest.value))
                          : '-'}
                      </span>
                      <span className="cf-latest-unit">t</span>
                      <span className="cf-latest-date">（{formatYmd(warrantDashboard.warrant.latest?.date)}）</span>
                    </div>
                    <p className="cf-latest-detail">
                      前日比: {fmtPct(warrantDashboard.warrant.diffPct1d)} / 7日比: {fmtPct(warrantDashboard.warrant.diffPct7d)}
                    </p>
                    <div className="cf-latest-row">
                      <span className="cf-latest-label">最新値:</span>
                      <span className="cf-latest-name">Off-warrant</span>
                      <span className="cf-latest-value">
                        {warrantDashboard.offWarrant.latest
                          ? formatIndicatorValue(String(warrantDashboard.offWarrant.latest.value))
                          : '-'}
                      </span>
                      <span className="cf-latest-unit">t</span>
                      <span className="cf-latest-date">（{formatYearMonth(warrantDashboard.offWarrant.latest?.month)}）</span>
                    </div>
                    <p className="cf-latest-detail">
                      前月比: {fmtPct(warrantDashboard.offWarrant.diffPctMoM)}
                    </p>
                  </li>
                </ol>

                <h5>その他</h5>
                <ul className="cf-guide-list">
                  <li>
                    銅の流れ: 鉱山→精錬→電線・建設・EV・家電→スクラップ回収→再資源化。
                    この循環のどこで詰まりが起きるかが、価格変動の起点になる。
                  </li>
                  <li>
                    国内で見るべき指標: 建値、円相場、国内在庫回転、需要先の稼働感。
                    実務では「いくらで買えるか」と「いつ売れるか」の両方を同時に見る。
                  </li>
                  <li>
                    海外で見るべき指標: LME在庫、米中景気指標、エネルギー価格、生産国動向（チリ・ペルーなど）。
                    海外指標は国内価格の先行シグナルとして機能しやすい。
                  </li>
                </ul>

                <h5>そもそも銅とは？（身近な銅）</h5>
                <ul className="cf-guide-list">
                  <li>
                    銅は「電気を通しやすい」「加工しやすい」「再利用しやすい」金属。電線・住宅配線・モーター・家電・給湯器など、
                    生活インフラの中核で使われる。
                  </li>
                  <li>
                    身近なところでは、エアコン配管、電源ケーブル、ブレーカー周辺、EVやハイブリッド車の配線などに多く使われる。
                    景気・建設・電力投資の影響を受けやすい金属でもある。
                  </li>
                  <li>
                    スクラップ市場では「建値」「為替」「在庫」の3点を押さえると、仕入れ・在庫・売値判断の精度が上がる。
                    数字と現場感の両方を見ることが実務では重要。
                  </li>
                </ul>
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
              </div>
            </section>

            {adsEnabled ? (
              <section className="cf-latest">
                <AdSlot slot={adSlotTop} label="トップ広告" />
              </section>
            ) : null}

            <section id="lme-domestic" className="cf-latest cf-focus-section">
              <div className="cf-latest-head">
                <h3>LME価格と国内建値</h3>
              </div>
              <div className="cf-grid">
                <article className="cf-card cf-econ-card">
                  <h4>LME銅（USD建て）</h4>
                  <p>
                    前回比:
                    <span
                      className={`cf-change-pill ${
                        parsePct(lmeFallbackChangePercent || undefined) === null
                          ? 'neutral'
                          : String(lmeFallbackChangePercent || '').startsWith('+')
                            ? 'up'
                            : 'down'
                      }`}
                    >
                      {lmeFallbackChangePercent || '-'}
                    </span>
                  </p>
                  <div className="cf-econ-value-row">
                    <p className="cf-econ-value">{lmeHeadlineValue}</p>
                    <small>{lmeUnitLabel}</small>
                  </div>
                  <p className="cf-econ-date">{formatYmd(lmeDisplayDate)}</p>
                </article>
                <article className="cf-card cf-econ-card">
                  <h4>国内建値</h4>
                  {warrantDashboard.copperTate.diffPct1d !== null ? (
                    <p>
                      前回改定比:
                      <span className={`cf-change-pill ${changeClass(warrantDashboard.copperTate.diffPct1d)}`}>
                        {fmtPct(warrantDashboard.copperTate.diffPct1d)}
                      </span>
                    </p>
                  ) : null}
                  <div className="cf-econ-value-row">
                    <p className="cf-econ-value">
                      {warrantDashboard.copperTate.latest
                        ? formatIndicatorValue(String(warrantDashboard.copperTate.latest.value))
                        : '-'}
                    </p>
                    <small>JPY/mt</small>
                  </div>
                  <p className="cf-econ-date">{formatYmd(warrantDashboard.copperTate.latest?.date)}</p>
                </article>
                <article className="cf-card cf-econ-card cf-explain-card">
                  <h4>LME価格から国内建値の計算</h4>
                  <p className="cf-kpi-note">
                    目安式:<br />
                    <strong>国内建値 ≒ LME銅価格（USD/mt）× USD/JPY + 諸コスト</strong>
                  </p>
                  <p className="cf-kpi-note">
                    諸コストにはプレミアム・物流・保険・精算タイミング差が含まれるため、
                    実際の公表建値は単純換算値と完全一致しない。
                  </p>
                  <p className="cf-kpi-note">
                    「LMEの方向」と「為替の方向」を同時に見て、国内建値の次回改定を先読み。
                  </p>
                </article>
              </div>
              {copperTateSpark.points ? (
                <div className="cf-card cf-econ-card" style={{ marginTop: '16px' }}>
                  <h4>国内建値推移</h4>
                  <div className="cf-chart-wrap">
                    <div className="cf-chart-yaxis">
                      <span>{formatIndicatorValue(String(Math.round(copperTateBars.max)))}</span>
                      <span>{formatIndicatorValue(String(Math.round(copperTateMid)))}</span>
                      <span>{formatIndicatorValue(String(Math.round(copperTateBars.min)))}</span>
                      <small>JPY/mt</small>
                    </div>
                    <div className="cf-mini-chart cf-mini-chart-memo cf-mini-chart-blue" aria-label="国内建値推移（直近1年）">
                      <svg viewBox="0 0 360 180" preserveAspectRatio="none">
                        <polyline points={copperTateSpark.points} />
                      </svg>
                    </div>
                  </div>
                  <div className="cf-mini-axis">
                    {copperTateAxisLabels.map((label, i) => (
                      <span key={`copper-tate-axis-${i}`}>{label}</span>
                    ))}
                  </div>
                  <div className="cf-mini-meta">
                    <span>最小: {formatIndicatorValue(String(Math.round(copperTateBars.min)))} JPY/mt</span>
                    <span>最大: {formatIndicatorValue(String(Math.round(copperTateBars.max)))} JPY/mt</span>
                  </div>
                </div>
              ) : null}
            </section>

            <section id="fx-section" className="cf-latest cf-focus-section" style={{ marginTop: '16px' }}>
              <div className="cf-latest-head">
                <h3>USD/JPY とUSD/CNY</h3>
              </div>
              <div className="cf-grid">
                <article className="cf-card cf-econ-card">
                  <h4>USD/JPY</h4>
                  {usdJpyIndicator ? (
                    <>
                      {usdJpyIndicator.changePercent ? (
                        <p>
                          前日比:
                          <span className={`cf-change-pill ${changeClass(parsePct(usdJpyIndicator.changePercent))}`}>
                            {usdJpyIndicator.changePercent}
                          </span>
                        </p>
                      ) : null}
                      <div className="cf-econ-value-row">
                        <p className="cf-econ-value">{formatIndicatorValue(usdJpyIndicator.value || '')}</p>
                        <small>{usdJpyIndicator.units || '-'}</small>
                      </div>
                      <p className="cf-econ-date">{formatYmd(usdJpyIndicator.date)}</p>
                    </>
                  ) : (
                    <p className="cf-kpi-note">USD/JPYデータなし</p>
                  )}
                </article>
                <article className="cf-card cf-econ-card">
                  <h4>USD/CNY</h4>
                  {usdCnyIndicator ? (
                    <>
                      {usdCnyIndicator.changePercent ? (
                        <p>
                          前日比:
                          <span className={`cf-change-pill ${changeClass(parsePct(usdCnyIndicator.changePercent))}`}>
                            {usdCnyIndicator.changePercent}
                          </span>
                        </p>
                      ) : null}
                      <div className="cf-econ-value-row">
                        <p className="cf-econ-value">{formatIndicatorValue(usdCnyIndicator.value || '')}</p>
                        <small>{usdCnyIndicator.units || '-'}</small>
                      </div>
                      <p className="cf-econ-date">{formatYmd(usdCnyIndicator.date)}</p>
                    </>
                  ) : (
                    <p className="cf-kpi-note">USD/CNYデータなし</p>
                  )}
                </article>
                <article className="cf-card cf-econ-card cf-explain-card">
                  <h4>建値価格への影響は</h4>
                  <p className="cf-kpi-note">
                    円安（USD/JPY上昇）ほど輸入コストが上がり、国内建値の上昇要因になりやすい。円高は逆にコスト低下要因として働く。
                  </p>
                  <p className="cf-kpi-note">
                    補足: USD/CNYは中国の輸入採算や需要心理に影響し、世界の銅需給を通じてLME価格に波及しやすい。
                  </p>
                </article>
              </div>
              <article className="cf-card cf-econ-card" style={{ marginTop: '16px' }}>
                <h4>通貨マーケット概要（TradingView）</h4>
                <TradingViewMarketOverview />
              </article>
            </section>

            <section id="inventory-section" className="cf-latest cf-focus-section">
              <div className="cf-latest-head">
                <h3>LME在庫　Warrant / Off-warrant</h3>
              </div>
              <div className="cf-grid">
                <article className="cf-card cf-econ-card">
                  <h4>Warrant銅在庫（最新日）</h4>
                  <div className="cf-econ-value-row">
                    <p className="cf-econ-value">
                      {warrantDashboard.warrant.latest
                        ? formatIndicatorValue(String(warrantDashboard.warrant.latest.value))
                        : '-'}
                    </p>
                    <small>t</small>
                  </div>
                  <p className="cf-econ-date">{formatYmd(warrantDashboard.warrant.latest?.date)}</p>
                  <p>
                    前日比:{' '}
                    {warrantDashboard.warrant.diffPct1d !== null
                      ? `${warrantDashboard.warrant.diffPct1d >= 0 ? '+' : ''}${warrantDashboard.warrant.diffPct1d.toFixed(2)}%`
                      : '-'}
                  </p>
                  <p>
                    7日比:{' '}
                    {warrantDashboard.warrant.diffPct7d !== null
                      ? `${warrantDashboard.warrant.diffPct7d >= 0 ? '+' : ''}${warrantDashboard.warrant.diffPct7d.toFixed(2)}%`
                      : '-'}
                  </p>
                </article>
                <article className="cf-card cf-econ-card">
                  <h4>Warrant銅在庫（月次）</h4>
                  <div className="cf-econ-value-row">
                    <p className="cf-econ-value">
                      {warrantDashboard.warrant.monthlyLatest
                        ? formatIndicatorValue(String(warrantDashboard.warrant.monthlyLatest.value))
                        : '-'}
                    </p>
                    <small>t</small>
                  </div>
                  <p className="cf-econ-date">{formatYearMonth(warrantDashboard.warrant.monthlyLatest?.month)}</p>
                  <p>
                    前月値:{' '}
                    {warrantDashboard.warrant.monthlyPrev
                      ? `${formatIndicatorValue(String(warrantDashboard.warrant.monthlyPrev.value))} t`
                      : '-'}
                  </p>
                  <p>
                    前月比:
                    <span className={`cf-change-pill ${changeClass(warrantDashboard.warrant.diffPctMoM)}`}>
                      {fmtPct(warrantDashboard.warrant.diffPctMoM)}
                    </span>
                  </p>
                </article>
                <article className="cf-card cf-econ-card cf-explain-card">
                  <h4>Warrantとは</h4>
                  <p className="cf-kpi-note">
                    Warrantは「すぐ引き渡し可能な登録在庫」。
                  </p>
                  <p className="cf-kpi-note">
                    在庫が減ると供給ひっ迫のサインになり、価格上昇圧力の先行指標になる。
                  </p>
                </article>
              </div>
              <div className="cf-grid" style={{ marginTop: '16px' }}>
                <article className="cf-card cf-econ-card">
                  <h4>off-warrant銅在庫（最新月）</h4>
                  <div className="cf-econ-value-row">
                    <p className="cf-econ-value">
                      {warrantDashboard.offWarrant.latest
                        ? formatIndicatorValue(String(warrantDashboard.offWarrant.latest.value))
                        : '-'}
                    </p>
                    <small>t</small>
                  </div>
                  <p className="cf-econ-date">{formatYearMonth(warrantDashboard.offWarrant.latest?.month)}</p>
                  <p>
                    前月比:
                    <span className={`cf-change-pill ${changeClass(warrantDashboard.offWarrant.diffPctMoM)}`}>
                      {fmtPct(warrantDashboard.offWarrant.diffPctMoM)}
                    </span>
                  </p>
                </article>
                <article className="cf-card cf-econ-card">
                  <h4>Warrant比率（月次）</h4>
                  <div className="cf-econ-value-row">
                    <p className="cf-econ-value">
                      {warrantDashboard.ratio !== null ? `${(warrantDashboard.ratio * 100).toFixed(1)}` : '-'}
                    </p>
                    <small>%</small>
                  </div>
                  <p>
                    20日平均:{' '}
                    {warrantDashboard.warrant.ma20 !== null
                      ? formatIndicatorValue(String(Math.round(warrantDashboard.warrant.ma20)))
                      : '-'}
                    {' '}t
                  </p>
                  <p className="cf-kpi-note">
                    計算式: Warrant比率 = Warrant在庫 ÷ (Warrant在庫 + off-warrant在庫) × 100
                  </p>
                </article>
                <article className="cf-card cf-econ-card cf-explain-card">
                  <h4>off-warrantとは</h4>
                  <p className="cf-kpi-note">
                    off-warrantは「倉庫にはあるが市場に出ていない在庫」。
                  </p>
                  <p className="cf-kpi-note">
                    増加は供給余力の積み上がりを示し、将来の売り圧力を読む手がかりになる。
                  </p>
                </article>
              </div>
              <div className="cf-grid cf-stock-two-col" style={{ marginTop: '16px' }}>
                <article className="cf-card cf-econ-card cf-stock-chart-card">
                  <h4>Warrant銅在庫（直近30営業日）</h4>
                  {warrantSpark.points ? (
                    <>
                      <div className="cf-chart-wrap">
                        <div className="cf-chart-yaxis">
                          <span>{formatIndicatorValue(String(Math.round(warrantBars.max)))}</span>
                          <span>{formatIndicatorValue(String(Math.round(warrantMid)))}</span>
                          <span>{formatIndicatorValue(String(Math.round(warrantBars.min)))}</span>
                          <small>t</small>
                        </div>
                        <div className="cf-mini-chart cf-mini-chart-memo cf-mini-chart-blue" aria-label="Warrant在庫推移">
                          <svg viewBox="0 0 360 180" preserveAspectRatio="none">
                            <polyline points={warrantSpark.points} />
                          </svg>
                        </div>
                      </div>
                      <div className="cf-mini-axis">
                        {warrantAxisLabels.map((label, i) => (
                          <span key={`wl-${i}`}>{label}</span>
                        ))}
                      </div>
                      <div className="cf-mini-meta">
                        <span>最小: {formatIndicatorValue(String(Math.round(warrantBars.min)))} t</span>
                        <span>最大: {formatIndicatorValue(String(Math.round(warrantBars.max)))} t</span>
                      </div>
                    </>
                  ) : (
                    <p className="cf-kpi-note">データなし</p>
                  )}
                </article>
                <article className="cf-card cf-econ-card cf-stock-chart-card">
                  <h4>off-warrant銅在庫（直近12ヶ月）</h4>
                  {offSpark.points ? (
                    <>
                      <div className="cf-chart-wrap">
                        <div className="cf-chart-yaxis">
                          <span>{formatIndicatorValue(String(Math.round(offBars.max)))}</span>
                          <span>{formatIndicatorValue(String(Math.round(offMid)))}</span>
                          <span>{formatIndicatorValue(String(Math.round(offBars.min)))}</span>
                          <small>t</small>
                        </div>
                        <div className="cf-mini-chart cf-mini-chart-memo cf-mini-chart-blue" aria-label="off-warrant在庫推移">
                          <svg viewBox="0 0 360 180" preserveAspectRatio="none">
                            <polyline points={offSpark.points} />
                          </svg>
                        </div>
                      </div>
                      <div className="cf-mini-axis">
                        {offAxisLabels.map((label, i) => (
                          <span key={`ol-${i}`}>{label}</span>
                        ))}
                      </div>
                      <div className="cf-mini-meta">
                        <span>最小: {formatIndicatorValue(String(Math.round(offBars.min)))} t</span>
                        <span>最大: {formatIndicatorValue(String(Math.round(offBars.max)))} t</span>
                      </div>
                    </>
                  ) : (
                    <p className="cf-kpi-note">データなし</p>
                  )}
                </article>
              </div>
              <div className="cf-card cf-insight-card" style={{ marginTop: '16px' }}>
                <h4>なぜこの指標が大切か</h4>
                <ul className="cf-insight-list">
                  <li>今すぐ市場で使える在庫（Warrant）と、潜在供給（off-warrant）のバランスを把握できる。</li>
                  <li>価格の転換点は在庫バランスの変化が先行しやすく、仕入れ・在庫・売りのタイミング判断に直結する。</li>
                  <li><strong>短期判断:</strong> warrant（日次） / <strong>中期判断:</strong> off-warrant（月次）+ warrant比率。</li>
                </ul>
              </div>
            </section>

            <section id="other-indicators" className="cf-latest cf-focus-section">
              <div className="cf-latest-head">
                <h3>その他指標</h3>
              </div>
              <p className="cf-kpi-note">
                データソース: FRED / Metals.dev / Alpha Vantage。更新日と更新日時を各カードに表示。
              </p>

              <div className="cf-dashboard-body cf-dashboard-body--single">
                <div className="cf-dashboard-main">
                  <div className="cf-driver-head">
                    <div className="cf-driver-tabs">
                      <Link
                        className={`cf-tone-btn ${driverFilter === 'all' ? 'active' : ''}`}
                        href={to(`/?driver=all&horizon=${horizon}#other-indicators`)}
                      >
                        すべて
                      </Link>
                      <Link
                        className={`cf-tone-btn ${driverFilter === 'bullish' ? 'active' : ''}`}
                        href={to(`/?driver=bullish&horizon=${horizon}#other-indicators`)}
                      >
                        上昇圧力
                      </Link>
                      <Link
                        className={`cf-tone-btn ${driverFilter === 'bearish' ? 'active' : ''}`}
                        href={to(`/?driver=bearish&horizon=${horizon}#other-indicators`)}
                      >
                        下落圧力
                      </Link>
                    </div>
                  </div>
                    <div className="cf-econ-list">
                      {decisionIndicatorsToShow.map((ind) => (
                      <article key={ind.id} id={`indicator-${ind.id}`} className="cf-econ-card">
                        <div className="cf-econ-top">
                          <h4>{displayIndicatorName(ind.name)}</h4>
                          <span
                            className={`cf-econ-change ${
                              ind.direction === 'up' ? 'up' : ind.direction === 'down' ? 'down' : 'neutral'
                            }`}
                          >
                            {ind.direction === 'up' ? '上昇圧力' : ind.direction === 'down' ? '下落圧力' : '条件付き'}
                          </span>
                        </div>
                        <div className="cf-econ-value-row">
                          <p className="cf-econ-value">{formatIndicatorValue(ind.value)}</p>
                          <small>{ind.units || '-'}</small>
                        </div>
                        <p className="cf-econ-date">{formatYmd(ind.date)}</p>
                        {ind.lastUpdated ? <p className="cf-econ-date">更新日時: {formatYmd(ind.lastUpdated)}</p> : null}
                        <p className="cf-kpi-note">
                          変化:
                          <span
                            className={`cf-change-pill ${
                              ind.changePercent
                                ? ind.changePercent.startsWith('+')
                                  ? 'up'
                                  : 'down'
                                : 'neutral'
                            }`}
                          >
                            {ind.changePercent || '-'}
                          </span>
                        </p>
                        <p className="cf-ind-help"><strong>{directionSummary(ind.direction)}</strong></p>
                        <p className="cf-ind-help cf-ind-quick"><strong>上がると:</strong> {indicatorUpDownImpact(ind.id).up}</p>
                        <p className="cf-ind-help cf-ind-quick"><strong>下がると:</strong> {indicatorUpDownImpact(ind.id).down}</p>
                        <details className="cf-ind-detail">
                          <summary>詳細を見る</summary>
                          <p className="cf-ind-help">指標: {toPlainStyle(ind.help.what)}</p>
                          <p className="cf-ind-help">銅への影響: {toPlainStyle(ind.help.copperImpact)}</p>
                          <p className="cf-ind-help">{toPlainStyle(directionAction(ind.direction).buy)}</p>
                          <p className="cf-ind-help">{toPlainStyle(directionAction(ind.direction).sell)}</p>
                        </details>
                      </article>
                    ))}
                  </div>

                  <details id="all-indicators" className="cf-all-indicators" open={showAllIndicators}>
                    <summary>全指標を見る（{freshIndicators.length}件 / 期間有効・{staleIndicatorsCount}件 / 期間外）</summary>
                    <div className="cf-econ-list" style={{ marginTop: '12px' }}>
                      {allIndicatorsWithFresh.map((ind) => (
                        <article key={`all-${ind.id}`} className="cf-econ-card">
                          <div className="cf-econ-top">
                            <h4>{displayIndicatorName(ind.name)}</h4>
                            <span
                              className={`cf-econ-change ${
                                !ind.isFresh ? 'neutral' : ind.direction === 'up' ? 'up' : ind.direction === 'down' ? 'down' : 'neutral'
                              }`}
                            >
                              {!ind.isFresh ? '期間外' : ind.direction === 'up' ? '上昇圧力' : ind.direction === 'down' ? '下落圧力' : '条件付き'}
                            </span>
                          </div>
                          <div className="cf-econ-value-row">
                            <p className="cf-econ-value">{formatIndicatorValue(ind.value)}</p>
                            <small>{ind.units || '-'}</small>
                          </div>
                          <p className="cf-econ-date">{formatYmd(ind.date)}</p>
                          {ind.lastUpdated ? <p className="cf-econ-date">更新日時: {formatYmd(ind.lastUpdated)}</p> : null}
                          <p className="cf-kpi-note">
                            変化:
                            <span
                              className={`cf-change-pill ${
                                ind.changePercent
                                  ? ind.changePercent.startsWith('+')
                                    ? 'up'
                                    : 'down'
                                  : 'neutral'
                              }`}
                            >
                              {ind.changePercent || '-'}
                            </span>
                          </p>
                          <p className="cf-ind-help"><strong>{directionSummary(ind.direction)}</strong></p>
                          <p className="cf-ind-help cf-ind-quick"><strong>上がると:</strong> {indicatorUpDownImpact(ind.id).up}</p>
                          <p className="cf-ind-help cf-ind-quick"><strong>下がると:</strong> {indicatorUpDownImpact(ind.id).down}</p>
                          <details className="cf-ind-detail">
                            <summary>詳細を見る</summary>
                            <p className="cf-ind-help">指標: {toPlainStyle(ind.help.what)}</p>
                            <p className="cf-ind-help">銅への影響: {toPlainStyle(ind.help.copperImpact)}</p>
                            <p className="cf-ind-help">{toPlainStyle(directionAction(ind.direction).buy)}</p>
                            <p className="cf-ind-help">{toPlainStyle(directionAction(ind.direction).sell)}</p>
                          </details>
                        </article>
                      ))}
                    </div>
                  </details>
                </div>
              </div>
            </section>

            {adsEnabled ? (
              <section className="cf-latest">
                <AdSlot slot={adSlotMid} label="記事間広告" />
              </section>
            ) : null}

            <section className="cf-latest cf-focus-section" style={{ marginTop: '30px' }}>
              <div className="cf-latest-head">
                <h3>経済指標カレンダー</h3>
              </div>
              <div className="cf-calendar-wrap">
                <iframe
                  src="https://sslecal2.investing.com?borderColor=%23ffffff&columns=exc_flags,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous&features=datepicker,timezone&countries=5,4,10,14,48,25,6,36,12,26,41,17,43,22,32,178,42,72,37,110,46,35,11,39&calType=week&timeZone=29&lang=11"
                  className="cf-calendar-iframe"
                  title="経済カレンダー"
                  loading="lazy"
                />
                <p className="cf-calendar-note">
                  金融ポータルサイト
                  {' '}
                  <a href="https://jp.investing.com/" rel="nofollow noreferrer" target="_blank">
                    Investing.com 日本
                  </a>
                  {' '}
                  提供の経済カレンダー
                </p>
              </div>
            </section>

          </>
        ) : null}

        {featured ? (
          <section className="cf-featured cf-articles-start">
            <div className="cf-latest-head">
              <h3>注目記事</h3>
            </div>
            <div className="cf-featured-card">
              <div className="cf-featured-card-layout">
                <div className="cf-featured-card-image">
                  <SafeImage
                    src={resolveCardImage(featured.coverImage?.url, fallbackImages[0], featured.slug)}
                    fallback={fallbackImages[0]}
                    alt={featured.title}
                  />
                </div>
                <div className="cf-featured-card-content">
                  <p className="cf-post-cat">{featured.categories?.[0]?.name || 'Featured'}</p>
                  <h2>
                    <Link href={to(`/blog/${featured.slug || featured.id}`)}>{featured.title}</Link>
                  </h2>
                  <p>{featured.excerpt || '最新の市場インサイトを深く読み解く特集記事です。'}</p>
                  <Link href={to(`/blog/${featured.slug || featured.id}`)}>Read Article ↗</Link>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="cf-latest">
          <div className="cf-latest-head">
            <h3>最新記事</h3>
          </div>
          <div className="cf-grid">
            {others.map((post, index) => (
              <article key={post.id} className="cf-card">
                <div className="cf-card-image">
                  <SafeImage
                    src={resolveCardImage(
                      post.coverImage?.url,
                      fallbackImages[(index + 1) % fallbackImages.length],
                      post.slug
                    )}
                    fallback={fallbackImages[(index + 1) % fallbackImages.length]}
                    alt={post.title}
                  />
                </div>
                <div className="cf-meta">
                  <span>{post.categories?.[0]?.name || 'Article'}</span>
                  <small>{formatDate(post.publishedAt)}</small>
                </div>
                <h4>
                  <Link href={to(`/blog/${post.slug || post.id}`)}>{post.title}</Link>
                </h4>
                <p>{post.excerpt || '詳しくは記事本文をご覧ください。'}</p>
                <Link href={to(`/blog/${post.slug || post.id}`)}>読む</Link>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="cf-footer">
        <p className="cf-footer-links">
          <Link href={to('/category/about')}>このサイトについて</Link>
          <span> / </span>
          <Link href={to('/blog/privacypolicy')}>プライバシーポリシー</Link>
          <span> / </span>
          <Link href={to('/blog/disclaimer')}>免責事項</Link>
        </p>
        <p className="cf-footer-note">
          本サイトは公開データ/APIをもとに情報を掲載しています。できるだけ最新化していますが、反映に時間差が出る場合があります。
        </p>
        <p>© 2026 Copper for me. All Rights Reserved.</p>
      </footer>
    </div>
  );
}
