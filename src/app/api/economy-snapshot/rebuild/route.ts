import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { getEconomyIndicatorsLive } from '@/lib/economy';
import { upsertEconomySnapshotToMicrocms } from '@/lib/microcms_snapshot';

function isAuthorized(req: NextRequest): boolean {
  const tokens = [
    process.env.ECONOMY_SNAPSHOT_API_TOKEN,
    process.env.MARKET_SNAPSHOT_API_TOKEN,
    process.env.CRON_SECRET
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  if (!tokens.length) return process.env.NODE_ENV !== 'production';

  const auth = String(req.headers.get('authorization') || '');
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const xToken = String(req.headers.get('x-economy-snapshot-token') || '').trim();
  const matches = (candidate: string, token: string): boolean => {
    if (!candidate) return false;
    const a = Buffer.from(candidate);
    const b = Buffer.from(token);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  };
  return tokens.some((t) => matches(bearer, t) || matches(xToken, t));
}

async function rebuild(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const bundle = await getEconomyIndicatorsLive({ force: true });
  const persisted = await upsertEconomySnapshotToMicrocms(bundle);
  return NextResponse.json(
    {
      ok: true,
      updatedAt: bundle.updatedAt,
      cacheBucketJst: bundle.cacheBucketJst || '',
      sourceStatus: bundle.sourceStatus || null,
      counts: { fred: bundle.fred.length, alpha: bundle.alpha.length },
      persisted
    },
    { status: 200 }
  );
}

export async function GET(req: NextRequest) {
  return rebuild(req);
}

export async function POST(req: NextRequest) {
  return rebuild(req);
}
