import type { SeriesPoint } from '@/lib/selected_series_bundle';

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

// Chile monthly series occasionally includes annual-total-like January spikes.
// Detect those outliers and convert to monthly equivalent (divide by 12).
export function normalizeChileMiningMonthlySeries(rows: SeriesPoint[]): SeriesPoint[] {
  return rows.map((row, idx) => {
    const month = row.date.slice(5, 7);
    if (month !== '01' || !Number.isFinite(row.value)) return row;

    const neighbors: number[] = [];
    const prev = rows[idx - 1]?.value;
    const next = rows[idx + 1]?.value;
    if (Number.isFinite(prev)) neighbors.push(prev);
    if (Number.isFinite(next)) neighbors.push(next);
    const neighborMedian = median(neighbors);

    const likelyAnnualTotal =
      row.value > 2000 &&
      (neighborMedian === null || (neighborMedian > 0 && row.value > neighborMedian * 4));

    if (!likelyAnnualTotal) return row;
    return { ...row, value: row.value / 12 };
  });
}

