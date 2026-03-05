import { promises as fs } from 'fs';
import path from 'path';

type PredictionSummaryJson = {
  generated_at?: string;
  latest?: {
    date?: string | null;
    adopted_value_jpy_mt?: number | null;
    adopted_lower_jpy_mt?: number | null;
    adopted_upper_jpy_mt?: number | null;
    reference_value_jpy_mt?: number | null;
    warning_reason?: string | null;
    premium_proxy_dev_pct?: number | null;
    usdjpy_pred_naive?: number | null;
    usdjpy_pred_xgboost?: number | null;
  };
};

const DATA_DIR = path.join(process.cwd(), 'public', 'data');
const FILE = process.env.PUBLISH_PREDICTION_SUMMARY_FILE || path.join(DATA_DIR, 'prediction_summary.json');

export type PredictionSummary = {
  date: string | null;
  adopted: number | null;
  lower: number | null;
  upper: number | null;
  reference: number | null;
  warningReason: string | null;
  premiumProxyDevPct: number | null;
  usdjpyPredNaive: number | null;
  usdjpyPredXgboost: number | null;
};

export async function readPredictionSummary(): Promise<PredictionSummary | null> {
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    const parsed = JSON.parse(raw) as PredictionSummaryJson;
    const latest = parsed?.latest;
    if (!latest) return null;
    const toNum = (v: unknown): number | null => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    return {
      date: latest.date ? String(latest.date) : null,
      adopted: toNum(latest.adopted_value_jpy_mt),
      lower: toNum(latest.adopted_lower_jpy_mt),
      upper: toNum(latest.adopted_upper_jpy_mt),
      reference: toNum(latest.reference_value_jpy_mt),
      warningReason: latest.warning_reason ? String(latest.warning_reason) : null,
      premiumProxyDevPct: toNum(latest.premium_proxy_dev_pct),
      usdjpyPredNaive: toNum(latest.usdjpy_pred_naive),
      usdjpyPredXgboost: toNum(latest.usdjpy_pred_xgboost)
    };
  } catch {
    return null;
  }
}
