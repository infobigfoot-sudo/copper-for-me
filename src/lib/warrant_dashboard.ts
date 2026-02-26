import { cache } from 'react';
import { promises as fs } from 'fs';
import path from 'path';

type DayPoint = { date: string; value: number };
type MonthPoint = { month: string; value: number };
type PublishSeriesBundle = {
  series?: Record<string, Array<{ date: string; value: number }>>;
};

export type WarrantDashboardData = {
  copperTate: {
    latest: DayPoint | null;
    prev: DayPoint | null;
    diffPct1d: number | null;
  };
  warrant: {
    latest: DayPoint | null;
    prev: DayPoint | null;
    diffPct1d: number | null;
    diffPct7d: number | null;
    ma20: number | null;
    monthlyLatest: MonthPoint | null;
    monthlyPrev: MonthPoint | null;
    diffPctMoM: number | null;
  };
  offWarrant: {
    latest: MonthPoint | null;
    prev: MonthPoint | null;
    diffPctMoM: number | null;
  };
  ratio: number | null;
  alerts: string[];
  charts: {
    warrantDaily: DayPoint[];
    offWarrantMonthly: MonthPoint[];
    copperTateDaily: DayPoint[];
  };
  breakdown: {
    warrantLatestByLocation: Array<{ country: string; location: string; value: number }>;
    offWarrantLatestByPoint: Array<{ region: string; country: string; point: string; value: number }>;
  };
};

function toNum(v: string | undefined) {
  const n = Number((v || '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function parseCsvRows(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i += 1) {
      row[headers[i]] = (cols[i] || '').trim();
    }
    rows.push(row);
  }
  return rows;
}

function pct(curr: number, prev: number): number | null {
  if (!Number.isFinite(curr) || !Number.isFinite(prev) || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function avg(values: number[]): number | null {
  if (!values.length) return null;
  const s = values.reduce((a, b) => a + b, 0);
  return s / values.length;
}

function emptyDashboard(message: string): WarrantDashboardData {
  return {
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
    copperTate: { latest: null, prev: null, diffPct1d: null },
    offWarrant: { latest: null, prev: null, diffPctMoM: null },
    ratio: null,
    alerts: [message],
    charts: { warrantDaily: [], offWarrantMonthly: [], copperTateDaily: [] },
    breakdown: { warrantLatestByLocation: [], offWarrantLatestByPoint: [] }
  };
}

async function readPublishSeries(dataDir: string): Promise<{
  warrantDaily: DayPoint[];
  offWarrantMonthly: MonthPoint[];
  copperTateDaily: DayPoint[];
} | null> {
  try {
    const file = path.join(dataDir, 'selected_series_bundle.json');
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as PublishSeriesBundle;
    const warrantDailyRaw = Array.isArray(parsed?.series?.warrant_copper_daily_t)
      ? parsed.series!.warrant_copper_daily_t
      : [];
    const offRaw = Array.isArray(parsed?.series?.offwarrant_copper_monthly_t)
      ? parsed.series!.offwarrant_copper_monthly_t
      : [];
    const tateRaw = Array.isArray(parsed?.series?.japan_tatene_jpy_t)
      ? parsed.series!.japan_tatene_jpy_t
      : [];
    if (!warrantDailyRaw.length && !offRaw.length && !tateRaw.length) return null;
    const warrantDaily: DayPoint[] = warrantDailyRaw
      .map((p) => ({ date: String(p.date).slice(0, 10), value: Number(p.value) }))
      .filter((p) => p.date && Number.isFinite(p.value))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const offWarrantMonthly: MonthPoint[] = offRaw
      .map((p) => ({ month: String(p.date).slice(0, 7).replace('-', '_'), value: Number(p.value) }))
      .filter((p) => p.month && Number.isFinite(p.value))
      .sort((a, b) => (a.month < b.month ? -1 : 1));
    const copperTateDaily: DayPoint[] = tateRaw
      .map((p) => ({ date: String(p.date).slice(0, 10), value: Number(p.value) }))
      .filter((p) => p.date && Number.isFinite(p.value))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    return { warrantDaily, offWarrantMonthly, copperTateDaily };
  } catch {
    return null;
  }
}

export const getWarrantDashboardData = cache(async (): Promise<WarrantDashboardData> => {
  const dataDir = path.join(process.cwd(), 'public', 'data');
  let files: string[] = [];
  try {
    files = await fs.readdir(dataDir);
  } catch {
    return emptyDashboard('データフォルダが見つかりません（public/data）。');
  }

  const publishSeries = await readPublishSeries(dataDir);

  const warrantFiles = files.filter((f) => /^warrant_\d{4}_\d{2}\.csv$/.test(f)).sort();
  const offFiles = files.filter((f) => /^offwarrant_\d{4}_\d{2}\.csv$/.test(f)).sort();
  const copperPath = path.join(dataDir, "copper_tate_ne_2021_2026.csv");

  let daySeries: DayPoint[] = [];
  let offSeries: MonthPoint[] = [];
  let copperSeries: DayPoint[] = [];

  if (publishSeries) {
    daySeries = publishSeries.warrantDaily;
    offSeries = publishSeries.offWarrantMonthly;
    copperSeries = publishSeries.copperTateDaily;
  } else {
    const dayMap = new Map<string, number>();
    for (const f of warrantFiles) {
      const raw = await fs.readFile(path.join(dataDir, f), 'utf8');
      const rows = parseCsvRows(raw);
      for (const row of rows) {
        if ((row['Metal'] || '').trim() !== 'Copper') continue;
        const d = (row['Date'] || '').slice(0, 10);
        if (!d) continue;
        const prev = dayMap.get(d) || 0;
        dayMap.set(d, prev + toNum(row['Closing Stock']));
      }
    }
    daySeries = Array.from(dayMap.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    offSeries = [];
    for (const f of offFiles) {
      const month = f.replace('offwarrant_', '').replace('.csv', '');
      const raw = await fs.readFile(path.join(dataDir, f), 'utf8');
      const rows = parseCsvRows(raw);
      let total = 0;
      for (const row of rows) total += toNum(row['CU']);
      offSeries.push({ month, value: total });
    }
    offSeries.sort((a, b) => (a.month < b.month ? -1 : 1));

    copperSeries = [];
    try {
      const copperRaw = await fs.readFile(copperPath, "utf8");
      const copperRows = parseCsvRows(copperRaw);
      for (const row of copperRows) {
        const date = (row["date"] || "").slice(0, 10);
        const value = toNum(row["price_jpy_per_ton"]);
        if (!date || !value) continue;
        copperSeries.push({ date, value });
      }
      copperSeries.sort((a, b) => (a.date < b.date ? -1 : 1));
    } catch {
      // Optional dataset.
    }
  }

  const copperLatest = copperSeries[copperSeries.length - 1] || null;
  const copperPrev = copperSeries[copperSeries.length - 2] || null;
  const copperDiffPct1d =
    copperLatest && copperPrev ? pct(copperLatest.value, copperPrev.value) : null;

  const latest = daySeries[daySeries.length - 1] || null;
  const prev = daySeries[daySeries.length - 2] || null;
  const prev7 = daySeries.length >= 8 ? daySeries[daySeries.length - 8] : null;
  const ma20 =
    daySeries.length >= 20 ? avg(daySeries.slice(-20).map((p) => p.value)) : avg(daySeries.map((p) => p.value));

  const offLatest = offSeries[offSeries.length - 1] || null;
  const offPrev = offSeries[offSeries.length - 2] || null;

  const warrantMonthMap = new Map<string, number>();
  for (const p of daySeries) {
    const month = p.date.slice(0, 7).replace('-', '_');
    warrantMonthMap.set(month, p.value);
  }
  const warrantMonthSeries = Array.from(warrantMonthMap.entries())
    .map(([month, value]) => ({ month, value }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));
  const warrantMonthlyLatest = warrantMonthSeries[warrantMonthSeries.length - 1] || null;
  const warrantMonthlyPrev = warrantMonthSeries[warrantMonthSeries.length - 2] || null;
  const ratio =
    latest && offLatest && latest.value + offLatest.value > 0
      ? latest.value / (latest.value + offLatest.value)
      : null;

  const diffPct1d = latest && prev ? pct(latest.value, prev.value) : null;
  const diffPct7d = latest && prev7 ? pct(latest.value, prev7.value) : null;
  const diffPctWarrantMoM =
    warrantMonthlyLatest && warrantMonthlyPrev
      ? pct(warrantMonthlyLatest.value, warrantMonthlyPrev.value)
      : null;
  const diffPctMoM = offLatest && offPrev ? pct(offLatest.value, offPrev.value) : null;

  const alerts: string[] = [];
  if (latest && ma20 && latest.value < ma20) {
    alerts.push('Warrant銅在庫が20日平均を下回りました（需給緩和シグナル）。');
  }
  if (latest && ma20 && latest.value > ma20 * 1.05) {
    alerts.push('Warrant銅在庫が20日平均を5%以上上回りました（需給逼迫シグナル）。');
  }
  if (ratio !== null && ratio < 0.75) {
    alerts.push('Warrant比率が75%を下回っています。off-warrant比重の上昇に注意。');
  }
  if (diffPct7d !== null && Math.abs(diffPct7d) >= 5) {
    alerts.push(`Warrant銅在庫の7日変化が${diffPct7d >= 0 ? '+' : ''}${diffPct7d.toFixed(2)}%です。`);
  }
  if (diffPctMoM !== null && diffPctMoM >= 20) {
    alerts.push(`off-warrant銅在庫が前月比+${diffPctMoM.toFixed(2)}%で増加しました。`);
  }
  if (!alerts.length) alerts.push('重大なアラートはありません。通常監視モードです。');

  const warrantDaily = daySeries.slice(-30);
  const offWarrantMonthly = offSeries.slice(-12);
  const copperTateDaily = copperSeries.slice(-365);

  const warrantLatestByLocation: Array<{ country: string; location: string; value: number }> = [];
  if (warrantFiles.length) {
    const latestWarrantFile = warrantFiles[warrantFiles.length - 1];
    const raw = await fs.readFile(path.join(dataDir, latestWarrantFile), 'utf8');
    const rows = parseCsvRows(raw);
    const byLocation = new Map<string, { country: string; location: string; value: number }>();
    for (const row of rows) {
      if ((row['Metal'] || '').trim() !== 'Copper') continue;
      const country = (row['Country/Region'] || '').trim();
      const location = (row['Location'] || '').trim();
      const key = `${country}__${location}`;
      const prevVal = byLocation.get(key)?.value || 0;
      byLocation.set(key, { country, location, value: prevVal + toNum(row['Closing Stock']) });
    }
    warrantLatestByLocation.push(
      ...Array.from(byLocation.values())
        .filter((x) => x.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 5)
    );
  }

  const offWarrantLatestByPoint: Array<{ region: string; country: string; point: string; value: number }> = [];
  if (offFiles.length) {
    const latestOffFile = offFiles[offFiles.length - 1];
    const raw = await fs.readFile(path.join(dataDir, latestOffFile), 'utf8');
    const rows = parseCsvRows(raw);
    const byPoint = new Map<string, { region: string; country: string; point: string; value: number }>();
    for (const row of rows) {
      const region = (row['REGION'] || '').trim();
      const country = (row['COUNTRY/REGION'] || '').trim();
      const point = (row['DELIVERY POINT'] || '').trim();
      const value = toNum(row['CU']);
      if (!value) continue;
      const key = `${region}__${country}__${point}`;
      const prevVal = byPoint.get(key)?.value || 0;
      byPoint.set(key, { region, country, point, value: prevVal + value });
    }
    offWarrantLatestByPoint.push(
      ...Array.from(byPoint.values())
        .sort((a, b) => b.value - a.value)
        .slice(0, 5)
    );
  }

  return {
    copperTate: {
      latest: copperLatest,
      prev: copperPrev,
      diffPct1d: copperDiffPct1d,
    },
    warrant: {
      latest,
      prev,
      diffPct1d,
      diffPct7d,
      ma20,
      monthlyLatest: warrantMonthlyLatest,
      monthlyPrev: warrantMonthlyPrev,
      diffPctMoM: diffPctWarrantMoM
    },
    offWarrant: { latest: offLatest, prev: offPrev, diffPctMoM },
    ratio,
    alerts,
    charts: { warrantDaily, offWarrantMonthly, copperTateDaily },
    breakdown: { warrantLatestByLocation, offWarrantLatestByPoint }
  };
});
