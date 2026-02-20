import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { getEconomyIndicatorsLive } from '@/lib/economy';

function isAuthorized(req: NextRequest): boolean {
  const token = String(process.env.ECONOMY_SNAPSHOT_API_TOKEN || process.env.MARKET_SNAPSHOT_API_TOKEN || '').trim();
  if (!token) return process.env.NODE_ENV !== 'production';

  const auth = String(req.headers.get('authorization') || '');
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const xToken = String(req.headers.get('x-economy-snapshot-token') || '').trim();
  const matches = (candidate: string): boolean => {
    if (!candidate) return false;
    const a = Buffer.from(candidate);
    const b = Buffer.from(token);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  };
  return matches(bearer) || matches(xToken);
}

async function rebuild(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const bundle = await getEconomyIndicatorsLive();
  return NextResponse.json(
    {
      ok: true,
      updatedAt: bundle.updatedAt,
      cacheBucketJst: bundle.cacheBucketJst || '',
      sourceStatus: bundle.sourceStatus || null,
      counts: { fred: bundle.fred.length, alpha: bundle.alpha.length }
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

