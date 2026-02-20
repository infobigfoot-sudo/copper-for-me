import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

import { getEconomyIndicators } from '@/lib/economy';
import { getWarrantDashboardData } from '@/lib/warrant_dashboard';

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

function pick(indicators: Indicator[], id: string): Indicator | null {
  return indicators.find((i) => i.id === id) || null;
}

function isAuthorized(req: NextRequest): boolean {
  const token = String(process.env.MARKET_SNAPSHOT_API_TOKEN || '').trim();
  if (!token) {
    return process.env.NODE_ENV !== 'production';
  }
  const auth = String(req.headers.get('authorization') || '');
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const xToken = String(req.headers.get('x-market-snapshot-token') || '').trim();
  const matches = (candidate: string): boolean => {
    if (!candidate) return false;
    const a = Buffer.from(candidate);
    const b = Buffer.from(token);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  };
  return matches(bearer) || matches(xToken);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const [economy, warrant] = await Promise.all([
    getEconomyIndicators(),
    getWarrantDashboardData(),
  ]);
  const all = [...(economy.fred || []), ...(economy.alpha || [])] as Indicator[];

  const payload = {
    ok: true,
    generatedAt: new Date().toISOString(),
    cacheUpdatedAt: economy.updatedAt,
    cacheBucketJst: economy.cacheBucketJst || economy.cacheDateJst || '',
    core: {
      lme: pick(all, 'lme_copper_jpy'),
      usdJpy: pick(all, 'usd_jpy'),
      warrantDaily: {
        latest: warrant.warrant.latest,
        prev: warrant.warrant.prev,
        diffPct1d: warrant.warrant.diffPct1d,
        diffPct7d: warrant.warrant.diffPct7d,
      },
      domesticTate: {
        latest: warrant.copperTate.latest,
        prev: warrant.copperTate.prev,
        diffPct: warrant.copperTate.diffPct1d,
      },
    },
    weekly: {
      offWarrantMonthly: {
        latest: warrant.offWarrant.latest,
        prev: warrant.offWarrant.prev,
        diffPctMoM: warrant.offWarrant.diffPctMoM,
      },
      warrantRatio: warrant.ratio,
      copx: pick(all, 'copx'),
      fcx: pick(all, 'fcx'),
      usdCny: pick(all, 'usd_cny'),
    },
    support: {
      dgs10: pick(all, 'DGS10'),
      vix: pick(all, 'VIXCLS'),
      dxy: pick(all, 'DTWEXBGS'),
      wti: pick(all, 'DCOILWTICO'),
      brent: pick(all, 'DCOILBRENTEU'),
      gas: pick(all, 'GASREGCOVW'),
      ipman: pick(all, 'IPMAN'),
      dgorder: pick(all, 'DGORDER'),
      tcu: pick(all, 'TCU'),
      tlrescons: pick(all, 'TLRESCONS'),
      houst: pick(all, 'HOUST'),
      permit: pick(all, 'PERMIT'),
      gdp: pick(all, 'GDP'),
      cpi: pick(all, 'CPIAUCSL'),
      ppi: pick(all, 'PPIACO'),
      chile: pick(all, 'CHLPROINDMISMEI'),
      peru: pick(all, 'PERPROINDMISMEI'),
      spy: pick(all, 'sp500'),
    },
  };

  return NextResponse.json(payload, { status: 200 });
}
