import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

import { getEconomyIndicatorsCsvFirst, getEconomyIndicatorsLive } from '@/lib/economy';
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
  const mode = String(req.nextUrl.searchParams.get('mode') || 'live').trim().toLowerCase();
  const date = String(req.nextUrl.searchParams.get('date') || '').trim();
  const fredFallbackRaw = String(req.nextUrl.searchParams.get('fredFallback') || '1').trim().toLowerCase();
  const fredFallback = !['0', 'false', 'off', 'no'].includes(fredFallbackRaw);

  const bundle =
    mode === 'csv'
      ? await getEconomyIndicatorsCsvFirst({ date: date || undefined, fredFallback })
      : await getEconomyIndicatorsLive({ force: true });
  const persisted = await upsertEconomySnapshotToMicrocms(bundle);
  if (persisted?.ok) {
    try {
      revalidatePath('/');
      revalidatePath('/a');
    } catch {
      // Ignore revalidate failure and still return rebuild result.
    }
  }
  return NextResponse.json(
    {
      ok: true,
      mode,
      requestedDate: date || null,
      updatedAt: bundle.updatedAt,
      cacheBucketJst: bundle.cacheBucketJst || '',
      sourceStatus: bundle.sourceStatus || null,
      counts: { fred: bundle.fred.length, alpha: bundle.alpha.length },
      csvStats: (bundle as any).__csvStats || null,
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
