export function formatDateLabel(value?: string | null): string {
  if (!value) return '-';
  const raw = String(value).trim();
  if (!raw) return '-';
  const normalized = raw.replace(/\//g, '-').replace(/_/g, '-');

  const ymd = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\b|T)/);
  if (ymd) {
    const y = ymd[1];
    const m = ymd[2].padStart(2, '0');
    const d = ymd[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const ym = normalized.match(/^(\d{4})-(\d{1,2})$/);
  if (ym) {
    const y = ym[1];
    const m = ym[2].padStart(2, '0');
    return `${y}-${m}`;
  }

  const compactYmd = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactYmd) return `${compactYmd[1]}-${compactYmd[2]}-${compactYmd[3]}`;

  const compactYm = normalized.match(/^(\d{4})(\d{2})$/);
  if (compactYm) return `${compactYm[1]}-${compactYm[2]}`;

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return raw;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatMonthLabel(value?: string | null): string {
  const formatted = formatDateLabel(value);
  if (formatted === '-' || !formatted) return '-';
  const m = formatted.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : formatted;
}
