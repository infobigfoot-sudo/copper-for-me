import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

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

type SupabaseHeaders = {
  apikey: string;
  authorization: string;
  accept: string;
};

type SupabaseRow = Record<string, unknown>;

function getSupabaseConfig(): { url: string; key: string } | null {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return { url, key };
}

async function fetchSupabaseRows(
  table: string,
  selectClause: string,
  orderBy: string,
  filters?: Record<string, string>
): Promise<SupabaseRow[]> {
  const cfg = getSupabaseConfig();
  if (!cfg) return [];
  const baseUrl = `${cfg.url.replace(/\/$/, '')}/rest/v1/${table}`;
  const headers: SupabaseHeaders = {
    apikey: cfg.key,
    authorization: `Bearer ${cfg.key}`,
    accept: 'application/json',
  };
  const pageSize = 1000;
  const maxPages = 200;
  const allRows: SupabaseRow[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const query = new URLSearchParams({
      select: selectClause,
      order: `${orderBy}.asc`,
      limit: String(pageSize),
      offset: String(page * pageSize),
    });
    if (filters) {
      for (const [k, v] of Object.entries(filters)) {
        if (!k || !v) continue;
        query.set(k, v);
      }
    }
    const url = `${baseUrl}?${query.toString()}`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers,
        cache: 'no-store',
      });
      if (!res.ok) return allRows;
      const rows = (await res.json()) as unknown;
      if (!Array.isArray(rows)) return allRows;
      allRows.push(...(rows as SupabaseRow[]));
      if (rows.length < pageSize) return allRows;
    } catch {
      return allRows;
    }
  }
  return allRows;
}

function parseDate(v: unknown): string {
  const text = String(v || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function parseNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseCsvRows(text: string): SupabaseRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  const out: SupabaseRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(',');
    if (!cols.length) continue;
    const row: SupabaseRow = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] || '').trim();
    });
    out.push(row);
  }
  return out;
}

async function readWorldTradeRowsFallbackFromSeed(): Promise<SupabaseRow[]> {
  const candidates = [
    path.join(process.cwd(), '..', 'public', 'copper-for-me', 'supabase', 'seed', 'trade_world_monthly_seed_latest.csv'),
    path.join(process.cwd(), 'public', 'copper-for-me', 'supabase', 'seed', 'trade_world_monthly_seed_latest.csv'),
    path.join(process.cwd(), 'public', 'supabase', 'seed', 'trade_world_monthly_seed_latest.csv'),
  ];
  for (const p of candidates) {
    try {
      const raw = await readFile(p, 'utf-8');
      const rows = parseCsvRows(raw);
      if (rows.length) return rows;
    } catch {
      // try next path
    }
  }
  return [];
}

async function readJapanTradeMofRowsFallbackFromSeed(): Promise<SupabaseRow[]> {
  const candidates = [
    path.join(process.cwd(), '..', 'public', 'copper-for-me', 'supabase', 'seed', 'trade_japan_mof_monthly_seed_latest.csv'),
    path.join(process.cwd(), 'public', 'copper-for-me', 'supabase', 'seed', 'trade_japan_mof_monthly_seed_latest.csv'),
    path.join(process.cwd(), 'public', 'supabase', 'seed', 'trade_japan_mof_monthly_seed_latest.csv'),
  ];
  for (const p of candidates) {
    try {
      const raw = await readFile(p, 'utf-8');
      const rows = parseCsvRows(raw);
      if (rows.length) return rows;
    } catch {
      // try next path
    }
  }
  return [];
}

function mergeRowsByKey(primaryRows: SupabaseRow[], fallbackRows: SupabaseRow[], keyFields: string[]): SupabaseRow[] {
  if (!fallbackRows.length) return primaryRows;
  if (!primaryRows.length) return fallbackRows;
  const toKey = (row: SupabaseRow) => keyFields.map((k) => String(row[k] ?? '').trim()).join('|');
  const merged = new Map<string, SupabaseRow>();
  for (const row of fallbackRows) {
    merged.set(toKey(row), row);
  }
  for (const row of primaryRows) {
    merged.set(toKey(row), row);
  }
  return Array.from(merged.values());
}

function toSeries(rows: SupabaseRow[], dateKey: string, valueKey: string): PublishPoint[] {
  return rows
    .map((row) => {
      const date = parseDate(row[dateKey]);
      const value = parseNumber(row[valueKey]);
      return date && value !== null ? { date, value } : null;
    })
    .filter((row): row is PublishPoint => Boolean(row))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function mergeSeriesPreferRight(base: PublishPoint[], override: PublishPoint[]): PublishPoint[] {
  const map = new Map<string, number>();
  for (const p of base) map.set(p.date, p.value);
  for (const p of override) map.set(p.date, p.value);
  return Array.from(map.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function mergeSeriesPreferPrimaryByDate(primary: PublishPoint[], fallback: PublishPoint[]): PublishPoint[] {
  const map = new Map<string, number>();
  for (const p of fallback) map.set(p.date, p.value);
  for (const p of primary) map.set(p.date, p.value);
  return Array.from(map.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function latestOf(points: PublishPoint[]): PublishPoint | null {
  return points.length ? points[points.length - 1] : null;
}

function qtyToWanTon(qty: number, unitRaw: unknown): number | null {
  if (!Number.isFinite(qty)) return null;
  const unit = String(unitRaw || '').trim().toLowerCase();
  if (!unit) return qty;
  if (unit === 'wan_t') return qty;
  if (unit === 'kg') return qty / 10000000;
  if (unit === 't' || unit === 'ton' || unit === 'tons' || unit === 'mt' || unit === 'metric_ton' || unit === 'metric tons' || unit === 'metric_tons') {
    return qty / 10000;
  }
  if (unit === 'as_provided') {
    // user_provided CSVs for CHL/PER ore export are treated as 万トン.
    return qty;
  }
  return qty;
}

function toCountryOreExportSeries(rows: SupabaseRow[], countryIso3: 'CHL' | 'PER'): PublishPoint[] {
  const byMonth = new Map<string, { world: number; total: number; hasWorld: boolean }>();
  for (const row of rows) {
    const iso3 = String(row.country_iso3 || '').trim().toUpperCase();
    if (iso3 !== countryIso3) continue;
    const cmd = String(row.cmd_code || '').trim().toUpperCase();
    if (!cmd.startsWith('2603')) continue;
    const date = parseDate(row.period_date);
    if (!date) continue;
    const qty = parseNumber(row.qty_num);
    if (qty === null) continue;
    const qtyWanTon = qtyToWanTon(qty, row.qty_unit);
    if (qtyWanTon === null || !Number.isFinite(qtyWanTon)) continue;
    const partnerCode = String(row.partner_code || '').trim();
    const partnerDesc = String(row.partner_desc || '').trim().toLowerCase();
    const isWorld = partnerCode === '0' || partnerDesc === 'world';
    const bucket = byMonth.get(date) ?? { world: 0, total: 0, hasWorld: false };
    bucket.total += qtyWanTon;
    if (isWorld) {
      bucket.world += qtyWanTon;
      bucket.hasWorld = true;
    }
    byMonth.set(date, bucket);
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => ({
      date,
      value: bucket.hasWorld ? bucket.world : bucket.total,
    }))
    .filter((row) => Number.isFinite(row.value));
}

function toCountryTradeSeriesByCmdPrefix(
  rows: SupabaseRow[],
  opts: { countryIso3: string; flowCode: string; cmdPrefix: string }
): PublishPoint[] {
  const countryIso3 = opts.countryIso3.trim().toUpperCase();
  const flowCode = opts.flowCode.trim().toUpperCase();
  const cmdPrefix = opts.cmdPrefix.trim().toUpperCase();
  if (!countryIso3 || !flowCode || !cmdPrefix) return [];
  const byMonth = new Map<string, { world: number; total: number; hasWorld: boolean }>();
  for (const row of rows) {
    const iso3 = String(row.country_iso3 || '').trim().toUpperCase();
    if (iso3 !== countryIso3) continue;
    const flow = String(row.flow_code || '').trim().toUpperCase();
    if (flow !== flowCode) continue;
    const cmd = String(row.cmd_code || '').trim().toUpperCase();
    if (!cmd.startsWith(cmdPrefix)) continue;
    const date = parseDate(row.period_date);
    if (!date) continue;
    const qty = parseNumber(row.qty_num);
    if (qty === null) continue;
    const qtyWanTon = qtyToWanTon(qty, row.qty_unit);
    if (qtyWanTon === null || !Number.isFinite(qtyWanTon)) continue;
    const partnerCode = String(row.partner_code || '').trim();
    const partnerDesc = String(row.partner_desc || '').trim().toLowerCase();
    const isWorld = partnerCode === '0' || partnerDesc === 'world';
    const bucket = byMonth.get(date) ?? { world: 0, total: 0, hasWorld: false };
    bucket.total += qtyWanTon;
    if (isWorld) {
      bucket.world += qtyWanTon;
      bucket.hasWorld = true;
    }
    byMonth.set(date, bucket);
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => ({
      date,
      value: bucket.hasWorld ? bucket.world : bucket.total,
    }))
    .filter((row) => Number.isFinite(row.value));
}

function toCountryTradeValueAndUnitUsdPerTonSeriesByCmdPrefix(
  rows: SupabaseRow[],
  opts: { countryIso3: string; flowCode: string; cmdPrefix: string }
): { valueSeries: PublishPoint[]; unitSeries: PublishPoint[] } {
  const countryIso3 = opts.countryIso3.trim().toUpperCase();
  const flowCode = opts.flowCode.trim().toUpperCase();
  const cmdPrefix = opts.cmdPrefix.trim().toUpperCase();
  if (!countryIso3 || !flowCode || !cmdPrefix) return { valueSeries: [], unitSeries: [] };
  const byMonth = new Map<
    string,
    {
      worldValueUsd: number;
      worldQtyWanTon: number;
      totalValueUsd: number;
      totalQtyWanTon: number;
      hasWorld: boolean;
    }
  >();
  for (const row of rows) {
    const iso3 = String(row.country_iso3 || '').trim().toUpperCase();
    if (iso3 !== countryIso3) continue;
    const flow = String(row.flow_code || '').trim().toUpperCase();
    if (flow !== flowCode) continue;
    const cmd = String(row.cmd_code || '').trim().toUpperCase();
    if (!cmd.startsWith(cmdPrefix)) continue;
    const date = parseDate(row.period_date);
    if (!date) continue;
    const qty = parseNumber(row.qty_num);
    const qtyWanTon = qty !== null ? qtyToWanTon(qty, row.qty_unit) : null;
    if (qtyWanTon === null || !Number.isFinite(qtyWanTon) || qtyWanTon <= 0) continue;
    const valueUsd =
      parseNumber(row.primary_value_usd_num) ??
      parseNumber(row.fob_value_usd_num) ??
      parseNumber(row.cif_value_usd_num);
    if (valueUsd === null || !Number.isFinite(valueUsd)) continue;
    const partnerCode = String(row.partner_code || '').trim();
    const partnerDesc = String(row.partner_desc || '').trim().toLowerCase();
    const isWorld = partnerCode === '0' || partnerDesc === 'world';
    const bucket = byMonth.get(date) ?? {
      worldValueUsd: 0,
      worldQtyWanTon: 0,
      totalValueUsd: 0,
      totalQtyWanTon: 0,
      hasWorld: false,
    };
    bucket.totalValueUsd += valueUsd;
    bucket.totalQtyWanTon += qtyWanTon;
    if (isWorld) {
      bucket.worldValueUsd += valueUsd;
      bucket.worldQtyWanTon += qtyWanTon;
      bucket.hasWorld = true;
    }
    byMonth.set(date, bucket);
  }
  const valueSeries: PublishPoint[] = [];
  const unitSeries: PublishPoint[] = [];
  for (const [date, bucket] of Array.from(byMonth.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    const useWorld = bucket.hasWorld && bucket.worldQtyWanTon > 0;
    const valueUsd = useWorld ? bucket.worldValueUsd : bucket.totalValueUsd;
    const qtyWanTon = useWorld ? bucket.worldQtyWanTon : bucket.totalQtyWanTon;
    const qtyTon = qtyWanTon * 10000;
    valueSeries.push({ date, value: valueUsd });
    if (qtyTon > 0) unitSeries.push({ date, value: valueUsd / qtyTon });
  }
  return { valueSeries, unitSeries };
}

function toCountryTradeValueUsdSeriesByCmdPrefixAndPartnerCodes(
  rows: SupabaseRow[],
  opts: { countryIso3: string; flowCode: string; cmdPrefix: string; partnerCodes: string[] }
): PublishPoint[] {
  const countryIso3 = opts.countryIso3.trim().toUpperCase();
  const flowCode = opts.flowCode.trim().toUpperCase();
  const cmdPrefix = opts.cmdPrefix.trim().toUpperCase();
  const partnerSet = new Set(opts.partnerCodes.map((v) => v.trim()).filter(Boolean));
  if (!countryIso3 || !flowCode || !cmdPrefix || !partnerSet.size) return [];
  const byMonth = new Map<string, number>();
  for (const row of rows) {
    const iso3 = String(row.country_iso3 || '').trim().toUpperCase();
    if (iso3 !== countryIso3) continue;
    const flow = String(row.flow_code || '').trim().toUpperCase();
    if (flow !== flowCode) continue;
    const cmd = String(row.cmd_code || '').trim().toUpperCase();
    if (!cmd.startsWith(cmdPrefix)) continue;
    const partnerCode = String(row.partner_code || '').trim();
    if (!partnerSet.has(partnerCode)) continue;
    const date = parseDate(row.period_date);
    if (!date) continue;
    const valueUsd =
      parseNumber(row.primary_value_usd_num) ??
      parseNumber(row.fob_value_usd_num) ??
      parseNumber(row.cif_value_usd_num);
    if (valueUsd === null || !Number.isFinite(valueUsd)) continue;
    byMonth.set(date, (byMonth.get(date) || 0) + valueUsd);
  }
  return Array.from(byMonth.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function toGroupTradeQtySeriesByCmdPrefixes(
  rows: SupabaseRow[],
  opts: { countryIso3List: string[]; flowCode: string; cmdPrefixes: string[] }
): PublishPoint[] {
  const countrySet = new Set(opts.countryIso3List.map((v) => v.trim().toUpperCase()).filter(Boolean));
  const flowCode = opts.flowCode.trim().toUpperCase();
  const cmdPrefixes = opts.cmdPrefixes.map((v) => v.trim().toUpperCase()).filter(Boolean);
  if (!countrySet.size || !flowCode || !cmdPrefixes.length) return [];

  const byMonth = new Map<string, { world: number; total: number; hasWorld: boolean }>();
  for (const row of rows) {
    const iso3 = String(row.country_iso3 || '').trim().toUpperCase();
    if (!countrySet.has(iso3)) continue;
    const flow = String(row.flow_code || '').trim().toUpperCase();
    if (flow !== flowCode) continue;
    const cmd = String(row.cmd_code || '').trim().toUpperCase();
    if (!cmdPrefixes.some((prefix) => cmd.startsWith(prefix))) continue;
    const date = parseDate(row.period_date);
    if (!date) continue;
    const qty = parseNumber(row.qty_num);
    if (qty === null) continue;
    const qtyWanTon = qtyToWanTon(qty, row.qty_unit);
    if (qtyWanTon === null || !Number.isFinite(qtyWanTon)) continue;
    const partnerCode = String(row.partner_code || '').trim();
    const partnerDesc = String(row.partner_desc || '').trim().toLowerCase();
    const isWorld = partnerCode === '0' || partnerDesc === 'world';
    const bucket = byMonth.get(date) ?? { world: 0, total: 0, hasWorld: false };
    bucket.total += qtyWanTon;
    if (isWorld) {
      bucket.world += qtyWanTon;
      bucket.hasWorld = true;
    }
    byMonth.set(date, bucket);
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => ({
      date,
      value: bucket.hasWorld ? bucket.world : bucket.total,
    }))
    .filter((row) => Number.isFinite(row.value));
}

function toGroupTradeUnitValueUsdPerTonSeriesByCmdPrefixes(
  rows: SupabaseRow[],
  opts: { countryIso3List: string[]; flowCode: string; cmdPrefixes: string[] }
): PublishPoint[] {
  const countrySet = new Set(opts.countryIso3List.map((v) => v.trim().toUpperCase()).filter(Boolean));
  const flowCode = opts.flowCode.trim().toUpperCase();
  const cmdPrefixes = opts.cmdPrefixes.map((v) => v.trim().toUpperCase()).filter(Boolean);
  if (!countrySet.size || !flowCode || !cmdPrefixes.length) return [];

  const byMonth = new Map<
    string,
    { worldValueUsd: number; worldQtyWanTon: number; totalValueUsd: number; totalQtyWanTon: number; hasWorld: boolean }
  >();
  for (const row of rows) {
    const iso3 = String(row.country_iso3 || '').trim().toUpperCase();
    if (!countrySet.has(iso3)) continue;
    const flow = String(row.flow_code || '').trim().toUpperCase();
    if (flow !== flowCode) continue;
    const cmd = String(row.cmd_code || '').trim().toUpperCase();
    if (!cmdPrefixes.some((prefix) => cmd.startsWith(prefix))) continue;
    const date = parseDate(row.period_date);
    if (!date) continue;
    const qty = parseNumber(row.qty_num);
    const qtyWanTon = qty !== null ? qtyToWanTon(qty, row.qty_unit) : null;
    if (qtyWanTon === null || !Number.isFinite(qtyWanTon) || qtyWanTon <= 0) continue;
    const valueUsd =
      parseNumber(row.primary_value_usd_num) ??
      parseNumber(row.fob_value_usd_num) ??
      parseNumber(row.cif_value_usd_num);
    if (valueUsd === null || !Number.isFinite(valueUsd)) continue;

    const partnerCode = String(row.partner_code || '').trim();
    const partnerDesc = String(row.partner_desc || '').trim().toLowerCase();
    const isWorld = partnerCode === '0' || partnerDesc === 'world';
    const bucket = byMonth.get(date) ?? {
      worldValueUsd: 0,
      worldQtyWanTon: 0,
      totalValueUsd: 0,
      totalQtyWanTon: 0,
      hasWorld: false,
    };
    bucket.totalValueUsd += valueUsd;
    bucket.totalQtyWanTon += qtyWanTon;
    if (isWorld) {
      bucket.worldValueUsd += valueUsd;
      bucket.worldQtyWanTon += qtyWanTon;
      bucket.hasWorld = true;
    }
    byMonth.set(date, bucket);
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => {
      const useWorld = bucket.hasWorld && bucket.worldQtyWanTon > 0;
      const valueUsd = useWorld ? bucket.worldValueUsd : bucket.totalValueUsd;
      const qtyWanTon = useWorld ? bucket.worldQtyWanTon : bucket.totalQtyWanTon;
      const qtyTon = qtyWanTon * 10000;
      const unitValue = qtyTon > 0 ? valueUsd / qtyTon : NaN;
      return { date, value: unitValue };
    })
    .filter((row) => Number.isFinite(row.value));
}

function toWorldTradeUnitValueUsdPerTonSeries(rows: SupabaseRow[]): PublishPoint[] {
  return rows
    .map((row) => {
      const date = parseDate(row.period_date);
      const valueUsd = parseNumber(row.world_copper_export_value_usd);
      const weightTonDirect = parseNumber(row.world_copper_export_weight_tonnes);
      const weightKg = parseNumber(row.world_copper_export_weight_kg);
      const weightWanTon = parseNumber(row.world_copper_export_weight_wan_t);
      const weightTon =
        weightTonDirect ??
        (weightKg !== null ? weightKg / 1000 : null) ??
        (weightWanTon !== null ? weightWanTon * 10000 : null);
      if (!date || valueUsd === null || weightTon === null || !Number.isFinite(weightTon) || weightTon <= 0) {
        return null;
      }
      return { date, value: valueUsd / weightTon };
    })
    .filter((row): row is PublishPoint => Boolean(row))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function toJapanTradeQtySeriesByHsScope(
  rows: SupabaseRow[],
  opts: { flowCode: string; hsScopeList: string[] }
): PublishPoint[] {
  const flowCode = opts.flowCode.trim().toUpperCase();
  const hsSet = new Set(opts.hsScopeList.map((v) => v.trim()).filter(Boolean));
  if (!flowCode || !hsSet.size) return [];
  const byMonth = new Map<string, number>();
  for (const row of rows) {
    const flow = String(row.flow_code || '').trim().toUpperCase();
    if (flow !== flowCode) continue;
    const hsScope = String(row.hs_scope || '').trim();
    if (!hsSet.has(hsScope)) continue;
    const date = parseDate(row.period_date);
    if (!date) continue;
    const qtyWanTon =
      parseNumber(row.japan_copper_trade_weight_wan_t) ??
      (() => {
        const kg = parseNumber(row.japan_copper_trade_weight_kg);
        return kg !== null ? kg / 10000000 : null;
      })() ??
      (() => {
        const ton = parseNumber(row.japan_copper_trade_weight_tonnes);
        return ton !== null ? ton / 10000 : null;
      })();
    if (qtyWanTon === null || !Number.isFinite(qtyWanTon)) continue;
    byMonth.set(date, (byMonth.get(date) || 0) + qtyWanTon);
  }
  return Array.from(byMonth.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function toJapanTradeValueAndUnitUsdPerTonSeriesByHsScope(
  rows: SupabaseRow[],
  opts: { flowCode: string; hsScopeList: string[] }
): { valueSeries: PublishPoint[]; unitSeries: PublishPoint[] } {
  const flowCode = opts.flowCode.trim().toUpperCase();
  const hsSet = new Set(opts.hsScopeList.map((v) => v.trim()).filter(Boolean));
  if (!flowCode || !hsSet.size) {
    return { valueSeries: [], unitSeries: [] };
  }
  const byMonth = new Map<
    string,
    {
      worldValueUsd: number;
      worldWeightTon: number;
      totalValueUsd: number;
      totalWeightTon: number;
      hasWorld: boolean;
    }
  >();
  for (const row of rows) {
    const flow = String(row.flow_code || '').trim().toUpperCase();
    if (flow !== flowCode) continue;
    const hsScope = String(row.hs_scope || '').trim();
    if (!hsSet.has(hsScope)) continue;
    const date = parseDate(row.period_date);
    if (!date) continue;
    const valueUsd = parseNumber(row.japan_copper_trade_value_usd);
    const weightTon =
      parseNumber(row.japan_copper_trade_weight_tonnes) ??
      (() => {
        const kg = parseNumber(row.japan_copper_trade_weight_kg);
        return kg !== null ? kg / 1000 : null;
      })() ??
      (() => {
        const wanTon = parseNumber(row.japan_copper_trade_weight_wan_t);
        return wanTon !== null ? wanTon * 10000 : null;
      })();
    const partnerCode = String(row.partner_code || '').trim();
    const partnerDesc = String(row.partner_desc || '').trim().toLowerCase();
    const isWorld = partnerCode === '0' || partnerDesc === 'world';
    const bucket = byMonth.get(date) ?? {
      worldValueUsd: 0,
      worldWeightTon: 0,
      totalValueUsd: 0,
      totalWeightTon: 0,
      hasWorld: false,
    };
    if (isWorld) bucket.hasWorld = true;
    if (valueUsd !== null && Number.isFinite(valueUsd)) {
      bucket.totalValueUsd += valueUsd;
      if (isWorld) bucket.worldValueUsd += valueUsd;
    }
    if (weightTon !== null && Number.isFinite(weightTon)) {
      bucket.totalWeightTon += weightTon;
      if (isWorld) bucket.worldWeightTon += weightTon;
    }
    byMonth.set(date, bucket);
  }
  const valueSeries: PublishPoint[] = [];
  const unitSeries: PublishPoint[] = [];
  for (const [date, bucket] of Array.from(byMonth.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    const useWorld = bucket.hasWorld;
    const valueUsd = useWorld ? bucket.worldValueUsd : bucket.totalValueUsd;
    const weightTon = useWorld ? bucket.worldWeightTon : bucket.totalWeightTon;
    if (Number.isFinite(valueUsd)) {
      valueSeries.push({ date, value: valueUsd });
      if (Number.isFinite(weightTon) && weightTon > 0) {
        unitSeries.push({ date, value: valueUsd / weightTon });
      }
    }
  }
  return { valueSeries, unitSeries };
}

function toJapanMofTradeValueAndUnitJpyPerTonSeriesByHsScope(
  rows: SupabaseRow[],
  opts: { flowCode: string; hsScopeList: string[] }
): { valueSeries: PublishPoint[]; unitSeries: PublishPoint[] } {
  const flowCode = opts.flowCode.trim().toUpperCase();
  const hsSet = new Set(opts.hsScopeList.map((v) => v.trim()).filter(Boolean));
  if (!flowCode || !hsSet.size) {
    return { valueSeries: [], unitSeries: [] };
  }
  const valueByMonth = new Map<string, number>();
  const weightByMonth = new Map<string, number>();
  for (const row of rows) {
    const flow = String(row.flow_code || '').trim().toUpperCase();
    if (flow !== flowCode) continue;
    const hsScope = String(row.hs_scope || '').trim();
    if (!hsSet.has(hsScope)) continue;
    const date = parseDate(row.period_date);
    if (!date) continue;
    const valueJpy =
      parseNumber(row.japan_mof_trade_value_jpy) ??
      (() => {
        const v1000 = parseNumber(row.japan_mof_trade_value_1000yen);
        return v1000 !== null ? v1000 * 1000 : null;
      })();
    const weightTon =
      parseNumber(row.japan_mof_trade_weight_tonnes) ??
      (() => {
        const kg = parseNumber(row.japan_mof_trade_weight_kg);
        return kg !== null ? kg / 1000 : null;
      })() ??
      (() => {
        const wanTon = parseNumber(row.japan_mof_trade_weight_wan_t);
        return wanTon !== null ? wanTon * 10000 : null;
      })();
    if (valueJpy !== null && Number.isFinite(valueJpy)) {
      valueByMonth.set(date, (valueByMonth.get(date) || 0) + valueJpy);
    }
    if (weightTon !== null && Number.isFinite(weightTon) && weightTon > 0) {
      weightByMonth.set(date, (weightByMonth.get(date) || 0) + weightTon);
    }
  }
  const valueSeries: PublishPoint[] = [];
  const unitSeries: PublishPoint[] = [];
  for (const [date, value] of Array.from(valueByMonth.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    valueSeries.push({ date, value });
    const weightTon = weightByMonth.get(date);
    if (weightTon && Number.isFinite(weightTon) && weightTon > 0) {
      unitSeries.push({ date, value: value / weightTon });
    }
  }
  return { valueSeries, unitSeries };
}

function toJapanMofTradeQtyWanTonSeriesByHsScope(
  rows: SupabaseRow[],
  opts: { flowCode: string; hsScopeList: string[] }
): PublishPoint[] {
  const flowCode = opts.flowCode.trim().toUpperCase();
  const hsSet = new Set(opts.hsScopeList.map((v) => v.trim()).filter(Boolean));
  if (!flowCode || !hsSet.size) return [];
  const byMonth = new Map<string, number>();
  for (const row of rows) {
    const flow = String(row.flow_code || '').trim().toUpperCase();
    if (flow !== flowCode) continue;
    const hsScope = String(row.hs_scope || '').trim();
    if (!hsSet.has(hsScope)) continue;
    const date = parseDate(row.period_date);
    if (!date) continue;
    const qtyWanTon =
      parseNumber(row.japan_mof_trade_weight_wan_t) ??
      (() => {
        const kg = parseNumber(row.japan_mof_trade_weight_kg);
        return kg !== null ? kg / 10000000 : null;
      })() ??
      (() => {
        const ton = parseNumber(row.japan_mof_trade_weight_tonnes);
        return ton !== null ? ton / 10000 : null;
      })();
    if (qtyWanTon === null || !Number.isFinite(qtyWanTon)) continue;
    byMonth.set(date, (byMonth.get(date) || 0) + qtyWanTon);
  }
  return Array.from(byMonth.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function toJapanMofTradeValueJpySeriesByHsScopeAndPartnerCodes(
  rows: SupabaseRow[],
  opts: { flowCode: string; hsScopeList: string[]; partnerCodes: string[] }
): PublishPoint[] {
  const flowCode = opts.flowCode.trim().toUpperCase();
  const hsSet = new Set(opts.hsScopeList.map((v) => v.trim()).filter(Boolean));
  const partnerSet = new Set(opts.partnerCodes.map((v) => v.trim()).filter(Boolean));
  if (!flowCode || !hsSet.size || !partnerSet.size) return [];
  const byMonth = new Map<string, number>();
  for (const row of rows) {
    const flow = String(row.flow_code || '').trim().toUpperCase();
    if (flow !== flowCode) continue;
    const hsScope = String(row.hs_scope || '').trim();
    if (!hsSet.has(hsScope)) continue;
    const partnerCode = String(row.partner_code || '').trim();
    if (!partnerSet.has(partnerCode)) continue;
    const date = parseDate(row.period_date);
    if (!date) continue;
    const valueJpy =
      parseNumber(row.japan_mof_trade_value_jpy) ??
      (() => {
        const v1000 = parseNumber(row.japan_mof_trade_value_1000yen);
        return v1000 !== null ? v1000 * 1000 : null;
      })();
    if (valueJpy === null || !Number.isFinite(valueJpy)) continue;
    byMonth.set(date, (byMonth.get(date) || 0) + valueJpy);
  }
  return Array.from(byMonth.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function sumSeriesByDate(seriesList: PublishPoint[][]): PublishPoint[] {
  const map = new Map<string, number>();
  for (const rows of seriesList) {
    for (const row of rows) {
      if (!row.date || !Number.isFinite(row.value)) continue;
      map.set(row.date, (map.get(row.date) || 0) + row.value);
    }
  }
  return Array.from(map.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function toJpyPerTonSeriesByUsdPerTonAndFx(
  unitUsdPerTon: PublishPoint[],
  usdJpy: PublishPoint[]
): PublishPoint[] {
  if (!unitUsdPerTon.length || !usdJpy.length) return [];
  let j = 0;
  const out: PublishPoint[] = [];
  for (const row of unitUsdPerTon) {
    while (j + 1 < usdJpy.length && usdJpy[j + 1].date <= row.date) j += 1;
    const fx = usdJpy[j];
    if (!fx || fx.date > row.date || !Number.isFinite(fx.value)) continue;
    out.push({ date: row.date, value: row.value * fx.value });
  }
  return out;
}

function diffSeriesByDateWithCarryForward(
  minuendRows: PublishPoint[],
  subtrahendRows: PublishPoint[]
): PublishPoint[] {
  if (!minuendRows.length || !subtrahendRows.length) return [];
  let j = 0;
  const out: PublishPoint[] = [];
  for (const row of minuendRows) {
    while (j + 1 < subtrahendRows.length && subtrahendRows[j + 1].date <= row.date) j += 1;
    const sub = subtrahendRows[j];
    if (!sub || sub.date > row.date || !Number.isFinite(sub.value)) continue;
    out.push({ date: row.date, value: row.value - sub.value });
  }
  return out;
}

function subtractSeriesByDate(leftRows: PublishPoint[], rightRows: PublishPoint[]): PublishPoint[] {
  if (!leftRows.length || !rightRows.length) return [];
  const rightMap = new Map<string, number>();
  for (const row of rightRows) {
    if (!row.date || !Number.isFinite(row.value)) continue;
    rightMap.set(row.date, row.value);
  }
  return leftRows
    .map((row) => {
      const right = rightMap.get(row.date);
      if (!Number.isFinite(row.value) || right === undefined || !Number.isFinite(right)) return null;
      return { date: row.date, value: row.value - right };
    })
    .filter((row): row is PublishPoint => row !== null);
}

function ratioPercentSeriesByDate(numeratorRows: PublishPoint[], denominatorRows: PublishPoint[]): PublishPoint[] {
  if (!numeratorRows.length || !denominatorRows.length) return [];
  const denomMap = new Map<string, number>();
  for (const row of denominatorRows) {
    if (!row.date || !Number.isFinite(row.value)) continue;
    denomMap.set(row.date, row.value);
  }
  return numeratorRows
    .map((row) => {
      const denom = denomMap.get(row.date);
      if (!Number.isFinite(row.value) || denom === undefined || !Number.isFinite(denom) || denom === 0) return null;
      return { date: row.date, value: (row.value / denom) * 100 };
    })
    .filter((row): row is PublishPoint => row !== null);
}

function enforcePreferredAfterYm(
  preferredRows: PublishPoint[],
  fallbackRows: PublishPoint[],
  referenceRows: PublishPoint[],
  cutoffYm: string
): PublishPoint[] {
  const preferredMap = new Map(preferredRows.map((row) => [row.date, row.value]));
  const fallbackMap = new Map(fallbackRows.map((row) => [row.date, row.value]));
  const dateSet = new Set<string>();
  for (const row of preferredRows) dateSet.add(row.date);
  for (const row of fallbackRows) dateSet.add(row.date);
  for (const row of referenceRows) dateSet.add(row.date);
  return Array.from(dateSet)
    .sort((a, b) => a.localeCompare(b))
    .map((date) => {
      const ym = date.slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(ym) && ym >= cutoffYm) {
        return { date, value: preferredMap.get(date) ?? 0 };
      }
      const preferred = preferredMap.get(date);
      if (preferred !== undefined && Number.isFinite(preferred)) return { date, value: preferred };
      const fallback = fallbackMap.get(date);
      if (fallback !== undefined && Number.isFinite(fallback)) return { date, value: fallback };
      return null;
    })
    .filter((row): row is PublishPoint => row !== null && Number.isFinite(row.value));
}

export async function readMergedPublishSeriesBundle(): Promise<PublishSeriesBundle | null> {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;

  const [
    tateneRows,
    tateneMonthlyRows,
    fxRows,
    nakaneRows,
    lmeRows,
    wbRows,
    refiningJapanRows,
    worldTradeMonthlyRowsDb,
    worldTradeMonthlyRowsRefinedDb,
    japanTradeMonthlyRowsDb,
    japanTradeMofMonthlyRowsDb,
    tradeRowsDb,
    tradeRowsJpnDb,
  ] = await Promise.all([
    fetchSupabaseRows('copper_tatene_daily', 'price_date,price_jpy_per_ton', 'price_date'),
    fetchSupabaseRows(
      'copper_tatene_monthly',
      'period_date,tatene_avg_jpy_per_ton',
      'period_date'
    ),
    fetchSupabaseRows('copper_fx_monthly', 'period_date,usd_jpy,usd_cny', 'period_date'),
    fetchSupabaseRows('copper_nakane_daily', 'rate_date,usd_jpy_nakane', 'rate_date'),
    fetchSupabaseRows(
      'copper_lme_daily',
      'trade_date,lme_copper_cash_settlement_usd_t',
      'trade_date'
    ),
    fetchSupabaseRows(
      'copper_wb_pink_sheet_monthly',
      'period_date,copper_usd_per_mt',
      'period_date'
    ),
    fetchSupabaseRows(
      'copper_refining_japan_monthly',
      'period_date,electric_copper_inventory_qty,electric_copper_production_qty,electric_copper_sales_qty',
      'period_date'
    ),
    fetchSupabaseRows(
      'copper_trade_world_monthly',
      'period_date,hs_scope,world_copper_export_value_usd,world_copper_export_weight_kg,world_copper_export_weight_tonnes,world_copper_export_weight_wan_t',
      'period_date',
      {
        hs_scope: 'eq.2603',
      }
    ),
    fetchSupabaseRows(
      'copper_trade_world_monthly',
      'period_date,hs_scope,world_copper_export_value_usd,world_copper_export_weight_kg,world_copper_export_weight_tonnes,world_copper_export_weight_wan_t',
      'period_date',
      {
        hs_scope: 'eq.7403',
      }
    ),
    fetchSupabaseRows(
      'copper_trade_japan_monthly',
      'period_date,flow_code,partner_code,hs_scope,japan_copper_trade_value_usd,japan_copper_trade_weight_wan_t,japan_copper_trade_weight_kg,japan_copper_trade_weight_tonnes',
      'period_date'
    ),
    fetchSupabaseRows(
      'copper_trade_japan_mof_monthly',
      'period_date,flow_code,partner_code,hs_scope,japan_mof_trade_value_1000yen,japan_mof_trade_value_jpy,japan_mof_trade_weight_wan_t,japan_mof_trade_weight_kg,japan_mof_trade_weight_tonnes',
      'period_date',
      {
        flow_code: 'in.(M,X)',
        or: '(hs_scope.like.2603*,hs_scope.like.7401*,hs_scope.like.7402*,hs_scope.like.7403*,hs_scope.like.7404*)',
      }
    ),
    fetchSupabaseRows(
      'copper_trade_all',
      'period_date,country_iso3,flow_code,cmd_code,partner_code,partner_desc,qty_num,qty_unit,primary_value_usd_num,fob_value_usd_num,cif_value_usd_num',
      'period_date',
      {
        country_iso3: 'in.(CHL,PER)',
        flow_code: 'eq.X',
        or: '(cmd_code.like.2603*,cmd_code.like.7401*,cmd_code.like.7402*,cmd_code.like.7403*,cmd_code.like.7404*)',
      }
    ),
    fetchSupabaseRows(
      'copper_trade_all',
      'period_date,country_iso3,flow_code,cmd_code,partner_code,partner_desc,qty_num,qty_unit,primary_value_usd_num,fob_value_usd_num,cif_value_usd_num',
      'period_date',
      {
        country_iso3: 'eq.JPN',
        flow_code: 'in.(M,X)',
        or: '(cmd_code.like.2603*,cmd_code.like.7403*,cmd_code.like.7404*)',
      }
    ),
  ]);

  const worldTradeRowsSeed = await readWorldTradeRowsFallbackFromSeed();
  const worldTradeRowsSeed2603 = worldTradeRowsSeed.filter(
    (row) => String(row.hs_scope || '').trim() === '2603'
  );
  const worldTradeRowsSeed7403 = worldTradeRowsSeed.filter(
    (row) => String(row.hs_scope || '').trim() === '7403'
  );
  const worldTradeMonthlyRows = worldTradeRowsSeed2603.length
    ? worldTradeRowsSeed2603
    : worldTradeMonthlyRowsDb;
  const worldTradeMonthlyRowsRefined = worldTradeRowsSeed7403.length
    ? worldTradeRowsSeed7403
    : worldTradeMonthlyRowsRefinedDb;
  const japanTradeMofRowsSeed = await readJapanTradeMofRowsFallbackFromSeed();
  const japanTradeMofMonthlyRows = mergeRowsByKey(
    japanTradeMofMonthlyRowsDb,
    japanTradeMofRowsSeed,
    ['period_date', 'flow_code', 'partner_code', 'hs_scope']
  );

  const tradeRows = tradeRowsDb;
  const tradeRowsJpn = tradeRowsJpnDb;

  const tatene = toSeries(tateneRows, 'price_date', 'price_jpy_per_ton');
  const tateneMonthly = toSeries(tateneMonthlyRows, 'period_date', 'tatene_avg_jpy_per_ton');
  const usdJpyMonthly = toSeries(fxRows, 'period_date', 'usd_jpy');
  const usdJpyNakane = toSeries(nakaneRows, 'rate_date', 'usd_jpy_nakane');
  const usdJpy = mergeSeriesPreferRight(usdJpyMonthly, usdJpyNakane);
  const usdCny = toSeries(fxRows, 'period_date', 'usd_cny');
  const lmeCash = toSeries(lmeRows, 'trade_date', 'lme_copper_cash_settlement_usd_t');
  const wbCopper = toSeries(wbRows, 'period_date', 'copper_usd_per_mt');
  const refiningJapanInv = toSeries(refiningJapanRows, 'period_date', 'electric_copper_inventory_qty');
  const refiningJapanProd = toSeries(refiningJapanRows, 'period_date', 'electric_copper_production_qty');
  const refiningJapanSales = toSeries(refiningJapanRows, 'period_date', 'electric_copper_sales_qty');
  const chileOreExport = toCountryOreExportSeries(tradeRows, 'CHL');
  const peruOreExport = toCountryOreExportSeries(tradeRows, 'PER');
  const rawMaterialExport = toGroupTradeQtySeriesByCmdPrefixes(tradeRows, {
    countryIso3List: ['CHL', 'PER'],
    flowCode: 'X',
    cmdPrefixes: ['2603'],
  });
  const worldRawMaterialExport = toSeries(
    worldTradeMonthlyRows,
    'period_date',
    'world_copper_export_weight_wan_t'
  );
  const copperExportUnitUsdPerTon = toGroupTradeUnitValueUsdPerTonSeriesByCmdPrefixes(tradeRows, {
    countryIso3List: ['CHL', 'PER'],
    flowCode: 'X',
    cmdPrefixes: ['7403'],
  });
  const worldCopperExportUnitUsdPerTon = toWorldTradeUnitValueUsdPerTonSeries(worldTradeMonthlyRowsRefined);
  const japanHs2603ImportFromMonthly = toJapanTradeQtySeriesByHsScope(japanTradeMonthlyRowsDb, {
    flowCode: 'M',
    hsScopeList: ['2603'],
  });
  const japanHs7403ImportFromMonthly = toJapanTradeQtySeriesByHsScope(japanTradeMonthlyRowsDb, {
    flowCode: 'M',
    hsScopeList: ['7403'],
  });
  const japanHs2603ImportFromTradeAll = toCountryTradeSeriesByCmdPrefix(tradeRowsJpn, {
    countryIso3: 'JPN',
    flowCode: 'M',
    cmdPrefix: '2603',
  });
  const japanHs7403ImportFromTradeAll = toCountryTradeSeriesByCmdPrefix(tradeRowsJpn, {
    countryIso3: 'JPN',
    flowCode: 'M',
    cmdPrefix: '7403',
  });
  const japanHs2603Import = japanHs2603ImportFromMonthly.length
    ? japanHs2603ImportFromMonthly
    : japanHs2603ImportFromTradeAll;
  const japanHs7403Import = japanHs7403ImportFromMonthly.length
    ? japanHs7403ImportFromMonthly
    : japanHs7403ImportFromTradeAll;
  const japanHs7403ImportValueAndUnitFromMofMonthly = toJapanMofTradeValueAndUnitJpyPerTonSeriesByHsScope(
    japanTradeMofMonthlyRows,
    {
      flowCode: 'M',
      hsScopeList: ['7403.11'],
    }
  );
  const japanHs7403ImportValueJpy = japanHs7403ImportValueAndUnitFromMofMonthly.valueSeries;
  const japanHs7403ImportUnitJpyPerTon = japanHs7403ImportValueAndUnitFromMofMonthly.unitSeries;
  const japanHs7403_11ImportQtyWanTon = toJapanMofTradeQtyWanTonSeriesByHsScope(japanTradeMofMonthlyRows, {
    flowCode: 'M',
    hsScopeList: ['7403.11'],
  });
  const japanHs7403ImportValueAndUnitFromMonthly = toJapanTradeValueAndUnitUsdPerTonSeriesByHsScope(
    japanTradeMonthlyRowsDb,
    {
      flowCode: 'M',
      hsScopeList: ['7403'],
    }
  );
  const japanHs7403ImportValueUsd = japanHs7403ImportValueAndUnitFromMonthly.valueSeries;
  const japanHs7403ImportUnitUsdPerTon = japanHs7403ImportValueAndUnitFromMonthly.unitSeries;
  const japanHs2603_7403Import = sumSeriesByDate([japanHs2603Import, japanHs7403Import]);
  const japanHs7404ExportFromMonthly = toJapanTradeQtySeriesByHsScope(japanTradeMonthlyRowsDb, {
    flowCode: 'X',
    hsScopeList: ['7404'],
  });
  const japanHs7404ImportFromMonthly = toJapanTradeQtySeriesByHsScope(japanTradeMonthlyRowsDb, {
    flowCode: 'M',
    hsScopeList: ['7404'],
  });
  const japanHs7404ExportFromTradeAll = toCountryTradeSeriesByCmdPrefix(tradeRowsJpn, {
    countryIso3: 'JPN',
    flowCode: 'X',
    cmdPrefix: '7404',
  });
  const japanHs7404ImportFromTradeAll = toCountryTradeSeriesByCmdPrefix(tradeRowsJpn, {
    countryIso3: 'JPN',
    flowCode: 'M',
    cmdPrefix: '7404',
  });
  const japanHs7404ExportWanTon = japanHs7404ExportFromMonthly.length
    ? japanHs7404ExportFromMonthly
    : japanHs7404ExportFromTradeAll;
  const japanHs7404ImportWanTon = japanHs7404ImportFromMonthly.length
    ? japanHs7404ImportFromMonthly
    : japanHs7404ImportFromTradeAll;
  const japanHs7404ExportFromMofMonthly = toJapanMofTradeQtyWanTonSeriesByHsScope(japanTradeMofMonthlyRows, {
    flowCode: 'X',
    hsScopeList: ['7404'],
  });
  const japanHs7404ImportFromMofMonthly = toJapanMofTradeQtyWanTonSeriesByHsScope(japanTradeMofMonthlyRows, {
    flowCode: 'M',
    hsScopeList: ['7404'],
  });
  const japanHs7404ExportWanTonMerged = japanHs7404ExportFromMofMonthly.length
    ? japanHs7404ExportFromMofMonthly
    : japanHs7404ExportWanTon;
  const japanHs7404ImportWanTonMerged = japanHs7404ImportFromMofMonthly.length
    ? japanHs7404ImportFromMofMonthly
    : japanHs7404ImportWanTon;
  const japanHs7404ExportValueAndUnitUsd = toCountryTradeValueAndUnitUsdPerTonSeriesByCmdPrefix(tradeRowsJpn, {
    countryIso3: 'JPN',
    flowCode: 'X',
    cmdPrefix: '7404',
  });
  const japanHs7404ExportValueAndUnitFromMonthly = toJapanTradeValueAndUnitUsdPerTonSeriesByHsScope(
    japanTradeMonthlyRowsDb,
    {
      flowCode: 'X',
      hsScopeList: ['7404'],
    }
  );
  const japanHs7404ImportValueAndUnitUsd = toCountryTradeValueAndUnitUsdPerTonSeriesByCmdPrefix(tradeRowsJpn, {
    countryIso3: 'JPN',
    flowCode: 'M',
    cmdPrefix: '7404',
  });
  const japanHs7404ImportValueAndUnitFromMofMonthly = toJapanMofTradeValueAndUnitJpyPerTonSeriesByHsScope(
    japanTradeMofMonthlyRows,
    {
      flowCode: 'M',
      hsScopeList: ['7404'],
    }
  );
  const hs7404ImportDetailScopes = ['7404.00-010', '7404.00-091', '7404.00-099'];
  const hs7404ExportDetailScopes = [
    '7404.00-100',
    '7404.00-200',
    '7404.00-300',
    '7404.00-900',
    '7404.00-910',
    '7404.00-920',
    '7404.00-990',
  ];
  const japanHs7404ImportDetailValueAndUnitFromMofMonthly = toJapanMofTradeValueAndUnitJpyPerTonSeriesByHsScope(
    japanTradeMofMonthlyRows,
    {
      flowCode: 'M',
      hsScopeList: hs7404ImportDetailScopes,
    }
  );
  const japanHs7404ExportDetailValueAndUnitFromMofMonthly = toJapanMofTradeValueAndUnitJpyPerTonSeriesByHsScope(
    japanTradeMofMonthlyRows,
    {
      flowCode: 'X',
      hsScopeList: hs7404ExportDetailScopes,
    }
  );
  const japanHs7404_00_010ImportValueAndUnitFromMofMonthly = toJapanMofTradeValueAndUnitJpyPerTonSeriesByHsScope(
    japanTradeMofMonthlyRows,
    {
      flowCode: 'M',
      hsScopeList: ['7404.00-010'],
    }
  );
  const japanHs7404ExportValueAndUnitFromMofMonthly = toJapanMofTradeValueAndUnitJpyPerTonSeriesByHsScope(
    japanTradeMofMonthlyRows,
    {
      flowCode: 'X',
      hsScopeList: ['7404'],
    }
  );
  const japanHs7404_00_100ExportValueAndUnitFromMofMonthly = toJapanMofTradeValueAndUnitJpyPerTonSeriesByHsScope(
    japanTradeMofMonthlyRows,
    {
      flowCode: 'X',
      hsScopeList: ['7404.00-100'],
    }
  );
  const japanHs7404ExportUnitJpyPerTon = toJpyPerTonSeriesByUsdPerTonAndFx(
    japanHs7404ExportValueAndUnitUsd.unitSeries,
    usdJpyMonthly
  );
  const japanHs7404ExportUnitJpyPerTonFromMonthly = toJpyPerTonSeriesByUsdPerTonAndFx(
    japanHs7404ExportValueAndUnitFromMonthly.unitSeries,
    usdJpyMonthly
  );
  const japanHs7404ExportUnitJpyPerTonMerged = japanHs7404ExportUnitJpyPerTonFromMonthly.length
    ? japanHs7404ExportUnitJpyPerTonFromMonthly
    : japanHs7404ExportUnitJpyPerTon;
  const japanHs7404ExportUnitJpyPerTonSpecificBase = mergeSeriesPreferPrimaryByDate(
    japanHs7404_00_100ExportValueAndUnitFromMofMonthly.unitSeries,
    mergeSeriesPreferPrimaryByDate(
      japanHs7404ExportDetailValueAndUnitFromMofMonthly.unitSeries,
      japanHs7404ExportUnitJpyPerTonMerged
    )
  );
  const japanHs7404ExportUnitJpyPerTonSpecific = enforcePreferredAfterYm(
    japanHs7404_00_100ExportValueAndUnitFromMofMonthly.unitSeries,
    japanHs7404ExportUnitJpyPerTonSpecificBase,
    japanHs7404ImportDetailValueAndUnitFromMofMonthly.unitSeries,
    '2025-01'
  );
  const japanHs7404ExportUnitJpyPerTonOfficial = japanHs7404ExportValueAndUnitFromMofMonthly.unitSeries.length
    ? japanHs7404ExportValueAndUnitFromMofMonthly.unitSeries
    : japanHs7404ExportUnitJpyPerTonSpecific;
  const japanHs7404ImportUnitJpyPerTonFallback = toJpyPerTonSeriesByUsdPerTonAndFx(
    japanHs7404ImportValueAndUnitUsd.unitSeries,
    usdJpyMonthly
  );
  const japanHs7404ImportUnitJpyPerTon = japanHs7404ImportValueAndUnitFromMofMonthly.unitSeries.length
    ? japanHs7404ImportValueAndUnitFromMofMonthly.unitSeries
    : japanHs7404ImportUnitJpyPerTonFallback;
  const japanHs7404ImportUnitJpyPerTonSpecific = mergeSeriesPreferPrimaryByDate(
    japanHs7404_00_010ImportValueAndUnitFromMofMonthly.unitSeries,
    mergeSeriesPreferPrimaryByDate(
      japanHs7404ImportDetailValueAndUnitFromMofMonthly.unitSeries,
      japanHs7404ImportUnitJpyPerTon
    )
  );
  const majorScrapImporterCodes = ['156', '410', '458', '704', '764'];
  const japanHs7404MajorImporterValueUsd = toCountryTradeValueUsdSeriesByCmdPrefixAndPartnerCodes(tradeRowsJpn, {
    countryIso3: 'JPN',
    flowCode: 'X',
    cmdPrefix: '7404',
    partnerCodes: majorScrapImporterCodes,
  });
  const japanHs7404MajorImporterValueJpyFromMof = toJapanMofTradeValueJpySeriesByHsScopeAndPartnerCodes(
    japanTradeMofMonthlyRows,
    {
      flowCode: 'X',
      hsScopeList: ['7404'],
      partnerCodes: majorScrapImporterCodes,
    }
  );
  const japanHs7404MajorImporterSharePctFromMof = ratioPercentSeriesByDate(
    japanHs7404MajorImporterValueJpyFromMof,
    japanHs7404ExportValueAndUnitFromMofMonthly.valueSeries
  );
  const japanHs7404MajorImporterSharePct = ratioPercentSeriesByDate(
    japanHs7404MajorImporterValueUsd,
    japanHs7404ExportValueAndUnitUsd.valueSeries
  );
  const japanHs7404MajorImporterSharePctMerged = japanHs7404MajorImporterSharePctFromMof.length
    ? japanHs7404MajorImporterSharePctFromMof
    : japanHs7404MajorImporterSharePct;
  const japanHs7404_00_100ExportFromMofMonthly = toJapanMofTradeQtyWanTonSeriesByHsScope(japanTradeMofMonthlyRows, {
    flowCode: 'X',
    hsScopeList: ['7404.00-100'],
  });
  const japanHs7404ExportDetailFromMofMonthly = toJapanMofTradeQtyWanTonSeriesByHsScope(japanTradeMofMonthlyRows, {
    flowCode: 'X',
    hsScopeList: hs7404ExportDetailScopes,
  });
  const japanHs7404_00_010ImportFromMofMonthly = toJapanMofTradeQtyWanTonSeriesByHsScope(japanTradeMofMonthlyRows, {
    flowCode: 'M',
    hsScopeList: ['7404.00-010'],
  });
  const japanHs7404ImportDetailFromMofMonthly = toJapanMofTradeQtyWanTonSeriesByHsScope(japanTradeMofMonthlyRows, {
    flowCode: 'M',
    hsScopeList: hs7404ImportDetailScopes,
  });
  const japanHs7404ExportWanTonSpecificBase = mergeSeriesPreferPrimaryByDate(
    japanHs7404_00_100ExportFromMofMonthly,
    mergeSeriesPreferPrimaryByDate(japanHs7404ExportDetailFromMofMonthly, japanHs7404ExportWanTonMerged)
  );
  const japanHs7404ExportWanTonSpecific = enforcePreferredAfterYm(
    japanHs7404_00_100ExportFromMofMonthly,
    japanHs7404ExportWanTonSpecificBase,
    japanHs7404ImportDetailFromMofMonthly,
    '2025-01'
  );
  const japanHs7404ImportWanTonSpecific = mergeSeriesPreferPrimaryByDate(
    japanHs7404_00_010ImportFromMofMonthly,
    mergeSeriesPreferPrimaryByDate(japanHs7404ImportDetailFromMofMonthly, japanHs7404ImportWanTonMerged)
  );
  const japanHs7404NetImportWanTon = subtractSeriesByDate(japanHs7404ExportWanTonSpecific, japanHs7404ImportWanTonSpecific);
  const tateneMonthlyJpyPerTon = tateneMonthly;
  const japanHs7404ScrapSpreadJpyPerTon = diffSeriesByDateWithCarryForward(
    tateneMonthlyJpyPerTon,
    japanHs7404ExportUnitJpyPerTonOfficial
  );

  const mergedLmeCash = lmeCash.length ? lmeCash : wbCopper;
  if (
    !tatene.length &&
    !usdJpy.length &&
    !usdCny.length &&
    !mergedLmeCash.length &&
    !chileOreExport.length &&
    !peruOreExport.length &&
    !japanHs2603_7403Import.length
  ) {
    return null;
  }

  return {
    generated_at: new Date().toISOString(),
    series: {
      japan_tatene_jpy_t: tatene,
      japan_tatene_monthly_avg_jpy_t: tateneMonthly,
      america_dexjpus: usdJpy,
      japan_usd_jpy_monthly: usdJpyMonthly,
      japan_usd_jpy_nakane_daily: usdJpyNakane,
      america_dexchus: usdCny,
      lme_copper_cash_usd_t: mergedLmeCash,
      lme_copper_3month_usd_t: mergedLmeCash,
      cmo_pink_sheet_copper_usd_t: wbCopper,
      supply_chain_refining_jp_electric_copper_inventory_qty: refiningJapanInv,
      supply_chain_refining_jp_electric_copper_production_qty: refiningJapanProd,
      supply_chain_refining_jp_electric_copper_sales_qty: refiningJapanSales,
      trade_chile_hs2603_export_wan_t: chileOreExport,
      trade_peru_hs2603_export_wan_t: peruOreExport,
      trade_raw_material_export_wan_t: rawMaterialExport,
      trade_copper_export_unit_usd_t: copperExportUnitUsdPerTon,
      trade_world_raw_material_export_wan_t: worldRawMaterialExport,
      trade_world_copper_export_unit_usd_t: worldCopperExportUnitUsdPerTon,
      trade_japan_hs2603_import_wan_t: japanHs2603Import,
      trade_japan_hs7403_import_wan_t: japanHs7403Import,
      trade_japan_hs7403_11_import_wan_t: japanHs7403_11ImportQtyWanTon,
      trade_japan_hs7403_import_value_jpy: japanHs7403ImportValueJpy,
      trade_japan_hs7403_import_unit_jpy_t: japanHs7403ImportUnitJpyPerTon,
      trade_japan_hs7403_import_value_usd: japanHs7403ImportValueUsd,
      trade_japan_hs7403_import_unit_usd_t: japanHs7403ImportUnitUsdPerTon,
      trade_japan_hs2603_7403_import_wan_t: japanHs2603_7403Import,
      trade_japan_hs7404_export_unit_jpy_t: japanHs7404ExportUnitJpyPerTonSpecific,
      trade_japan_hs7404_import_unit_jpy_t: japanHs7404ImportUnitJpyPerTonSpecific,
      trade_japan_hs7404_export_wan_t: japanHs7404ExportWanTonSpecific,
      trade_japan_hs7404_import_wan_t: japanHs7404ImportWanTonSpecific,
      trade_japan_hs7404_net_import_wan_t: japanHs7404NetImportWanTon,
      trade_japan_hs7404_major_importer_value_usd: japanHs7404MajorImporterValueUsd,
      trade_japan_hs7404_major_importer_share_pct: japanHs7404MajorImporterSharePctMerged,
      trade_japan_hs7404_spread_jpy_t: japanHs7404ScrapSpreadJpyPerTon,
    },
    latest: {
      japan_tatene_jpy_t: latestOf(tatene),
      japan_tatene_monthly_avg_jpy_t: latestOf(tateneMonthly),
      america_dexjpus: latestOf(usdJpy),
      japan_usd_jpy_monthly: latestOf(usdJpyMonthly),
      japan_usd_jpy_nakane_daily: latestOf(usdJpyNakane),
      america_dexchus: latestOf(usdCny),
      lme_copper_cash_usd_t: latestOf(mergedLmeCash),
      lme_copper_3month_usd_t: latestOf(mergedLmeCash),
      cmo_pink_sheet_copper_usd_t: latestOf(wbCopper),
      supply_chain_refining_jp_electric_copper_inventory_qty: latestOf(refiningJapanInv),
      supply_chain_refining_jp_electric_copper_production_qty: latestOf(refiningJapanProd),
      supply_chain_refining_jp_electric_copper_sales_qty: latestOf(refiningJapanSales),
      trade_chile_hs2603_export_wan_t: latestOf(chileOreExport),
      trade_peru_hs2603_export_wan_t: latestOf(peruOreExport),
      trade_raw_material_export_wan_t: latestOf(rawMaterialExport),
      trade_copper_export_unit_usd_t: latestOf(copperExportUnitUsdPerTon),
      trade_world_raw_material_export_wan_t: latestOf(worldRawMaterialExport),
      trade_world_copper_export_unit_usd_t: latestOf(worldCopperExportUnitUsdPerTon),
      trade_japan_hs2603_import_wan_t: latestOf(japanHs2603Import),
      trade_japan_hs7403_import_wan_t: latestOf(japanHs7403Import),
      trade_japan_hs7403_11_import_wan_t: latestOf(japanHs7403_11ImportQtyWanTon),
      trade_japan_hs7403_import_value_jpy: latestOf(japanHs7403ImportValueJpy),
      trade_japan_hs7403_import_unit_jpy_t: latestOf(japanHs7403ImportUnitJpyPerTon),
      trade_japan_hs7403_import_value_usd: latestOf(japanHs7403ImportValueUsd),
      trade_japan_hs7403_import_unit_usd_t: latestOf(japanHs7403ImportUnitUsdPerTon),
      trade_japan_hs2603_7403_import_wan_t: latestOf(japanHs2603_7403Import),
      trade_japan_hs7404_export_unit_jpy_t: latestOf(japanHs7404ExportUnitJpyPerTonSpecific),
      trade_japan_hs7404_import_unit_jpy_t: latestOf(japanHs7404ImportUnitJpyPerTonSpecific),
      trade_japan_hs7404_export_wan_t: latestOf(japanHs7404ExportWanTonSpecific),
      trade_japan_hs7404_import_wan_t: latestOf(japanHs7404ImportWanTonSpecific),
      trade_japan_hs7404_net_import_wan_t: latestOf(japanHs7404NetImportWanTon),
      trade_japan_hs7404_major_importer_value_usd: latestOf(japanHs7404MajorImporterValueUsd),
      trade_japan_hs7404_major_importer_share_pct: latestOf(japanHs7404MajorImporterSharePctMerged),
      trade_japan_hs7404_spread_jpy_t: latestOf(japanHs7404ScrapSpreadJpyPerTon),
    },
    meta: {
      japan_tatene_jpy_t: {
        indicator_key: 'japan_tatene_jpy_t',
        display_name: '国内建値',
        freq_hint: 'daily',
      },
      japan_tatene_monthly_avg_jpy_t: {
        indicator_key: 'japan_tatene_monthly_avg_jpy_t',
        display_name: '国内建値（月次平均）',
        freq_hint: 'monthly',
      },
      america_dexjpus: {
        indicator_key: 'america_dexjpus',
        display_name: 'USD/JPY 為替レート',
        freq_hint: usdJpyNakane.length ? 'daily' : 'monthly',
      },
      japan_usd_jpy_monthly: {
        indicator_key: 'japan_usd_jpy_monthly',
        display_name: 'USD/JPY 為替レート（月次）',
        freq_hint: 'monthly',
      },
      japan_usd_jpy_nakane_daily: {
        indicator_key: 'japan_usd_jpy_nakane_daily',
        display_name: 'USD/JPY 仲値（日次）',
        freq_hint: 'daily',
      },
      america_dexchus: {
        indicator_key: 'america_dexchus',
        display_name: 'USD/CNY 為替レート',
        freq_hint: 'monthly',
      },
      lme_copper_cash_usd_t: {
        indicator_key: 'lme_copper_cash_usd_t',
        display_name: 'LME銅（USD/mt）',
        freq_hint: lmeCash.length ? 'daily' : 'monthly',
      },
      lme_copper_3month_usd_t: {
        indicator_key: 'lme_copper_3month_usd_t',
        display_name: 'LME銅3M（USD/mt）',
        freq_hint: lmeCash.length ? 'daily' : 'monthly',
      },
      cmo_pink_sheet_copper_usd_t: {
        indicator_key: 'cmo_pink_sheet_copper_usd_t',
        display_name: 'World Bank Pink Sheet Copper',
        freq_hint: 'monthly',
      },
      supply_chain_refining_jp_electric_copper_inventory_qty: {
        indicator_key: 'supply_chain_refining_jp_electric_copper_inventory_qty',
        display_name: '日本 電気銅 在庫量',
        freq_hint: 'monthly',
      },
      supply_chain_refining_jp_electric_copper_production_qty: {
        indicator_key: 'supply_chain_refining_jp_electric_copper_production_qty',
        display_name: '日本 電気銅 生産量',
        freq_hint: 'monthly',
      },
      supply_chain_refining_jp_electric_copper_sales_qty: {
        indicator_key: 'supply_chain_refining_jp_electric_copper_sales_qty',
        display_name: '日本 電気銅 販売量',
        freq_hint: 'monthly',
      },
      trade_chile_hs2603_export_wan_t: {
        indicator_key: 'trade_chile_hs2603_export_wan_t',
        display_name: 'チリ HS2603 輸出量（万トン）',
        freq_hint: 'monthly',
      },
      trade_peru_hs2603_export_wan_t: {
        indicator_key: 'trade_peru_hs2603_export_wan_t',
        display_name: 'ペルー HS2603 輸出量（万トン）',
        freq_hint: 'monthly',
      },
      trade_raw_material_export_wan_t: {
        indicator_key: 'trade_raw_material_export_wan_t',
        display_name: '原材料輸出量（CHL+PER HS2603, 万トン）',
        freq_hint: 'monthly',
      },
      trade_copper_export_unit_usd_t: {
        indicator_key: 'trade_copper_export_unit_usd_t',
        display_name: '輸出単価（CHL+PER HS7403, USD/t）',
        freq_hint: 'monthly',
      },
      trade_world_raw_material_export_wan_t: {
        indicator_key: 'trade_world_raw_material_export_wan_t',
        display_name: '原材料輸出量（世界 HS2603, 万トン）',
        freq_hint: 'monthly',
      },
      trade_world_copper_export_unit_usd_t: {
        indicator_key: 'trade_world_copper_export_unit_usd_t',
        display_name: '輸出単価（世界 HS7403, USD/t）',
        freq_hint: 'monthly',
      },
      trade_japan_hs7403_import_wan_t: {
        indicator_key: 'trade_japan_hs7403_import_wan_t',
        display_name: '日本 HS7403 輸入量（万トン）',
        freq_hint: 'monthly',
      },
      trade_japan_hs7403_11_import_wan_t: {
        indicator_key: 'trade_japan_hs7403_11_import_wan_t',
        display_name: '日本 HS7403.11 輸入量（万トン, MOF）',
        freq_hint: 'monthly',
      },
      trade_japan_hs7403_import_value_usd: {
        indicator_key: 'trade_japan_hs7403_import_value_usd',
        display_name: '日本 HS7403 輸入金額（USD）',
        freq_hint: 'monthly',
      },
      trade_japan_hs7403_import_value_jpy: {
        indicator_key: 'trade_japan_hs7403_import_value_jpy',
        display_name: '日本 HS7403.11 輸入金額（JPY, MOF）',
        freq_hint: 'monthly',
      },
      trade_japan_hs7403_import_unit_usd_t: {
        indicator_key: 'trade_japan_hs7403_import_unit_usd_t',
        display_name: '日本 HS7403 輸入単価（USD/t）',
        freq_hint: 'monthly',
      },
      trade_japan_hs7403_import_unit_jpy_t: {
        indicator_key: 'trade_japan_hs7403_import_unit_jpy_t',
        display_name: '日本 HS7403.11 輸入単価（JPY/t, MOF）',
        freq_hint: 'monthly',
      },
      trade_japan_hs2603_import_wan_t: {
        indicator_key: 'trade_japan_hs2603_import_wan_t',
        display_name: '日本 HS2603 輸入量（万トン）',
        freq_hint: 'monthly',
      },
      trade_japan_hs2603_7403_import_wan_t: {
        indicator_key: 'trade_japan_hs2603_7403_import_wan_t',
        display_name: '日本 HS2603+7403 輸入量（万トン）',
        freq_hint: 'monthly',
      },
      trade_japan_hs7404_export_unit_jpy_t: {
        indicator_key: 'trade_japan_hs7404_export_unit_jpy_t',
        display_name: '日本 HS7404 輸出単価（JPY/t）',
        freq_hint: 'monthly',
      },
      trade_japan_hs7404_export_wan_t: {
        indicator_key: 'trade_japan_hs7404_export_wan_t',
        display_name: '日本 HS7404 輸出量（万トン）',
        freq_hint: 'monthly',
      },
      trade_japan_hs7404_import_wan_t: {
        indicator_key: 'trade_japan_hs7404_import_wan_t',
        display_name: '日本 HS7404 輸入量（万トン）',
        freq_hint: 'monthly',
      },
      trade_japan_hs7404_import_unit_jpy_t: {
        indicator_key: 'trade_japan_hs7404_import_unit_jpy_t',
        display_name: '日本 HS7404 輸入単価（JPY/t）',
        freq_hint: 'monthly',
      },
      trade_japan_hs7404_net_import_wan_t: {
        indicator_key: 'trade_japan_hs7404_net_import_wan_t',
        display_name: '日本 HS7404 純輸入量（輸出量-輸入量, 万トン）',
        freq_hint: 'monthly',
      },
      trade_japan_hs7404_major_importer_value_usd: {
        indicator_key: 'trade_japan_hs7404_major_importer_value_usd',
        display_name: '主要国の日本スクラップ輸入額（USD）',
        freq_hint: 'monthly',
      },
      trade_japan_hs7404_major_importer_share_pct: {
        indicator_key: 'trade_japan_hs7404_major_importer_share_pct',
        display_name: '主要国向け日本 HS7404 輸出シェア（%）',
        freq_hint: 'monthly',
      },
      trade_japan_hs7404_spread_jpy_t: {
        indicator_key: 'trade_japan_hs7404_spread_jpy_t',
        display_name: 'スクラップ・スプレッド（国内建値-7404輸出単価, JPY/t）',
        freq_hint: 'monthly',
      },
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
