import { promises as fs } from 'fs';
import path from 'path';

type Indicator = {
  id: string;
  name: string;
  value: string;
  date: string;
  lastUpdated?: string;
  units: string;
  frequency: string;
  source: 'FRED' | 'Alpha Vantage' | 'Metals.dev';
  changePercent?: string;
};

type EconomyBundle = {
  cacheVersion?: number;
  updatedAt: string;
  cacheDateJst?: string;
  cacheBucketJst?: string;
  fred: Indicator[];
  alpha: Indicator[];
};

type FredSeries = {
  id: string;
  name: string;
};

const FRED_SERIES: FredSeries[] = [
  { id: 'NAPM', name: 'ISM製造業景況指数' },
  { id: 'DTWEXBGS', name: '名目実効ドル指数（Broad）' },
  { id: 'FEDFUNDS', name: '米政策金利（FF金利）' },
  { id: 'DGS10', name: '米10年国債利回り' },
  { id: 'VIXCLS', name: 'VIX（恐怖指数）' },
  { id: 'IPMAN', name: '米製造業生産指数' },
  { id: 'CHNPIEATI01GYQ', name: '中国PPI（工業）' },
  { id: 'TLRESCONS', name: '建設支出（米国）' },
  { id: 'PERMIT', name: '建設許可件数（米国）' },
  { id: 'HOUST', name: '住宅着工件数' },
  { id: 'TCU', name: '設備稼働率（米国）' },
  { id: 'USSLIND', name: '米景気先行指数（LEI）' },
  { id: 'DCOILWTICO', name: '原油価格（WTI）' },
  { id: 'DCOILBRENTEU', name: '原油価格（Brent）' },
  { id: 'DHHNGSP', name: '天然ガス価格（Henry Hub）' },
  { id: 'GASREGCOVW', name: 'ガソリン価格（全米平均）' },
  { id: 'CES3000000003', name: '製造業の平均時給' },
  { id: 'GDP', name: '米国GDP（四半期）' },
  { id: 'CPIAUCSL', name: '米CPI（総合）' }
  ,
  { id: 'PPIACO', name: '生産者物価指数（PPI）' },
  { id: 'CES1021210001', name: '鉱業部門の雇用者数' },
  { id: 'CHLPROINDMISMEI', name: 'チリ鉱工業生産指数' },
  { id: 'PERPROINDMISMEI', name: 'ペルー鉱工業生産指数' },
  { id: 'CES1021210008', name: '鉱業部門の平均時給' },
  { id: 'DGORDER', name: '製造業の新規受注' },
  { id: 'TTLCONS', name: '建設支出（総合）' }
];

function isFiniteNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n);
}

function formatChangePercent(currentRaw: string, prevRaw: string): string | undefined {
  if (!isFiniteNumber(currentRaw) || !isFiniteNumber(prevRaw)) return undefined;
  const current = Number(currentRaw);
  const prev = Number(prevRaw);
  if (prev === 0) return undefined;
  const delta = ((current - prev) / Math.abs(prev)) * 100;
  if (!Number.isFinite(delta)) return undefined;
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%`;
}

function withChangeFromPrev(
  current: Indicator | null,
  prev: Indicator | null
): Indicator | null {
  if (!current) return null;
  if (current.changePercent) return current;
  if (!prev) return current;
  const changePercent = formatChangePercent(String(current.value || ''), String(prev.value || ''));
  return { ...current, changePercent };
}

const CACHE_FILE =
  process.env.ECONOMY_CACHE_FILE ||
  path.join(process.cwd(), '.cache', 'autopilot_blog_economy_cache.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_VERSION = 3;

function getTodayJstYmd() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getNoonBucketJst() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const base = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
  // 12:00 JSTで日次バケットを切り替える
  if (jst.getUTCHours() < 12) {
    base.setUTCDate(base.getUTCDate() - 1);
  }
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, '0');
  const d = String(base.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysSince(dateText: string): number {
  const ts = new Date(dateText).getTime();
  if (!Number.isFinite(ts)) return 0;
  const diff = Date.now() - ts;
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function isIndicatorFresh(ind: Indicator): boolean {
  const freq = (ind.frequency || '').toLowerCase();
  const ageDays = daysSince(ind.date);
  if (freq.includes('daily')) return ageDays <= 45;
  if (freq.includes('weekly')) return ageDays <= 60;
  if (freq.includes('monthly')) return ageDays <= 140;
  if (freq.includes('quarter')) return ageDays <= 260;
  return ageDays <= 180;
}

function filterFreshIndicators(list: Indicator[]): Indicator[] {
  return list.filter(isIndicatorFresh);
}

async function readCache(): Promise<EconomyBundle | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as EconomyBundle;
    if (!parsed?.updatedAt) return null;
    if ((parsed.cacheVersion || 0) !== CACHE_VERSION) return null;
    // Backward compatibility: refresh old cache that lacks per-indicator lastUpdated.
    const hasMissingLastUpdated = [...(parsed.fred || []), ...(parsed.alpha || [])].some(
      (i) => i && !i.lastUpdated
    );
    if (hasMissingLastUpdated) return null;
    // Hard cap API usage: reuse within same JST noon bucket (12:00 switch).
    const bucket = getNoonBucketJst();
    if (parsed.cacheBucketJst && parsed.cacheBucketJst === bucket) {
      return parsed;
    }
    // Backward compatibility with old daily cache field.
    if (!parsed.cacheBucketJst && parsed.cacheDateJst && parsed.cacheDateJst === getTodayJstYmd()) {
      return parsed;
    }
    const ageMs = Date.now() - new Date(parsed.updatedAt).getTime();
    if (!Number.isFinite(ageMs) || ageMs > CACHE_TTL_MS) return null;
    // If Metals.dev is enabled, require lme_copper_jpy in cache.
    const hasMetalsKey = Boolean((process.env.METALS_DEV_API_KEY || '').trim());
    if (hasMetalsKey) {
      const hasLme = Array.isArray(parsed.fred)
        ? parsed.fred.some((i) => i && i.id === 'lme_copper_jpy' && i.source === 'Metals.dev')
        : false;
      if (!hasLme) return null;
    }
    const hasAlphaKey = Boolean((process.env.ALPHA_VANTAGE_API_KEY || '').trim());
    if (hasAlphaKey) {
      const hasUsdJpy = Array.isArray(parsed.alpha)
        ? parsed.alpha.some(
            (i) =>
              i &&
              i.id === 'usd_jpy' &&
              (i.source === 'Alpha Vantage' || i.source === 'Metals.dev')
          )
        : false;
      if (!hasUsdJpy) return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function readCacheAny(): Promise<EconomyBundle | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as EconomyBundle;
    if (!parsed?.updatedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(bundle: EconomyBundle): Promise<void> {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(bundle), 'utf8');
  } catch {
    // Ignore cache write errors.
  }
}

async function fetchFredIndicators(): Promise<Indicator[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return [];

  const out: Indicator[] = [];
  for (const item of FRED_SERIES) {
    try {
      const obsUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=${item.id}&api_key=${apiKey}&file_type=json`;
      const obsRes = await fetch(obsUrl, { cache: 'no-store' });
      const obsData = await obsRes.json();
      const observations = Array.isArray(obsData?.observations) ? obsData.observations : [];
      const valid = observations
        .slice()
        .reverse()
        .find((o: any) => o?.value && o.value !== '.');
      const validList = observations
        .slice()
        .reverse()
        .filter((o: any) => o?.value && o.value !== '.');
      const latest = validList[0];
      const prev = validList[1];
      if (!latest || !valid) continue;

      const metaUrl = `https://api.stlouisfed.org/fred/series?series_id=${item.id}&api_key=${apiKey}&file_type=json`;
      const metaRes = await fetch(metaUrl, { cache: 'no-store' });
      const metaData = await metaRes.json();
      const meta = Array.isArray(metaData?.seriess) ? metaData.seriess[0] : {};

      out.push({
        id: item.id,
        name: item.name,
        value: String(latest.value ?? ''),
        date: String(latest.date ?? ''),
        lastUpdated: String(meta?.last_updated || ''),
        units: String(meta?.units ?? ''),
        frequency: String(meta?.frequency ?? ''),
        source: 'FRED',
        changePercent: formatChangePercent(String(latest.value ?? ''), String(prev?.value ?? ''))
      });
    } catch {
      // Ignore one-series failure and continue.
    }
  }
  return filterFreshIndicators(out);
}

async function fetchFredSeriesLatest(seriesId: string): Promise<{
  value: string;
  date: string;
  lastUpdated?: string;
  units: string;
  frequency: string;
  prevValue?: string;
} | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;
  try {
    const obsUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json`;
    const obsRes = await fetch(obsUrl, { cache: 'no-store' });
    const obsData = await obsRes.json();
    const observations = Array.isArray(obsData?.observations) ? obsData.observations : [];
    const validList = observations
      .slice()
      .reverse()
      .filter((o: any) => o?.value && o.value !== '.');
    const latest = validList[0];
    const prev = validList[1];
    if (!latest) return null;

    const metaUrl = `https://api.stlouisfed.org/fred/series?series_id=${seriesId}&api_key=${apiKey}&file_type=json`;
    const metaRes = await fetch(metaUrl, { cache: 'no-store' });
    const metaData = await metaRes.json();
    const meta = Array.isArray(metaData?.seriess) ? metaData.seriess[0] : {};

    return {
      value: String(latest.value ?? ''),
      date: String(latest.date ?? ''),
      lastUpdated: String(meta?.last_updated || ''),
      units: String(meta?.units ?? ''),
      frequency: String(meta?.frequency ?? ''),
      prevValue: String(prev?.value ?? '')
    };
  } catch {
    return null;
  }
}

function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toYmdJst(base: Date, minusDays: number): string {
  const jst = new Date(base.getTime() + 9 * 60 * 60 * 1000);
  const shifted = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
  shifted.setUTCDate(shifted.getUTCDate() - minusDays);
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

async function fetchLmeCopperFromMetalsDev(): Promise<Indicator | null> {
  const apiKey = (process.env.METALS_DEV_API_KEY || '').trim();
  if (!apiKey) return null;

  // Prefer the latest endpoint (stable in user's environment).
  try {
    const latestUrl =
      `https://api.metals.dev/v1/latest` +
      `?api_key=${apiKey}&currency=USD&unit=kg`;
    const latestRes = await fetch(latestUrl, { cache: 'no-store' });
    if (latestRes.ok) {
      const latestData = await latestRes.json();
      const metalUsdPerKg = Number(
        latestData?.metals?.lme_copper ?? latestData?.metals?.copper
      );
      const usdPerJpy = Number(latestData?.currencies?.JPY);
      if (Number.isFinite(metalUsdPerKg) && Number.isFinite(usdPerJpy) && usdPerJpy > 0) {
        // latest API returns USD/kg and USD-per-currency.
        const jpyPerKg = metalUsdPerKg / usdPerJpy;
        const jpyPerMt = jpyPerKg * 1000;
        const ts = String(latestData?.timestamps?.metal || '').slice(0, 10);
        return {
          id: 'lme_copper_jpy',
          name: 'LME銅（Metals.dev）',
          value: String(jpyPerMt),
          date: ts || toYmd(new Date()),
          lastUpdated: String(latestData?.timestamps?.metal || ''),
          units: 'JPY/mt',
          frequency: 'Daily',
          source: 'Metals.dev'
        };
      }
    }
  } catch {
    // Fallback to authority endpoint below.
  }

  const fetchCopperGbp = async (
    date: string
  ): Promise<{ value: number; date: string } | null> => {
    const url =
      `https://api.metals.dev/v1/metal/authority` +
      `?authority=lme&metal=copper&currency=GBP&date=${date}&api_key=${apiKey}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const v = Number(data?.rates?.copper ?? data?.metals?.copper ?? data?.price);
    return Number.isFinite(v) ? { value: v, date } : null;
  };

  const fxUrl = `https://api.metals.dev/v1/currencies?api_key=${apiKey}`;
  const fxRes = await fetch(fxUrl, { cache: 'no-store' });
  if (!fxRes.ok) return null;
  const fxData = await fxRes.json();
  const rates = fxData?.rates || fxData?.currencies || {};
  const gbp = Number(rates?.GBP);
  const jpy = Number(rates?.JPY);
  if (!Number.isFinite(gbp) || !Number.isFinite(jpy) || gbp === 0) return null;
  const gbpToJpy = jpy / gbp;

  const now = new Date();
  const points: Array<{ value: number; date: string }> = [];
  for (let i = 1; i <= 7; i += 1) {
    const date = toYmdJst(now, i);
    // eslint-disable-next-line no-await-in-loop
    const p = await fetchCopperGbp(date);
    if (p) points.push(p);
    if (points.length >= 2) break;
  }
  if (!points.length) return null;

  const latest = points[0];
  const prev = points[1] || null;
  const jpy0 = latest.value * gbpToJpy;
  const jpy1 = prev ? prev.value * gbpToJpy : NaN;

  return {
    id: 'lme_copper_jpy',
    name: 'LME銅（Metals.dev）',
    value: String(jpy0),
    date: latest.date,
    lastUpdated: String(fxData?.timestamps?.currency || ''),
    units: 'JPY/mt',
    frequency: 'Daily',
    source: 'Metals.dev',
    changePercent: Number.isFinite(jpy1) ? formatChangePercent(String(jpy0), String(jpy1)) : undefined
  };
}

async function fetchUsdJpyFromMetalsDev(): Promise<Indicator | null> {
  const apiKey = (process.env.METALS_DEV_API_KEY || '').trim();
  if (!apiKey) return null;

  try {
    const latestUrl =
      `https://api.metals.dev/v1/latest` +
      `?api_key=${apiKey}&currency=USD&unit=kg`;
    const res = await fetch(latestUrl, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const usdPerJpy = Number(data?.currencies?.JPY);
    if (!Number.isFinite(usdPerJpy) || usdPerJpy <= 0) return null;

    return {
      id: 'usd_jpy',
      name: 'USD/JPY 為替レート（Metals.dev）',
      value: String(1 / usdPerJpy),
      date: String(data?.timestamps?.currency || data?.timestamps?.metal || '').slice(0, 10) ||
        toYmd(new Date()),
      lastUpdated: String(data?.timestamps?.currency || data?.timestamps?.metal || ''),
      units: 'JPY/USD',
      frequency: 'Daily',
      source: 'Metals.dev'
    };
  } catch {
    return null;
  }
}

async function fetchAlphaIndicators(): Promise<Indicator[]> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return [];

  const tasks = [
    {
      id: 'usd_jpy',
      name: 'USD/JPY 為替レート',
      units: 'JPY/USD',
      frequency: 'Daily',
      url: `https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=USD&to_symbol=JPY&apikey=${apiKey}`,
      parse: (data: any) => {
        const series = data?.['Time Series FX (Daily)'] || {};
        const keys = Object.keys(series).sort((a, b) => (a < b ? 1 : -1));
        const latest = keys[0];
        const prev = keys[1];
        return latest
          ? {
              value: String(series[latest]?.['4. close'] ?? ''),
              date: latest,
              prevValue: String(series[prev]?.['4. close'] ?? '')
            }
          : null;
      }
    },
    {
      id: 'copx',
      name: '銅ETF（COPX）',
      units: 'USD',
      frequency: 'Daily',
      url: `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=COPX&apikey=${apiKey}`,
      parse: (data: any) => {
        const series = data?.['Time Series (Daily)'] || {};
        const keys = Object.keys(series).sort((a, b) => (a < b ? 1 : -1));
        const latest = keys[0];
        const prev = keys[1];
        return latest
          ? {
              value: String(series[latest]?.['4. close'] ?? ''),
              date: latest,
              prevValue: String(series[prev]?.['4. close'] ?? '')
            }
          : null;
      }
    },
    {
      id: 'usd_cny',
      name: 'USD/CNY 為替レート',
      units: 'CNY/USD',
      frequency: 'Daily',
      url: `https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=USD&to_symbol=CNY&apikey=${apiKey}`,
      parse: (data: any) => {
        const series = data?.['Time Series FX (Daily)'] || {};
        const keys = Object.keys(series).sort((a, b) => (a < b ? 1 : -1));
        const latest = keys[0];
        const prev = keys[1];
        return latest
          ? {
              value: String(series[latest]?.['4. close'] ?? ''),
              date: latest,
              prevValue: String(series[prev]?.['4. close'] ?? '')
            }
          : null;
      }
    },
    {
      id: 'fcx',
      name: 'Freeport-McMoRan（FCX）',
      units: 'USD',
      frequency: 'Daily',
      url: `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=FCX&apikey=${apiKey}`,
      parse: (data: any) => {
        const series = data?.['Time Series (Daily)'] || {};
        const keys = Object.keys(series).sort((a, b) => (a < b ? 1 : -1));
        const latest = keys[0];
        const prev = keys[1];
        return latest
          ? {
              value: String(series[latest]?.['4. close'] ?? ''),
              date: latest,
              prevValue: String(series[prev]?.['4. close'] ?? '')
            }
          : null;
      }
    },
    {
      id: 'sp500',
      name: 'S&P500連動ETF（SPY）',
      units: 'USD',
      frequency: 'Daily',
      url: `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=SPY&apikey=${apiKey}`,
      parse: (data: any) => {
        const series = data?.['Time Series (Daily)'] || {};
        const keys = Object.keys(series).sort((a, b) => (a < b ? 1 : -1));
        const latest = keys[0];
        const prev = keys[1];
        return latest
          ? {
              value: String(series[latest]?.['4. close'] ?? ''),
              date: latest,
              prevValue: String(series[prev]?.['4. close'] ?? '')
            }
          : null;
      }
    },
    {
      id: 'sector_performance',
      name: 'セクター別リアルタイムパフォーマンス',
      units: '%',
      frequency: 'Real-Time',
      url: `https://www.alphavantage.co/query?function=SECTOR&apikey=${apiKey}`,
      parse: (data: any) => {
        const sector = data?.['Rank A: Real-Time Performance'];
        if (!sector) return null;
        return {
          value: JSON.stringify(sector),
          date: new Date().toISOString().slice(0, 10)
        };
      }
    }
  ];

  const out: Indicator[] = [];
  for (let i = 0; i < tasks.length; i += 1) {
    const task = tasks[i];
    try {
      const res = await fetch(task.url, { cache: 'no-store' });
      const data = await res.json();
      const parsed = task.parse(data);
      if (!parsed) continue;
      const lastUpdated =
        String((parsed as any)?.lastUpdated || '') ||
        String(data?.['Meta Data']?.['3. Last Refreshed'] || '') ||
        String(data?.['Meta Data']?.['4. Last Refreshed'] || '') ||
        String(parsed.date || '');
      out.push({
        id: task.id,
        name: task.name,
        value: parsed.value,
        date: parsed.date,
        lastUpdated,
        units: task.units,
        frequency: task.frequency,
        source: 'Alpha Vantage',
        changePercent: formatChangePercent(parsed.value, String((parsed as any).prevValue ?? ''))
      });
    } catch {
      // Continue even if one source fails.
    }
    // Alpha Vantage free tier対策: 連続呼び出しを少し間引く
    if (i < tasks.length - 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }
  return filterFreshIndicators(out);
}

export async function getEconomyIndicators(): Promise<EconomyBundle> {
  const [cachedAny, cached] = await Promise.all([readCacheAny(), readCache()]);
  if (cached) return cached;
  const hasMetalsKey = Boolean((process.env.METALS_DEV_API_KEY || '').trim());

  const [lme, usdJpyMetals, fredRaw, alphaRaw, fredCopper, fredUsdJpy] = await Promise.all([
    fetchLmeCopperFromMetalsDev(),
    fetchUsdJpyFromMetalsDev(),
    fetchFredIndicators(),
    fetchAlphaIndicators(),
    fetchFredSeriesLatest('PCOPPUSDM'),
    fetchFredSeriesLatest('DEXJPUS')
  ]);
  const prevLme =
    cachedAny?.fred?.find((i) => i.id === 'lme_copper_jpy') || null;
  const lmeFallback =
    !hasMetalsKey && fredCopper && !lme && !prevLme
      ? {
          id: 'lme_copper_jpy',
          name: 'LME銅（FRED代替）',
          value: fredCopper.value,
          date: fredCopper.date,
          lastUpdated: fredCopper.lastUpdated,
          units: fredCopper.units || 'USD/mt',
          frequency: fredCopper.frequency || 'Monthly',
          source: 'FRED' as const,
          changePercent: formatChangePercent(fredCopper.value, String(fredCopper.prevValue || ''))
        }
      : null;
  const lmeMerged = withChangeFromPrev(lme, prevLme) || prevLme || lmeFallback;
  const fred = lmeMerged ? [lmeMerged, ...fredRaw.filter((i) => i.id !== 'lme_copper_jpy')] : fredRaw;

  const hasUsdJpy = alphaRaw.some((i) => i.id === 'usd_jpy');
  const prevAlpha = cachedAny?.alpha || [];
  const alphaWithoutUsdJpy = alphaRaw.filter((i) => i.id !== 'usd_jpy');
  const usdJpyFallback =
    !hasMetalsKey &&
    !hasUsdJpy &&
    !prevAlpha.some((i) => i.id === 'usd_jpy') &&
    fredUsdJpy
      ? [
          {
            id: 'usd_jpy',
            name: 'USD/JPY 為替レート（FRED代替）',
            value: fredUsdJpy.value,
            date: fredUsdJpy.date,
            lastUpdated: fredUsdJpy.lastUpdated,
            units: fredUsdJpy.units || 'JPY/USD',
            frequency: fredUsdJpy.frequency || 'Daily',
            source: 'FRED' as const,
            changePercent: formatChangePercent(fredUsdJpy.value, String(fredUsdJpy.prevValue || ''))
          }
        ]
      : [];
  const prevUsdJpy = prevAlpha.find((i) => i.id === 'usd_jpy') || null;
  const usdJpyMerged =
    withChangeFromPrev(usdJpyMetals, prevUsdJpy) ||
    alphaRaw.find((i) => i.id === 'usd_jpy') ||
    prevUsdJpy ||
    usdJpyFallback[0] ||
    null;
  const alpha = [...(usdJpyMerged ? [usdJpyMerged] : []), ...alphaWithoutUsdJpy];

  const bundle: EconomyBundle = {
    cacheVersion: CACHE_VERSION,
    updatedAt: new Date().toISOString(),
    cacheDateJst: getTodayJstYmd(),
    cacheBucketJst: getNoonBucketJst(),
    fred,
    alpha
  };
  await writeCache(bundle);
  return bundle;
}

export function formatIndicatorValue(raw: string): string {
  if (!raw) return '-';
  if (!isFiniteNumber(raw)) return raw;
  return Number(raw).toLocaleString();
}
