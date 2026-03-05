import { promises as fs } from 'fs';
import path from 'path';

export type RawSeriesPoint = {
  date?: string;
  value?: number | string;
};

export type PublishPoint = {
  date: string;
  value: number;
};

export type PublishMetaRow = {
  indicator_key?: string;
  display_name?: string;
  freq_hint?: string;
  series_key?: string | null;
};

export type PublishSeriesBundle = {
  generated_at?: string;
  series?: Record<string, RawSeriesPoint[]>;
  latest?: Record<string, PublishPoint | null>;
  meta?: Record<string, PublishMetaRow>;
};

const DATA_DIR = path.join(process.cwd(), 'public', 'data');
const MARKET_FILE = process.env.PUBLISH_MARKET_SERIES_FILE || path.join(DATA_DIR, 'market_series.json');
const INDICATORS_FILE =
  process.env.PUBLISH_INDICATORS_SERIES_FILE || path.join(DATA_DIR, 'indicators_series.json');
const SUPPLY_CHAIN_FILE =
  process.env.PUBLISH_SUPPLY_CHAIN_SERIES_FILE || path.join(DATA_DIR, 'supply_chain_series.json');

async function readBundleFile(filePath: string): Promise<PublishSeriesBundle | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as PublishSeriesBundle;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function pickGeneratedAt(...values: Array<string | undefined>): string | undefined {
  const valid = values.filter((v): v is string => Boolean(v && v.trim())).map((v) => v.trim());
  if (!valid.length) return undefined;
  return valid.sort().at(-1);
}

export async function readMergedPublishSeriesBundle(): Promise<PublishSeriesBundle | null> {
  const [market, indicators, supplyChain] = await Promise.all([
    readBundleFile(MARKET_FILE),
    readBundleFile(INDICATORS_FILE),
    readBundleFile(SUPPLY_CHAIN_FILE),
  ]);

  const hasSplit = Boolean(market?.series || indicators?.series || supplyChain?.series);
  if (!hasSplit) {
    return null;
  }

  return {
    generated_at: pickGeneratedAt(market?.generated_at, indicators?.generated_at, supplyChain?.generated_at),
    series: {
      ...(market?.series || {}),
      ...(indicators?.series || {}),
      ...(supplyChain?.series || {}),
    },
    latest: {
      ...(market?.latest || {}),
      ...(indicators?.latest || {}),
      ...(supplyChain?.latest || {}),
    },
    meta: {
      ...(market?.meta || {}),
      ...(indicators?.meta || {}),
      ...(supplyChain?.meta || {}),
    },
  };
}

export function normalizeSeries(rows: RawSeriesPoint[] | undefined): PublishPoint[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const date = String(row?.date || '').trim();
      const value = Number(row?.value);
      return { date, value };
    })
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.value))
    .sort((a, b) => a.date.localeCompare(b.date));
}
