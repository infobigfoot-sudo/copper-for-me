export type DatedPoint = {
  date: string;
  value: number;
};

export function valueAtOrBefore(rows: DatedPoint[], date: string): number | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].date <= date) return rows[i].value;
  }
  return null;
}

export function toJpyKgFromJpyMt(value: number): number {
  return value / 1000;
}

export function toJpyKgFromUsdMt(usdPerMt: number, usdJpy: number): number {
  return (usdPerMt * usdJpy) / 1000;
}

export function convertJpyMtSeriesToJpyKg<T extends DatedPoint>(rows: T[]): T[] {
  return rows.map((row) => ({
    ...row,
    value: toJpyKgFromJpyMt(row.value),
  }));
}

export function convertUsdMtSeriesToJpyKg<T extends DatedPoint>(
  usdMtRows: T[],
  usdJpyRows: DatedPoint[]
): T[] {
  return usdMtRows
    .map((row) => {
      const usdJpy = valueAtOrBefore(usdJpyRows, row.date);
      if (usdJpy === null || !Number.isFinite(usdJpy)) return null;
      return {
        ...row,
        value: toJpyKgFromUsdMt(row.value, usdJpy),
      };
    })
    .filter((row): row is T => row !== null);
}
