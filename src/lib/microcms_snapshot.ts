import { promises as fs } from 'fs';
import path from 'path';
import type { EconomyBundle, Indicator } from '@/lib/economy';

type SnapshotPersistResult = {
  ok: boolean;
  action?: 'created' | 'updated' | 'skipped';
  id?: string;
  error?: string;
};

function splitIndicators(indicators: Indicator[]): { fred: Indicator[]; alpha: Indicator[] } {
  const fred: Indicator[] = [];
  const alpha: Indicator[] = [];
  for (const ind of indicators || []) {
    if (String(ind?.source || '') === 'Alpha Vantage') {
      alpha.push(ind);
    } else {
      fred.push(ind);
    }
  }
  return { fred, alpha };
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === 'object') return value as T;
  if (typeof value !== 'string') return fallback;
  const raw = value.trim();
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getSnapshotConfig() {
  const serviceDomain =
    process.env.MICROCMS_SERVICE_DOMAIN_A ||
    process.env.MICROCMS_SERVICE_DOMAIN ||
    '';
  const endpoint =
    process.env.MICROCMS_SNAPSHOTS_ENDPOINT_A ||
    process.env.MICROCMS_SNAPSHOTS_ENDPOINT ||
    '';
  // 履歴保存は書き込み専用キーを優先。未設定時のみREADキーにフォールバック。
  const apiKey =
    process.env.MICROCMS_SNAPSHOT_WRITE_API_KEY_A ||
    process.env.MICROCMS_SNAPSHOT_WRITE_API_KEY ||
    process.env.MICROCMS_READ_API_KEY_A ||
    process.env.MICROCMS_READ_API_KEY ||
    '';
  return {
    serviceDomain: String(serviceDomain).trim(),
    endpoint: String(endpoint).trim(),
    apiKey: String(apiKey).trim()
  };
}

const PUBLISH_SELECTED_SERIES_FILE =
  process.env.PUBLISH_SELECTED_SERIES_FILE ||
  path.join(process.cwd(), 'public', 'data', 'selected_series_bundle.json');

type PublishPoint = { date: string; value: number };
type PublishSeriesBundle = {
  generated_at?: string;
  series?: Record<string, PublishPoint[]>;
};

function snapshotIndicatorIdToPublishAlias(indicatorId: string): string | null {
  const map: Record<string, string> = {
    lme_copper_usd: 'lme_copper_cash_usd_t',
    usd_jpy: 'america_dexjpus',
    usd_cny: 'america_dexchus'
  };
  return map[indicatorId] || null;
}

function snapshotIndicatorDefaults(indicatorId: string): Pick<Indicator, 'name' | 'units' | 'frequency' | 'source'> {
  const map: Record<string, Pick<Indicator, 'name' | 'units' | 'frequency' | 'source'>> = {
    lme_copper_usd: { name: 'LME銅', units: 'USD/mt', frequency: 'Daily', source: 'CSV' },
    usd_jpy: { name: 'USD/JPY 為替レート', units: 'JPY/USD', frequency: 'Daily', source: 'CSV' },
    usd_cny: { name: 'USD/CNY 為替レート', units: 'CNY/USD', frequency: 'Daily', source: 'CSV' }
  };
  return map[indicatorId] || { name: indicatorId, units: '', frequency: '', source: 'CSV' };
}

async function readRecentIndicatorValuesFromPublishSeries(
  indicatorId: string,
  limit: number
): Promise<Indicator[]> {
  const alias = snapshotIndicatorIdToPublishAlias(indicatorId);
  if (!alias) return [];
  try {
    const raw = await fs.readFile(PUBLISH_SELECTED_SERIES_FILE, 'utf8');
    const parsed = JSON.parse(raw) as PublishSeriesBundle;
    const series = Array.isArray(parsed?.series?.[alias]) ? (parsed.series?.[alias] as PublishPoint[]) : [];
    if (!series.length) return [];
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const picked = series.slice(-safeLimit).reverse();
    const defaults = snapshotIndicatorDefaults(indicatorId);
    return picked.map((p) => ({
      id: indicatorId,
      name: defaults.name,
      value: String(p.value),
      date: String(p.date),
      lastUpdated: String(parsed?.generated_at || ''),
      units: defaults.units,
      frequency: defaults.frequency,
      source: defaults.source
    }));
  } catch {
    return [];
  }
}

function toUrl(serviceDomain: string, endpoint: string, suffix = ''): string {
  return `https://${serviceDomain}.microcms.io/api/v1/${endpoint}${suffix}`;
}

function toIndicatorsJson(bundle: EconomyBundle): string {
  const indicators: Indicator[] = [...(bundle.fred || []), ...(bundle.alpha || [])];
  return JSON.stringify(indicators);
}

function toSourceStatusJson(bundle: EconomyBundle): string {
  return JSON.stringify(bundle.sourceStatus || {});
}

async function findByDate(
  serviceDomain: string,
  endpoint: string,
  apiKey: string,
  date: string
): Promise<string | null> {
  const query = `?filters=date[equals]${encodeURIComponent(date)}&limit=1`;
  const res = await fetch(toUrl(serviceDomain, endpoint, query), {
    headers: { 'X-MICROCMS-API-KEY': apiKey },
    cache: 'no-store'
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`find failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { contents?: Array<{ id?: string }> };
  const id = String(data?.contents?.[0]?.id || '').trim();
  return id || null;
}

export async function upsertEconomySnapshotToMicrocms(bundle: EconomyBundle): Promise<SnapshotPersistResult> {
  const cfg = getSnapshotConfig();
  if (!cfg.serviceDomain || !cfg.endpoint || !cfg.apiKey) {
    return { ok: false, action: 'skipped', error: 'microcms snapshot env missing' };
  }

  const date = String(bundle.cacheBucketJst || bundle.cacheDateJst || '').trim();
  if (!date) {
    return { ok: false, action: 'skipped', error: 'snapshot date is empty' };
  }

  const payload = {
    date,
    cacheBucketJst: date,
    updatedAtSource: String(bundle.updatedAt || ''),
    sourceStatus: toSourceStatusJson(bundle),
    indicators: toIndicatorsJson(bundle)
  };

  try {
    const existingId = await findByDate(cfg.serviceDomain, cfg.endpoint, cfg.apiKey, date);
    if (existingId) {
      const patchRes = await fetch(toUrl(cfg.serviceDomain, cfg.endpoint, `/${encodeURIComponent(existingId)}`), {
        method: 'PATCH',
        headers: {
          'X-MICROCMS-API-KEY': cfg.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        cache: 'no-store'
      });
      if (!patchRes.ok) {
        const text = await patchRes.text();
        throw new Error(`patch failed (${patchRes.status}): ${text}`);
      }
      return { ok: true, action: 'updated', id: existingId };
    }

    const postRes = await fetch(toUrl(cfg.serviceDomain, cfg.endpoint), {
      method: 'POST',
      headers: {
        'X-MICROCMS-API-KEY': cfg.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      cache: 'no-store'
    });
    if (!postRes.ok) {
      const text = await postRes.text();
      throw new Error(`post failed (${postRes.status}): ${text}`);
    }
    const created = (await postRes.json()) as { id?: string };
    return { ok: true, action: 'created', id: String(created?.id || '') };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function readLatestEconomySnapshotFromMicrocms(): Promise<EconomyBundle | null> {
  const cfg = getSnapshotConfig();
  if (!cfg.serviceDomain || !cfg.endpoint || !cfg.apiKey) return null;

  const res = await fetch(
    toUrl(cfg.serviceDomain, cfg.endpoint, '?orders=-date&limit=1'),
    {
      headers: { 'X-MICROCMS-API-KEY': cfg.apiKey },
      cache: 'no-store'
    }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { contents?: Array<Record<string, unknown>> };
  const row = data?.contents?.[0];
  if (!row) return null;

  const indicators = parseJsonField<Indicator[]>(row.indicators, []);
  const sourceStatus = parseJsonField<EconomyBundle['sourceStatus']>(row.sourceStatus, {});
  const { fred, alpha } = splitIndicators(indicators);
  const cacheBucketJst = String(row.cacheBucketJst || row.date || '').trim();
  const updatedAt = String(row.updatedAtSource || row.updatedAt || '').trim() || new Date().toISOString();

  if (!fred.length && !alpha.length) return null;

  return {
    cacheVersion: 3,
    updatedAt,
    cacheDateJst: cacheBucketJst,
    cacheBucketJst,
    sourceStatus: {
      ...(sourceStatus || {}),
      mode: 'snapshot'
    },
    fred,
    alpha
  };
}

export async function readRecentIndicatorValuesFromEconomySnapshots(
  indicatorId: string,
  limit = 10
): Promise<Indicator[]> {
  const cfg = getSnapshotConfig();
  if (!cfg.serviceDomain || !cfg.endpoint || !cfg.apiKey) {
    return readRecentIndicatorValuesFromPublishSeries(indicatorId, limit);
  }

  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const res = await fetch(
    toUrl(cfg.serviceDomain, cfg.endpoint, `?orders=-date&limit=${safeLimit}`),
    {
      headers: { 'X-MICROCMS-API-KEY': cfg.apiKey },
      cache: 'no-store'
    }
  );
  if (!res.ok) {
    return readRecentIndicatorValuesFromPublishSeries(indicatorId, limit);
  }
  const data = (await res.json()) as { contents?: Array<Record<string, unknown>> };
  const rows = data?.contents || [];
  const hits: Indicator[] = [];
  const seenDates = new Set<string>();

  for (const row of rows) {
    const indicators = parseJsonField<Indicator[]>(row.indicators, []);
    const hit = indicators.find((ind) => String(ind?.id || '') === indicatorId);
    if (!hit) continue;
    const key = String(hit.date || row.date || '').trim();
    if (key && seenDates.has(key)) continue;
    if (key) seenDates.add(key);
    hits.push(hit);
    if (hits.length >= safeLimit) break;
  }

  if (hits.length) return hits;
  return readRecentIndicatorValuesFromPublishSeries(indicatorId, limit);
}
