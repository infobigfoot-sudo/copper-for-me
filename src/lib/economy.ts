import { promises as fs } from 'fs';
import path from 'path';
import { readLatestEconomySnapshotFromMicrocms } from '@/lib/microcms_snapshot';

export type Indicator = {
  id: string;
  name: string;
  value: string;
  date: string;
  lastUpdated?: string;
  units: string;
  frequency: string;
  source: 'FRED' | 'Alpha Vantage' | 'Metals.dev' | 'CSV';
  changePercent?: string;
};

export type EconomyBundle = {
  cacheVersion?: number;
  updatedAt: string;
  cacheDateJst?: string;
  cacheBucketJst?: string;
  sourceStatus?: {
    mode?: 'snapshot' | 'live' | 'csv';
    fred?: 'ok' | 'fallback' | 'empty';
    alpha?: 'ok' | 'fallback' | 'empty';
    metals?: 'ok' | 'fallback' | 'disabled' | 'empty';
    snapshotWrite?: 'ok' | 'error';
  };
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
  path.join(process.cwd(), '.cache', 'copper_for_me_economy_cache.json');
const SNAPSHOT_FILE =
  process.env.ECONOMY_SNAPSHOT_FILE ||
  path.join(process.cwd(), 'public', 'data', 'economy_snapshot.json');
const PUBLISH_SELECTED_SERIES_FILE =
  process.env.PUBLISH_SELECTED_SERIES_FILE ||
  path.join(process.cwd(), 'public', 'data', 'selected_series_bundle.json');
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

const ECONOMY_DATA_ROOT =
  process.env.ECONOMY_DATA_ROOT ||
  path.resolve(process.cwd(), '..', '..', 'stock-data-processor', 'data');

type CsvRow = Record<string, string>;
type PublishPoint = { date: string; value: number };
type PublishMetaRow = {
  indicator_key?: string;
  display_name?: string;
  freq_hint?: string;
  series_key?: string | null;
};
type PublishSeriesBundle = {
  generated_at?: string;
  series?: Record<string, PublishPoint[]>;
  latest?: Record<string, PublishPoint | null>;
  meta?: Record<string, PublishMetaRow>;
};

async function readSimpleCsv(filePath: string): Promise<CsvRow[]> {
  const raw = await fs.readFile(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((s) => s.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const row: CsvRow = {};
    for (let i = 0; i < header.length; i += 1) row[header[i]] = String(cols[i] ?? '').trim();
    return row;
  });
}

function toDisplayFreq(freqHint?: string): string {
  const raw = String(freqHint || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'daily') return 'Daily';
  if (raw === 'weekly') return 'Weekly';
  if (raw === 'monthly') return 'Monthly';
  if (raw === 'yearly' || raw === 'annual') return 'Yearly';
  return raw;
}

function publishAliasToIndicatorId(alias: string, meta?: PublishMetaRow): string {
  const explicit: Record<string, string> = {
    lme_copper_cash_usd_t: 'lme_copper_usd',
    japan_tatene_jpy_t: 'japan_tatene_jpy_mt',
    america_dexjpus: 'usd_jpy',
    america_dexchus: 'usd_cny',
    america_fcx_close: 'fcx',
    america_copx_close: 'copx',
    america_spy_close: 'sp500',
    dgs10: 'DGS10'
  };
  if (explicit[alias]) return explicit[alias];
  const seriesKey = String(meta?.series_key || '').trim();
  if (seriesKey) return seriesKey;
  const indicatorKey = String(meta?.indicator_key || '').trim();
  if (indicatorKey.startsWith('america_')) return indicatorKey.replace(/^america_/, '').toUpperCase();
  return alias;
}

function publishAliasToUnits(alias: string, indicatorId: string): string {
  const map: Record<string, string> = {
    lme_copper_cash_usd_t: 'USD/mt',
    lme_copper_3month_usd_t: 'USD/mt',
    lme_copper_stock_t: 't',
    japan_tatene_jpy_t: 'JPY/mt',
    america_dexjpus: 'JPY/USD',
    america_dexchus: 'CNY/USD',
    america_fcx_close: 'USD',
    america_copx_close: 'USD',
    america_spy_close: 'USD',
    warrant_copper_daily_t: 't',
    warrant_copper_monthly_t: 't',
    offwarrant_copper_monthly_t: 't'
  };
  return map[alias] || map[indicatorId] || '';
}

function publishAliasToName(alias: string, indicatorId: string, meta?: PublishMetaRow): string {
  const map: Record<string, string> = {
    lme_copper_cash_usd_t: 'LME銅',
    lme_copper_stock_t: 'LME銅在庫',
    japan_tatene_jpy_t: '国内建値',
    america_dexjpus: 'USD/JPY 為替レート',
    america_dexchus: 'USD/CNY 為替レート',
    america_fcx_close: 'Freeport-McMoRan（FCX）',
    america_copx_close: '銅ETF（COPX）',
    america_spy_close: 'S&P500連動ETF（SPY）'
  };
  return map[alias] || String(meta?.display_name || indicatorId || alias);
}

function buildIndicatorFromPublishSeries(
  alias: string,
  bundle: PublishSeriesBundle
): Indicator | null {
  const series = Array.isArray(bundle.series?.[alias]) ? (bundle.series?.[alias] as PublishPoint[]) : [];
  const latest = (bundle.latest?.[alias] as PublishPoint | null | undefined) ?? series[series.length - 1] ?? null;
  if (!latest || latest.value == null || !latest.date) return null;
  const meta = bundle.meta?.[alias];
  const id = publishAliasToIndicatorId(alias, meta);
  const prev = series.length >= 2 ? series[series.length - 2] : null;
  const valueStr = String(latest.value);
  const prevStr = prev ? String(prev.value) : '';
  return {
    id,
    name: publishAliasToName(alias, id, meta),
    value: valueStr,
    date: String(latest.date),
    lastUpdated: String(bundle.generated_at || ''),
    units: publishAliasToUnits(alias, id),
    frequency: toDisplayFreq(meta?.freq_hint),
    source: 'CSV',
    changePercent: formatChangePercent(valueStr, prevStr)
  };
}

async function readPublishSelectedSeriesBundle(): Promise<PublishSeriesBundle | null> {
  try {
    const raw = await fs.readFile(PUBLISH_SELECTED_SERIES_FILE, 'utf8');
    const parsed = JSON.parse(raw) as PublishSeriesBundle;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function getEconomyIndicatorsFromPublishJson(): Promise<EconomyBundle | null> {
  const bundle = await readPublishSelectedSeriesBundle();
  if (!bundle?.series) return null;
  const aliases = Object.keys(bundle.series || {});
  if (!aliases.length) return null;
  const indicators = aliases
    .map((alias) => buildIndicatorFromPublishSeries(alias, bundle))
    .filter((i): i is Indicator => Boolean(i))
    .filter((i) => i.id !== 'ISM_PMI' && i.id !== 'NAPM');

  if (!indicators.length) return null;

  const alphaIds = new Set(['usd_jpy', 'usd_cny', 'fcx', 'copx', 'sp500', 'sector_performance']);
  const alpha = indicators.filter((i) => alphaIds.has(i.id));
  const fred = indicators.filter((i) => !alphaIds.has(i.id));

  const out: EconomyBundle = {
    cacheVersion: CACHE_VERSION,
    updatedAt: String(bundle.generated_at || new Date().toISOString()),
    cacheDateJst: getTodayJstYmd(),
    cacheBucketJst: getNoonBucketJst(),
    sourceStatus: {
      mode: 'csv',
      fred: fred.length ? 'ok' : 'empty',
      alpha: alpha.length ? 'ok' : 'empty',
      metals: 'disabled'
    },
    fred,
    alpha
  };
  return out;
}

function rowDateValue(row: CsvRow): string {
  return String(row.observation_date || row.date || row.Date || '').trim();
}

function pickRowAtOrBefore(rows: CsvRow[], targetDate: string): CsvRow | null {
  const valid = rows
    .filter((r) => rowDateValue(r))
    .sort((a, b) => (rowDateValue(a) < rowDateValue(b) ? 1 : -1));
  return valid.find((r) => rowDateValue(r) <= targetDate) || null;
}

async function findFredCsvIndicatorAtOrBefore(seriesId: string, targetDate: string): Promise<Indicator | null> {
  const filePath = path.join(ECONOMY_DATA_ROOT, 'america', seriesId, `${seriesId}_${targetDate.slice(0, 4)}.csv`);
  let rows: CsvRow[] = [];
  try {
    rows = await readSimpleCsv(filePath);
  } catch {
    // Try previous year if target is near boundary or file naming differs.
    try {
      rows = await readSimpleCsv(
        path.join(ECONOMY_DATA_ROOT, 'america', seriesId, `${seriesId}_${Number(targetDate.slice(0, 4)) - 1}.csv`)
      );
    } catch {
      return null;
    }
  }
  const row = pickRowAtOrBefore(rows, targetDate);
  if (!row) return null;
  const value = String(row[seriesId] ?? '').trim();
  if (!value || value === '.') return null;
  const meta = FRED_SERIES.find((s) => s.id === seriesId);
  const date = rowDateValue(row);
  const idx = rows.findIndex((r) => rowDateValue(r) === date);
  let prevValue = '';
  for (let i = idx - 1; i >= 0; i -= 1) {
    const v = String(rows[i]?.[seriesId] ?? '').trim();
    if (v && v !== '.') {
      prevValue = v;
      break;
    }
  }
  return {
    id: seriesId,
    name: meta?.name || seriesId,
    value,
    date,
    units: '',
    frequency: '',
    source: 'FRED',
    changePercent: formatChangePercent(value, prevValue)
  };
}

async function findLmeCsvUsdIndicatorAtOrBefore(targetDate: string): Promise<Indicator | null> {
  const year = targetDate.slice(0, 4);
  const filePath = path.join(ECONOMY_DATA_ROOT, 'london', 'lme', `lme_copper_${year}.csv`);
  let rows: CsvRow[] = [];
  try {
    rows = await readSimpleCsv(filePath);
  } catch {
    try {
      rows = await readSimpleCsv(
        path.join(ECONOMY_DATA_ROOT, 'london', 'lme', `lme_copper_${Number(year) - 1}.csv`)
      );
    } catch {
      return null;
    }
  }
  const row = pickRowAtOrBefore(rows, targetDate);
  if (!row) return null;
  const value = String(row.lme_copper_cash_settlement_usd_t || '').trim();
  const date = rowDateValue(row);
  if (!value || !date) return null;
  const idx = rows.findIndex((r) => rowDateValue(r) === date);
  let prevValue = '';
  for (let i = idx - 1; i >= 0; i -= 1) {
    const v = String(rows[i]?.lme_copper_cash_settlement_usd_t || '').trim();
    if (v) {
      prevValue = v;
      break;
    }
  }
  return {
    id: 'lme_copper_usd',
    name: 'LME銅',
    value,
    date,
    units: 'USD/mt',
    frequency: 'Daily',
    source: 'CSV',
    changePercent: formatChangePercent(value, prevValue)
  };
}

async function findJapanTateneCsvIndicatorAtOrBefore(targetDate: string): Promise<Indicator | null> {
  const year = targetDate.slice(0, 4);
  const filePath = path.join(ECONOMY_DATA_ROOT, 'japan', 'tate_ne', `copper_tate_ne_${year}.csv`);
  let rows: CsvRow[] = [];
  try {
    rows = await readSimpleCsv(filePath);
  } catch {
    try {
      rows = await readSimpleCsv(
        path.join(ECONOMY_DATA_ROOT, 'japan', 'tate_ne', `copper_tate_ne_${Number(year) - 1}.csv`)
      );
    } catch {
      return null;
    }
  }
  const row = pickRowAtOrBefore(rows, targetDate);
  if (!row) return null;
  const value = String(row.price_jpy_per_ton || '').trim();
  const date = rowDateValue(row);
  if (!value || !date) return null;
  const idx = rows.findIndex((r) => rowDateValue(r) === date);
  let prevValue = '';
  for (let i = idx - 1; i >= 0; i -= 1) {
    const v = String(rows[i]?.price_jpy_per_ton || '').trim();
    if (v) {
      prevValue = v;
      break;
    }
  }
  return {
    id: 'japan_tatene_jpy_mt',
    name: '国内建値',
    value,
    date,
    units: 'JPY/mt',
    frequency: 'Daily',
    source: 'CSV',
    changePercent: formatChangePercent(value, prevValue)
  };
}

async function fetchFredSeriesAtOrBefore(seriesId: string, targetDate: string): Promise<{
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
    const obsUrl =
      `https://api.stlouisfed.org/fred/series/observations` +
      `?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_end=${encodeURIComponent(targetDate)}`;
    const obsRes = await fetch(obsUrl, { cache: 'no-store' });
    const obsData = await obsRes.json();
    const observations = Array.isArray(obsData?.observations) ? obsData.observations : [];
    const validList = observations
      .slice()
      .reverse()
      .filter((o: any) => o?.value && o.value !== '.' && String(o.date || '') <= targetDate);
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

export async function getEconomyIndicatorsCsvFirst(opts?: {
  date?: string;
  fredFallback?: boolean;
}): Promise<EconomyBundle> {
  const targetDate = String(opts?.date || getTodayJstYmd()).trim();
  const fredFallback = opts?.fredFallback !== false;

  const [lmeUsdCsv, tateCsv, fredResults] = await Promise.all([
    findLmeCsvUsdIndicatorAtOrBefore(targetDate),
    findJapanTateneCsvIndicatorAtOrBefore(targetDate),
    Promise.all(
    FRED_SERIES.map(async (s) => {
      const fromCsv = await findFredCsvIndicatorAtOrBefore(s.id, targetDate);
      if (fromCsv) return { indicator: fromCsv, source: 'csv' as const };
      if (!fredFallback) return { indicator: null, source: 'missing' as const };
      const fromApi = await fetchFredSeriesAtOrBefore(s.id, targetDate);
      if (!fromApi) return { indicator: null, source: 'missing' as const };
      return {
        indicator: {
          id: s.id,
          name: s.name,
          value: fromApi.value,
          date: fromApi.date,
          lastUpdated: fromApi.lastUpdated,
          units: fromApi.units,
          frequency: fromApi.frequency,
          source: 'FRED' as const,
          changePercent: formatChangePercent(fromApi.value, String(fromApi.prevValue || ''))
        },
        source: 'api' as const
      };
    })
    )
  ]);

  const fredBase = fredResults.map((r) => r.indicator).filter(Boolean) as Indicator[];
  const fred = [
    ...(lmeUsdCsv ? [lmeUsdCsv] : []),
    ...(tateCsv ? [tateCsv] : []),
    ...fredBase.filter((i) => i.id !== 'lme_copper_usd' && i.id !== 'japan_tatene_jpy_mt')
  ];
  const csvHits = fredResults.filter((r) => r.source === 'csv').length;
  const apiHits = fredResults.filter((r) => r.source === 'api').length;
  const misses = fredResults.filter((r) => !r.indicator).length;

  const bundle: EconomyBundle = {
    cacheVersion: CACHE_VERSION,
    updatedAt: new Date().toISOString(),
    cacheDateJst: targetDate,
    cacheBucketJst: targetDate,
    sourceStatus: {
      mode: 'csv',
      fred: fred.length ? (apiHits > 0 ? 'fallback' : 'ok') : 'empty',
      alpha: 'empty',
      metals: 'disabled'
    },
    fred,
    alpha: []
  };
  void writeSnapshot(bundle);
  void writeCache(bundle);
  // Attach lightweight debug info for API callers via any-cast pattern consumers can inspect by extending response.
  (bundle as any).__csvStats = { targetDate, csvHits, fredApiFallbackHits: apiHits, misses };
  return bundle;
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

async function readSnapshot(): Promise<EconomyBundle | null> {
  try {
    const raw = await fs.readFile(SNAPSHOT_FILE, 'utf8');
    const parsed = JSON.parse(raw) as EconomyBundle;
    if (!parsed?.updatedAt) return null;
    if (!Array.isArray(parsed.fred) || !Array.isArray(parsed.alpha)) return null;
    return {
      ...parsed,
      sourceStatus: {
        ...(parsed.sourceStatus || {}),
        mode: 'snapshot'
      }
    };
  } catch {
    return null;
  }
}

async function writeSnapshot(bundle: EconomyBundle): Promise<boolean> {
  try {
    await fs.mkdir(path.dirname(SNAPSHOT_FILE), { recursive: true });
    await fs.writeFile(SNAPSHOT_FILE, JSON.stringify(bundle, null, 2), 'utf8');
    return true;
  } catch {
    // ignore snapshot write errors (e.g. read-only FS on serverless)
    return false;
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

function isTransientNetworkError(err: unknown): boolean {
  const msg = String((err as any)?.message || '');
  const causeCode = String((err as any)?.cause?.code || '');
  return (
    msg.includes('fetch failed') ||
    causeCode === 'EAI_AGAIN' ||
    causeCode === 'ENOTFOUND' ||
    causeCode === 'ECONNRESET' ||
    causeCode === 'ETIMEDOUT'
  );
}

async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      return res;
    } catch (err) {
      lastErr = err;
      if (!isTransientNetworkError(err) || i === attempts - 1) {
        throw err;
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 800 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('fetchWithRetry failed');
}

async function fetchLmeCopperFromMetalsDev(): Promise<Indicator | null> {
  const apiKey = (process.env.METALS_DEV_API_KEY || '').trim();
  if (!apiKey) return null;

  // Prefer the latest endpoint (stable in user's environment).
  try {
    const latestUrl =
      `https://api.metals.dev/v1/latest` +
      `?api_key=${apiKey}&currency=USD&unit=kg`;
    const latestRes = await fetchWithRetry(latestUrl, 4);
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
    const res = await fetchWithRetry(url, 3);
    if (!res.ok) return null;
    const data = await res.json();
    const v = Number(data?.rates?.copper ?? data?.metals?.copper ?? data?.price);
    return Number.isFinite(v) ? { value: v, date } : null;
  };

  const fxUrl = `https://api.metals.dev/v1/currencies?api_key=${apiKey}`;
  const fxRes = await fetchWithRetry(fxUrl, 4);
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

async function fetchLmeCopperUsdFromMetalsDev(): Promise<Indicator | null> {
  const apiKey = (process.env.METALS_DEV_API_KEY || '').trim();
  if (!apiKey) return null;

  try {
    const latestUrl =
      `https://api.metals.dev/v1/latest` +
      `?api_key=${apiKey}&currency=USD&unit=kg`;
    const latestRes = await fetchWithRetry(latestUrl, 4);
    if (!latestRes.ok) return null;
    const latestData = await latestRes.json();
    const metalUsdPerKg = Number(
      latestData?.metals?.lme_copper ?? latestData?.metals?.copper
    );
    if (!Number.isFinite(metalUsdPerKg)) return null;
    const usdPerMt = metalUsdPerKg * 1000;
    const ts = String(latestData?.timestamps?.metal || '').slice(0, 10);
    return {
      id: 'lme_copper_usd',
      name: 'LME銅',
      value: String(usdPerMt),
      date: ts || toYmd(new Date()),
      lastUpdated: String(latestData?.timestamps?.metal || ''),
      units: 'USD/mt',
      frequency: 'Daily',
      source: 'Metals.dev'
    };
  } catch {
    return null;
  }
}

async function fetchUsdJpyFromMetalsDev(): Promise<Indicator | null> {
  const apiKey = (process.env.METALS_DEV_API_KEY || '').trim();
  if (!apiKey) return null;

  try {
    const latestUrl =
      `https://api.metals.dev/v1/latest` +
      `?api_key=${apiKey}&currency=USD&unit=kg`;
    const res = await fetchWithRetry(latestUrl, 4);
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

export async function getEconomyIndicatorsLive(opts?: { force?: boolean }): Promise<EconomyBundle> {
  const force = Boolean(opts?.force);
  const [cachedAny, cached] = await Promise.all([
    readCacheAny(),
    force ? Promise.resolve(null) : readCache()
  ]);
  if (cached) return cached;
  const hasMetalsKey = false;

  const [lmeUsdCsv, tateCsv, fredRaw, alphaRaw, fredCopper, fredUsdJpy] = await Promise.all([
    findLmeCsvUsdIndicatorAtOrBefore(getNoonBucketJst()),
    findJapanTateneCsvIndicatorAtOrBefore(getNoonBucketJst()),
    fetchFredIndicators(),
    fetchAlphaIndicators(),
    fetchFredSeriesLatest('PCOPPUSDM'),
    fetchFredSeriesLatest('DEXJPUS')
  ]);
  const lme = null;
  const lmeUsd = lmeUsdCsv;
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
  const fredWithoutLme = fredRaw.filter((i) => i.id !== 'lme_copper_jpy' && i.id !== 'lme_copper_usd');
  const fred = [
    ...(lmeMerged ? [lmeMerged] : []),
    ...(lmeUsd ? [lmeUsd] : []),
    ...(tateCsv ? [tateCsv] : []),
    ...fredWithoutLme
  ].filter((ind, idx, arr) => arr.findIndex((x) => x.id === ind.id) === idx);

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
    alphaRaw.find((i) => i.id === 'usd_jpy') ||
    prevUsdJpy ||
    usdJpyFallback[0] ||
    null;
  const alpha = [...(usdJpyMerged ? [usdJpyMerged] : []), ...alphaWithoutUsdJpy];

  // Safety fallback: if fresh fetch produced nothing, keep using the last known cache.
  // force時は再取得結果を優先して返す（古い値への巻き戻しを防ぐ）。
  if (!force && !fred.length && !alpha.length && cachedAny) {
    return cachedAny;
  }

  // Partial fallback: if either side is empty, backfill from last known cache if available.
  // force時は空のまま返して、取得失敗を隠さない。
  const fredMerged = force ? fred : (fred.length ? fred : (cachedAny?.fred || []));
  const alphaMerged = force ? alpha : (alpha.length ? alpha : (cachedAny?.alpha || []));

  const hasMetals = fredMerged.some((i) => i.id === 'lme_copper_jpy' && i.source === 'Metals.dev');
  const bundle: EconomyBundle = {
    cacheVersion: CACHE_VERSION,
    updatedAt: new Date().toISOString(),
    cacheDateJst: getTodayJstYmd(),
    cacheBucketJst: getNoonBucketJst(),
    sourceStatus: {
      mode: 'live',
      fred: fred.length ? 'ok' : (cachedAny?.fred?.length ? 'fallback' : 'empty'),
      alpha: alpha.length ? 'ok' : (cachedAny?.alpha?.length ? 'fallback' : 'empty'),
      metals: hasMetals
        ? 'ok'
        : (Boolean((process.env.METALS_DEV_API_KEY || '').trim()) ? 'empty' : 'disabled')
    },
    fred: fredMerged,
    alpha: alphaMerged
  };
  const snapshotWritten = await writeSnapshot(bundle);
  bundle.sourceStatus = {
    ...(bundle.sourceStatus || {}),
    snapshotWrite: snapshotWritten ? 'ok' : 'error'
  };
  await writeCache(bundle);
  return bundle;
}

export async function getEconomyIndicators(): Promise<EconomyBundle> {
  const publishBundle = await getEconomyIndicatorsFromPublishJson();
  if (publishBundle && (publishBundle.fred.length || publishBundle.alpha.length)) {
    await writeSnapshot(publishBundle);
    await writeCache(publishBundle);
    return publishBundle;
  }
  const isProd = process.env.NODE_ENV === 'production';
  const prodAllowLocalSnapshotFallback = String(process.env.ECONOMY_PROD_ALLOW_LOCAL_SNAPSHOT_FALLBACK || '')
    .trim()
    .toLowerCase() === 'true';
  if (isProd) {
    const remoteSnapshot = await readLatestEconomySnapshotFromMicrocms().catch(() => null);
    if (remoteSnapshot && (remoteSnapshot.fred.length || remoteSnapshot.alpha.length)) {
      await writeSnapshot(remoteSnapshot);
      await writeCache(remoteSnapshot);
      return remoteSnapshot;
    }
    // 本番表示は microCMS を正とする。障害時の一時回避だけ env で local snapshot fallback を許可。
    if (prodAllowLocalSnapshotFallback) {
      const snapshot = await readSnapshot();
      if (snapshot && (snapshot.fred.length || snapshot.alpha.length)) {
        return snapshot;
      }
    }
  } else {
    const snapshot = await readSnapshot();
    if (snapshot && (snapshot.fred.length || snapshot.alpha.length)) {
      return snapshot;
    }
    const remoteSnapshot = await readLatestEconomySnapshotFromMicrocms().catch(() => null);
    if (remoteSnapshot && (remoteSnapshot.fred.length || remoteSnapshot.alpha.length)) {
      await writeSnapshot(remoteSnapshot);
      await writeCache(remoteSnapshot);
      return remoteSnapshot;
    }
  }
  const liveFallbackEnabled = String(process.env.ECONOMY_ALLOW_LIVE_FALLBACK || '')
    .trim()
    .toLowerCase() === 'true';
  // 本番表示では live API fallback を避け、データの正を microCMS に寄せる。
  if (liveFallbackEnabled && !isProd) {
    return getEconomyIndicatorsLive();
  }
  const cachedAny = await readCacheAny();
  if (cachedAny && (cachedAny.fred.length || cachedAny.alpha.length)) {
    return cachedAny;
  }
  return {
    cacheVersion: CACHE_VERSION,
    updatedAt: new Date().toISOString(),
    cacheDateJst: getTodayJstYmd(),
    cacheBucketJst: getNoonBucketJst(),
    sourceStatus: { mode: 'snapshot', fred: 'empty', alpha: 'empty', metals: 'empty' },
    fred: [],
    alpha: []
  };
}

export function formatIndicatorValue(raw: string): string {
  if (!raw) return '-';
  if (!isFiniteNumber(raw)) return raw;
  return Number(raw).toLocaleString();
}
