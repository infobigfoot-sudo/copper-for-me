import Link from 'next/link';

import MobileBottomNavClient from '@/components/native/MobileBottomNavClient';
import { OTHER_NAV_LINKS, PRIMARY_NAV_LINKS } from '@/components/native/nav';
import TopTrendChart from '@/components/native/TopTrendChart';
import { normalizeChileMiningMonthlySeries } from '@/lib/mining_normalize';
import { normalizeSeries, readMergedPublishSeriesBundle } from '@/lib/publish_series_bundle';
import { readPredictionSummary } from '@/lib/prediction_summary';

type SeriesPoint = { date: string; value: number };

function fmtNum(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return '-';
  return value.toLocaleString('ja-JP', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function fmtPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function calcChange(curr: number | null, prev: number | null): number | null {
  if (curr === null || prev === null || !Number.isFinite(curr) || !Number.isFinite(prev) || prev === 0) {
    return null;
  }
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function latestPair(rows: SeriesPoint[]): {
  latest: SeriesPoint | null;
  prev: SeriesPoint | null;
} {
  if (!rows.length) return { latest: null, prev: null };
  return {
    latest: rows[rows.length - 1] ?? null,
    prev: rows.length > 1 ? rows[rows.length - 2] : null
  };
}

function formatJstNow(): { date: string; time: string } {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(now);
  return { date, time };
}

function miniBar(values: number[], type: 'up' | 'down') {
  const v = values.length ? values : [0, 0, 0, 0, 0, 0];
  const max = Math.max(...v.map((x) => Math.abs(x))) || 1;
  return v.map((n, i) => {
    const h = Math.max(22, Math.round((Math.abs(n) / max) * 95));
    const cls = i === v.length - 1 ? (type === 'up' ? 'bg-[#0f6d6a]' : 'bg-[#c08a73]') : 'bg-[#e3ddd4]';
    return <div key={i} className={`${cls} flex-1 rounded-sm`} style={{ height: `${h}%` }} />;
  });
}

function barWidthFromPct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return '16%';
  const w = Math.min(100, Math.max(16, Math.abs(pct) * 8));
  return `${w.toFixed(1)}%`;
}

function calmBadgeClass(change: number | null): string {
  if (change === null || !Number.isFinite(change)) {
    return 'text-[#5f6b7a] bg-[#f2eee8] border border-[#ddd5ca]';
  }
  return change >= 0
    ? 'text-[#0f6d6a] bg-[#e8f1ee] border border-[#cfe0da]'
    : 'text-[#b86d53] bg-[#f6ece8] border border-[#e6d1c9]';
}

function impactSupportive(change: number | null, positiveWhenUp: boolean): boolean | null {
  if (change === null || !Number.isFinite(change)) return null;
  return positiveWhenUp ? change >= 0 : change < 0;
}

function impactTextClass(change: number | null, positiveWhenUp: boolean): string {
  const supportive = impactSupportive(change, positiveWhenUp);
  if (supportive === null) return 'text-cool-grey';
  return supportive ? 'text-[#0f6d6a]' : 'text-[#b86d53]';
}

function impactBarClass(change: number | null, positiveWhenUp: boolean): string {
  const supportive = impactSupportive(change, positiveWhenUp);
  if (supportive === null) return 'bg-[#94a3b8]';
  return supportive ? 'bg-[#0f6d6a]' : 'bg-[#b86d53]';
}

function scoreFromPct(pct: number | null): number {
  if (pct === null || !Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, Math.abs(pct)));
}

function monthKey(dateText: string): string {
  return String(dateText || '').slice(0, 7);
}

export default async function TopNativePage() {
  const [bundle, prediction] = await Promise.all([readMergedPublishSeriesBundle(), readPredictionSummary()]);
  const series = bundle?.series || {};
  const lmeCashRows = normalizeSeries(series.lme_copper_cash_usd_t);
  const lme3mRows = normalizeSeries(series.lme_copper_3month_usd_t).map((row) => ({
    ...row,
    value: row.value > 200000 ? row.value / 100 : row.value,
  }));
  const usdjpyRows = normalizeSeries(series.america_dexjpus);
  const usdcnyRows = normalizeSeries(series.america_dexchus);
  const us10yRows = normalizeSeries(series.dgs10);
  const wtiRows = normalizeSeries(series.dcoilwtico);
  const copxRows = normalizeSeries(series.america_copx_close);
  const chileMiningRows = normalizeChileMiningMonthlySeries(
    normalizeSeries(series.supply_chain_mining_chile_mine_output_total_thousand_tmf_cochilco)
  );
  const peruMiningRows = normalizeSeries(series.supply_chain_mining_peru_mine_output_total_tmf_bem).map((row) => ({
    ...row,
    value: row.value / 1000,
  }));
  const refiningInventoryRows = normalizeSeries(series.supply_chain_refining_jp_electric_copper_inventory_qty);
  const tateRows = normalizeSeries(series.japan_tatene_jpy_t);

  const lmeCash = latestPair(lmeCashRows);
  const lme3m = latestPair(lme3mRows);
  const usdjpy = latestPair(usdjpyRows);
  const usdcny = latestPair(usdcnyRows);
  const us10y = latestPair(us10yRows);
  const wti = latestPair(wtiRows);
  const copx = latestPair(copxRows);
  const tate = latestPair(tateRows);

  const lmeCashChg = calcChange(lmeCash.latest?.value ?? null, lmeCash.prev?.value ?? null);
  const lme3mChg = calcChange(lme3m.latest?.value ?? null, lme3m.prev?.value ?? null);
  const usdjpyChg = calcChange(usdjpy.latest?.value ?? null, usdjpy.prev?.value ?? null);
  const usdcnyChg = calcChange(usdcny.latest?.value ?? null, usdcny.prev?.value ?? null);
  const us10yChg = calcChange(us10y.latest?.value ?? null, us10y.prev?.value ?? null);
  const wtiChg = calcChange(wti.latest?.value ?? null, wti.prev?.value ?? null);
  const copxChg = calcChange(copx.latest?.value ?? null, copx.prev?.value ?? null);
  const tateChg = calcChange(tate.latest?.value ?? null, tate.prev?.value ?? null);
  const miningMap = new Map<string, { chile?: number; peru?: number }>();
  for (const row of chileMiningRows) {
    const key = monthKey(row.date);
    miningMap.set(key, { ...(miningMap.get(key) || {}), chile: row.value });
  }
  for (const row of peruMiningRows) {
    const key = monthKey(row.date);
    miningMap.set(key, { ...(miningMap.get(key) || {}), peru: row.value });
  }
  const miningRows = Array.from(miningMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ym, v]) => ({
      ym,
      value:
        Number.isFinite(v.chile as number) && Number.isFinite(v.peru as number)
          ? ((v.chile as number) + (v.peru as number)) / 2
          : Number.isFinite(v.chile as number)
            ? (v.chile as number)
            : (v.peru as number)
    }))
    .filter((r) => Number.isFinite(r.value));
  const miningBase = miningRows.length ? miningRows[0].value : null;
  const miningIndexRows = miningRows.map((r) => ({
    ym: r.ym,
    idx: miningBase && miningBase !== 0 ? (r.value / miningBase) * 100 : 100
  }));
  const miningLatest = miningIndexRows.length ? miningIndexRows[miningIndexRows.length - 1] : null;
  const miningPrev = miningIndexRows.length >= 2 ? miningIndexRows[miningIndexRows.length - 2] : null;
  const miningDeltaPct =
    miningLatest && miningPrev && miningPrev.idx !== 0
      ? ((miningLatest.idx - miningPrev.idx) / Math.abs(miningPrev.idx)) * 100
      : null;
  const miningScore = scoreFromPct(miningDeltaPct);
  const miningUp = miningDeltaPct !== null && miningDeltaPct >= 0;

  const invLatest = refiningInventoryRows.length ? refiningInventoryRows[refiningInventoryRows.length - 1] : null;
  const invLast6 = refiningInventoryRows.slice(-6);
  const invMa6 = invLast6.length ? invLast6.reduce((sum, row) => sum + row.value, 0) / invLast6.length : null;
  const supplyDeltaPct =
    invLatest && invMa6 !== null && invMa6 !== 0 ? ((invLatest.value - invMa6) / Math.abs(invMa6)) * 100 : null;
  const supplyScore = scoreFromPct(supplyDeltaPct);
  const supplyUp = supplyDeltaPct !== null && supplyDeltaPct >= 0;

  const lmeMaeDiffPct =
    prediction?.premiumProxyDevPct !== null && prediction?.premiumProxyDevPct !== undefined
      ? Number(prediction.premiumProxyDevPct) * 100
      : null;
  const lmeMaeScore = scoreFromPct(lmeMaeDiffPct);
  const lmeMaeUp = lmeMaeDiffPct !== null && lmeMaeDiffPct >= 0;
  const upper = prediction?.upper ?? null;
  const lower = prediction?.lower ?? null;
  const jst = formatJstNow();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f7f3ec] via-[#efe7dc] to-[#f9f6f0] text-[#0f172a]">
      <nav className="sticky top-0 z-50 border-b border-[#e6dfd3] bg-[#f3f1ed]/95 backdrop-blur-xl">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
          <div className="flex w-full items-center gap-4">
            <div className="flex flex-col">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-off-white">
                <Link href="/">COPPER FOR ME</Link>
              </h1>
              <span className="text-[9px] uppercase tracking-[0.4em] text-cool-grey font-bold">daily copper learning</span>
            </div>
            <div className="hidden md:flex flex-1 items-center justify-end gap-6 text-xs font-bold uppercase tracking-widest text-cool-grey">
              {PRIMARY_NAV_LINKS.map((item) => (
                <Link
                  key={`top-nav-${item.href}`}
                  href={item.href}
                  className={item.href === '/' ? 'nav-link-active' : 'hover:text-positive transition-all'}
                >
                  {item.label}
                </Link>
              ))}
              <details className="relative group">
                <summary className="list-none cursor-pointer select-none [&::-webkit-details-marker]:hidden hover:text-positive transition-all">
                  その他
                </summary>
                <div className="absolute right-0 top-full mt-3 w-44 rounded-xl border border-[#d9d2c6] bg-[#f9f7f3] p-2 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                  {OTHER_NAV_LINKS.map((item) => (
                    <Link
                      key={`top-other-${item.href}`}
                      href={item.href}
                      className="block rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-cool-grey hover:bg-white/70 hover:text-[#1f3a5f]"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </details>
              <Link
                href="/tatene-calculator"
                className="inline-flex items-center justify-center rounded-lg border border-[#285949] bg-[#2f6d5a] px-4 py-2 text-[10px] font-black tracking-[0.2em] text-white"
              >
                国内建値計算
              </Link>
            </div>
          </div>
        </div>
      </nav>
      <main className="main-unified-14 max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 pb-24 md:pb-4">
        <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,460px)] lg:items-end">
          <div className="max-w-3xl">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 leading-tight text-off-white">
              Copper Insights
            </h2>
            <p className="text-cool-grey text-base sm:text-lg max-w-xl leading-relaxed">
              LME現物・建値・為替等の関連指標を日々の判断に使える形で表示。
            </p>
          </div>
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="glass-card p-4 rounded-xl min-w-0">
              <p className="text-[10px] font-bold text-cool-grey uppercase tracking-tighter mb-1">更新ステータス</p>
              <p className="text-[9px] sm:text-[14px] font-black text-cool-grey uppercase tracking-[0.2em] sm:tracking-[0.3em]">稼働中</p>
              <p className="text-xs text-cool-grey mt-1">最新データを順次反映</p>
            </div>
            <div className="glass-card p-4 rounded-xl min-w-0 text-left sm:text-right">
              <p className="text-[10px] font-bold text-cool-grey uppercase tracking-tighter mb-1">基準時刻</p>
              <p className="text-sm sm:text-xl font-mono font-bold text-off-white tracking-[0.08em] sm:tracking-widest">
                {jst.date} <span className="text-positive">{jst.time}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="glass-card glass-card-hover relative p-4 sm:p-6 rounded-2xl transition-all group">
            <div className={`metric-badge-top-right text-right text-xs sm:text-sm font-bold px-2 sm:px-3 py-1 rounded-full ${calmBadgeClass(tateChg)}`}>{fmtPct(tateChg)}</div>
            <div className="mb-6 pt-7 sm:pt-8 min-h-[3.2rem]">
              <span
                title="国内価格"
                className="block text-[14px] leading-snug font-black text-cool-grey uppercase tracking-[0.2em] break-words overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]"
              >
                国内価格
              </span>
            </div>
            <div className="flex items-baseline gap-4 mb-4 sm:mb-6">
              <h4 className="text-xl sm:text-3xl font-bold tracking-tight text-off-white">{fmtNum(tate.latest?.value ?? null, 0)}</h4>
              <span className="text-cool-grey text-[10px] sm:text-xs font-medium">JPY/mt</span>
            </div>
            <div className="h-12 w-full flex items-end gap-4 opacity-60">{miniBar(tateRows.slice(-7).map((r) => r.value), tateChg !== null && tateChg >= 0 ? 'up' : 'down')}</div>
            <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-cool-grey text-right">{tate.latest?.date || '-'}</p>
          </div>
          <div className="glass-card glass-card-hover relative p-4 sm:p-6 rounded-2xl transition-all group">
            <div className={`metric-badge-top-right text-right text-xs sm:text-sm font-bold px-2 sm:px-3 py-1 rounded-full ${calmBadgeClass(lmeCashChg)}`}>{fmtPct(lmeCashChg)}</div>
            <div className="mb-6 pt-7 sm:pt-8 min-h-[3.2rem]">
              <span
                title="LME銅価格"
                className="block text-[14px] leading-snug font-black text-cool-grey uppercase tracking-[0.2em] break-words overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]"
              >
                LME銅価格
              </span>
            </div>
            <div className="flex items-baseline gap-4 mb-4 sm:mb-6">
              <h4 className="text-xl sm:text-3xl font-bold tracking-tight text-off-white">{fmtNum(lmeCash.latest?.value ?? null, 0)}</h4>
              <span className="text-cool-grey text-[10px] sm:text-xs font-medium">USD/mt</span>
            </div>
            <div className="h-12 w-full flex items-end gap-4 opacity-60">{miniBar(lmeCashRows.slice(-7).map((r) => r.value), lmeCashChg !== null && lmeCashChg >= 0 ? 'up' : 'down')}</div>
            <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-cool-grey text-right">{lmeCash.latest?.date || '-'}</p>
          </div>
          <div className="glass-card glass-card-hover relative p-4 sm:p-6 rounded-2xl transition-all group">
            <div className={`metric-badge-top-right text-right text-xs sm:text-sm font-bold px-2 sm:px-3 py-1 rounded-full ${calmBadgeClass(lme3mChg)}`}>{fmtPct(lme3mChg)}</div>
            <div className="mb-6 pt-7 sm:pt-8 min-h-[3.2rem]">
              <span
                title="LME3ヶ月先物"
                className="block text-[14px] leading-snug font-black text-cool-grey uppercase tracking-[0.2em] break-words overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]"
              >
                LME3ヶ月先物
              </span>
            </div>
            <div className="flex items-baseline gap-4 mb-4 sm:mb-6">
              <h4 className="text-xl sm:text-3xl font-bold tracking-tight text-off-white">{fmtNum(lme3m.latest?.value ?? null, 0)}</h4>
              <span className="text-cool-grey text-[10px] sm:text-xs font-medium">USD/mt</span>
            </div>
            <div className="h-12 w-full flex items-end gap-4 opacity-60">{miniBar(lme3mRows.slice(-7).map((r) => r.value), lme3mChg !== null && lme3mChg >= 0 ? 'up' : 'down')}</div>
            <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-cool-grey text-right">{lme3m.latest?.date || '-'}</p>
          </div>
          <div className="glass-card glass-card-hover relative p-4 sm:p-6 rounded-2xl transition-all group">
            <div className={`metric-badge-top-right text-right text-xs sm:text-sm font-bold px-2 sm:px-3 py-1 rounded-full ${calmBadgeClass(usdjpyChg)}`}>{fmtPct(usdjpyChg)}</div>
            <div className="mb-6 pt-7 sm:pt-8 min-h-[3.2rem]">
              <span
                title="USD/JPY"
                className="block text-[14px] leading-snug font-black text-cool-grey uppercase tracking-[0.2em] break-words overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]"
              >
                USD/JPY
              </span>
            </div>
            <div className="flex items-baseline gap-4 mb-4 sm:mb-6">
              <h4 className="text-xl sm:text-3xl font-bold tracking-tight text-off-white">{fmtNum(usdjpy.latest?.value ?? null, 2)}</h4>
              <span className="text-cool-grey text-[10px] sm:text-xs font-medium">JPY</span>
            </div>
            <div className="h-12 w-full flex items-end gap-4 opacity-60">{miniBar(usdjpyRows.slice(-7).map((r) => r.value), usdjpyChg !== null && usdjpyChg >= 0 ? 'up' : 'down')}</div>
            <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-cool-grey text-right">{usdjpy.latest?.date || '-'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <TopTrendChart rows={tateRows} upper={upper} lower={lower} />
          <div className="rounded-3xl p-8 border border-[#e6dfd3] bg-[#f3f1ed]">
            <h4 className="text-[14px] font-black text-cool-grey uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-6">各種指標</h4>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-xs font-bold uppercase tracking-widest mb-3">
                  <span className="text-cool-grey">USD / CNY</span>
                  <span className={impactTextClass(usdcnyChg, false)}>
                    {fmtPct(usdcnyChg)}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[#e3ddd4] rounded-full overflow-hidden border border-[#d9d2c6]">
                  <div
                    className={`h-full rounded-full ${impactBarClass(usdcnyChg, false)}`}
                    style={{ width: barWidthFromPct(usdcnyChg) }}
                  />
                </div>
                <p className="text-[11px] text-cool-grey mt-3 leading-relaxed italic">
                  人民元が弱含むと、中国の輸入採算や裁定フローが圧迫されやすい。
                </p>
              </div>
              <div>
                <div className="flex justify-between text-xs font-bold uppercase tracking-widest mb-3">
                  <span className="text-cool-grey">US 10Y YIELD</span>
                  <span className={impactTextClass(us10yChg, false)}>
                    {fmtPct(us10yChg)}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[#e3ddd4] rounded-full overflow-hidden border border-[#d9d2c6]">
                  <div
                    className={`h-full rounded-full ${impactBarClass(us10yChg, false)}`}
                    style={{ width: barWidthFromPct(us10yChg) }}
                  />
                </div>
                <p className="text-[11px] text-cool-grey mt-3 leading-relaxed italic">
                  金利の変動は、世界のインフラ投資や設備投資マインドに直結しやすい。
                </p>
              </div>
              <div>
                <div className="flex justify-between text-xs font-bold uppercase tracking-widest mb-3">
                  <span className="text-cool-grey">WTI</span>
                  <span className={impactTextClass(wtiChg, true)}>
                    {fmtPct(wtiChg)}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[#e3ddd4] rounded-full overflow-hidden border border-[#d9d2c6]">
                  <div
                    className={`h-full rounded-full ${impactBarClass(wtiChg, true)}`}
                    style={{ width: barWidthFromPct(wtiChg) }}
                  />
                </div>
                <p className="text-[11px] text-cool-grey mt-3 leading-relaxed italic">
                  エネルギーコストの変化は、銅の生産採算や供給圧力に波及しやすい。
                </p>
              </div>
              <div>
                <div className="flex justify-between text-xs font-bold uppercase tracking-widest mb-3">
                  <span className="text-cool-grey">COPX</span>
                  <span className={impactTextClass(copxChg, true)}>
                    {fmtPct(copxChg)}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[#e3ddd4] rounded-full overflow-hidden border border-[#d9d2c6]">
                  <div
                    className={`h-full rounded-full ${impactBarClass(copxChg, true)}`}
                    style={{ width: barWidthFromPct(copxChg) }}
                  />
                </div>
                <p className="text-[11px] text-cool-grey mt-3 leading-relaxed italic">
                  銅関連株のモメンタムは、非鉄市場全体のリスク選好を先行して示すことがある。
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              title: '鉱山指数',
              score: miningScore,
              scoreText: miningDeltaPct === null ? '-' : `${Math.abs(miningDeltaPct).toFixed(0)}%`,
              label: miningDeltaPct === null ? 'データなし' : miningUp ? '採掘量UP' : '採掘量DOWN',
              tone:
                miningDeltaPct === null
                  ? 'text-[#94a3b8]'
                  : miningUp
                    ? 'text-[#b86d53]'
                    : 'text-[#0f6d6a]',
              toneLabel:
                miningDeltaPct === null
                  ? 'text-[#94a3b8]'
                  : miningUp
                    ? 'text-[#b86d53]'
                    : 'text-[#0f6d6a]'
            },
            {
              title: '需給スピード',
              score: supplyScore,
              scoreText: supplyDeltaPct === null ? '-' : `${Math.abs(supplyDeltaPct).toFixed(0)}%`,
              label: supplyDeltaPct === null ? 'データなし' : supplyUp ? '上昇' : '低下',
              tone: 'text-[#b86d53]',
              toneLabel: 'text-[#b86d53]'
            },
            {
              title: 'LME MAE差',
              score: lmeMaeScore,
              scoreText: lmeMaeDiffPct === null ? '-' : `${Math.abs(lmeMaeDiffPct).toFixed(0)}%`,
              label: lmeMaeDiffPct === null ? 'データなし' : lmeMaeUp ? '上昇' : '低下',
              tone: 'text-[#1b4f63]',
              toneLabel: 'text-[#1b4f63]'
            }
          ].map((g) => {
            const r = 58;
            const c = 2 * Math.PI * r;
            const dashOffset = c * (1 - g.score / 100);
            return (
              <div key={g.title} className="glass-card p-4 sm:p-8 rounded-3xl flex flex-col items-center border border-[#e6dfd3]">
                <h5 className="text-[14px] font-black text-cool-grey uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-6">{g.title}</h5>
                <div className="relative w-28 h-28 sm:w-40 sm:h-40 flex items-center justify-center rounded-full border-2 sm:border-4 border-[#ece7df]">
                  <svg className="w-24 h-24 sm:w-32 sm:h-32 -rotate-90" viewBox="0 0 128 128">
                    <circle className="text-[#dbd6cf]" cx="64" cy="64" fill="transparent" r={r} stroke="currentColor" strokeWidth="12" />
                    <circle
                      className={g.tone}
                      cx="64"
                      cy="64"
                      fill="transparent"
                      r={r}
                      stroke="currentColor"
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray={c.toFixed(1)}
                      strokeDashoffset={dashOffset.toFixed(1)}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl sm:text-3xl font-black text-off-white">{g.scoreText}</span>
                    <span className={`text-[8px] sm:text-[9px] font-black uppercase tracking-[0.12em] sm:tracking-widest mt-1 ${g.toneLabel}`}>
                      {g.label}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="glass-card p-4 sm:p-8 rounded-3xl flex flex-col justify-center items-center text-center border border-[#e6dfd3]">
            <h5 className="text-[14px] font-black text-cool-grey uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-6">QUICK TOOLS</h5>
            <p className="text-cool-grey text-[10px] sm:text-[11px] font-medium mb-6 leading-relaxed">
              プレミアム計算とスクラップ換算を、リアルタイムで素早く確認できます。
            </p>
            <a
              href="/tatene-calculator"
              className="w-full bg-[#2f6d5a] border border-[#285949] text-white py-3 sm:py-4 rounded-xl text-[10px] sm:text-xs font-black tracking-[0.12em] sm:tracking-widest text-center"
            >
              国内建値計算
            </a>
            <div className="mt-6 text-[9px] sm:text-[14px] font-bold text-cool-grey tracking-wide">
              参照元:
              {' '}
              <a className="hover:text-off-white underline underline-offset-2" href="https://www.lme.com/" target="_blank" rel="noreferrer">LME</a>
              {' / '}
              <a className="hover:text-off-white underline underline-offset-2" href="https://fred.stlouisfed.org/" target="_blank" rel="noreferrer">FRED</a>
              {' / '}
              <a className="hover:text-off-white underline underline-offset-2" href="https://www.alphavantage.co/" target="_blank" rel="noreferrer">Alpha Vantage</a>
              {' / '}
              <a className="hover:text-off-white underline underline-offset-2" href="https://www.jx-nmm.com/cuprice/" target="_blank" rel="noreferrer">JX金属</a>
            </div>
          </div>
        </div>
      </main>
      <footer className="bg-[#f3f1ed] border-t border-[#e6dfd3] pt-4 pb-24 md:pb-4">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-16 mb-4">
            <div className="col-span-1 md:col-span-2">
              <div className="flex flex-col mb-8">
                <h1 className="text-3xl font-black tracking-tight text-off-white">銅分析 COPPER FOR ME</h1>
              </div>
              <p className="text-cool-grey text-sm max-w-md leading-relaxed">
                非鉄金属業界向けに、高精度の市場データと予測分析を提供します。世界中の取引所と独自のインデックスから集約されています。
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 md:col-span-3">
              <div>
                <h6 className="text-[10px] font-black text-off-white uppercase tracking-[0.3em] mb-10">Market</h6>
                <ul className="space-y-5 text-xs font-bold text-cool-grey uppercase tracking-widest">
                  <li><Link className="hover:text-positive transition-colors" href="/">概要</Link></li>
                  <li><Link className="hover:text-positive transition-colors" href="/lme">LME</Link></li>
                  <li><Link className="hover:text-positive transition-colors" href="/tatene">建値</Link></li>
                  <li><Link className="hover:text-positive transition-colors" href="/indicators">指標</Link></li>
                </ul>
              </div>
              <div>
                <h6 className="text-[10px] font-black text-off-white uppercase tracking-[0.3em] mb-10">Analytics</h6>
                <ul className="space-y-5 text-xs font-bold text-cool-grey uppercase tracking-widest">
                  <li><Link className="hover:text-positive transition-colors" href="/supply-chain">供給と需要</Link></li>
                  <li><Link className="hover:text-positive transition-colors" href="/prediction">予測</Link></li>
                  <li><Link className="hover:text-positive transition-colors" href="/article">記事</Link></li>
                  <li><Link className="hover:text-positive transition-colors" href="/tatene-calculator">建値計算</Link></li>
                </ul>
              </div>
              <div>
                <h6 className="text-[10px] font-black text-off-white uppercase tracking-[0.3em] mb-10">Information</h6>
                <ul className="space-y-5 text-xs font-bold text-cool-grey uppercase tracking-widest">
                  <li><a className="hover:text-positive transition-colors" href="#">参照元</a></li>
                  <li><Link className="hover:text-positive transition-colors" href="/blog/privacypolicy">プライバシーポリシーについて</Link></li>
                  <li><Link className="hover:text-positive transition-colors" href="/blog/disclaimer">免責事項</Link></li>
                  <li><Link className="hover:text-positive transition-colors" href="/category/about">このサイトについて</Link></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="pt-10 border-t border-[#e6dfd3] text-center">
            <p className="text-cool-grey text-sm mb-3">本サイトは公開データ/APIをもとに情報を掲載しています。できるだけ最新化していますが、反映に時間差が出る場合があります</p>
            <p className="text-[10px] text-cool-grey/60 font-black uppercase tracking-[0.2em]">© 2026 Copper for me. All Rights Reserved.</p>
          </div>
        </div>
      </footer>
      <MobileBottomNavClient />
    </div>
  );
}
