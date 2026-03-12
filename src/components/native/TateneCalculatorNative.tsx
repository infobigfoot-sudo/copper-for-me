'use client';

import { useMemo, useState } from 'react';

type Point = {
  date: string;
  value: number;
};

function fmtNum(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return '-';
  return value.toLocaleString('ja-JP', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function parseInputNumber(raw: string): number | null {
  const normalized = raw.replace(/[,\uFF0C\s]/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

type Props = {
  latestLme: Point | null;
  latestFx: Point | null;
  latestPremium: Point | null;
  latestTatene: Point | null;
};

export default function TateneCalculatorNative({
  latestLme,
  latestFx,
  latestPremium,
  latestTatene,
}: Props) {
  const [lmeManual, setLmeManual] = useState('');
  const [fxManual, setFxManual] = useState('');
  const [premiumManual, setPremiumManual] = useState('');

  const lmeValue = useMemo(() => parseInputNumber(lmeManual), [lmeManual]);
  const fxValue = useMemo(() => parseInputNumber(fxManual), [fxManual]);
  const premiumValue = useMemo(() => parseInputNumber(premiumManual), [premiumManual]);

  const modelValue = lmeValue !== null && fxValue !== null ? (lmeValue * fxValue) / 1000 : null;
  const resultValue = modelValue !== null && premiumValue !== null ? modelValue + premiumValue : null;
  return (
    <div className="w-full">
      <article className="w-full rounded-[24px] border border-[#e6dfd3] bg-[#faf8f4] p-4 sm:p-6 shadow-[0_16px_28px_rgba(15,23,42,0.06)]">
        <p className="text-xs sm:text-sm font-bold text-cool-grey">
          国内建値（JPY/kg） ≒ LME銅価格（USD/mt） × USD/JPY ÷ 1000 + 諸コスト・プレミアム（JPY/kg）
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <section className="h-full rounded-2xl border border-[#e8e3da] bg-[#f3f0ea] p-3.5 sm:p-4">
            <h4 className="text-[14px] font-black text-cool-grey tracking-[0.04em]">LME銅価格（USD/mt）</h4>
            <div className="relative mt-2.5">
              <input
                value={lmeManual}
                onChange={(e) => setLmeManual(e.target.value)}
                className="w-full rounded-xl border border-[#d8d2c8] bg-white px-4 py-3 text-lg sm:text-xl text-off-white font-semibold"
                inputMode="decimal"
              />
              <span className="pointer-events-none absolute bottom-2 right-3 text-[10px] font-black uppercase tracking-[0.08em] text-[#99a0ac]">USD</span>
            </div>
          </section>

          <section className="h-full rounded-2xl border border-[#e8e3da] bg-[#f3f0ea] p-3.5 sm:p-4">
            <h4 className="text-[14px] font-black text-cool-grey tracking-[0.04em]">USD / JPY</h4>
            <div className="relative mt-2.5">
              <input
                value={fxManual}
                onChange={(e) => setFxManual(e.target.value)}
                className="w-full rounded-xl border border-[#d8d2c8] bg-white px-4 py-3 text-lg sm:text-xl text-off-white font-semibold"
                inputMode="decimal"
              />
              <span className="pointer-events-none absolute bottom-2 right-3 text-[10px] font-black uppercase tracking-[0.08em] text-[#99a0ac]">JPY</span>
            </div>
          </section>

          <section className="h-full rounded-2xl border border-[#e8e3da] bg-[#f3f0ea] p-3.5 sm:p-4">
            <h4 className="text-[14px] font-black text-cool-grey tracking-[0.04em]">諸コスト・プレミアム（円/kg）</h4>
            <div className="relative mt-2.5">
              <input
                value={premiumManual}
                onChange={(e) => setPremiumManual(e.target.value)}
                className="w-full rounded-xl border border-[#d8d2c8] bg-white px-4 py-3 text-lg sm:text-xl text-off-white font-semibold"
                inputMode="numeric"
              />
              <span className="pointer-events-none absolute bottom-2 right-3 text-[10px] font-black uppercase tracking-[0.08em] text-[#99a0ac]">JPY</span>
            </div>
          </section>

          <section className="h-full rounded-2xl border border-[#285949] bg-[#2f6d5a] px-4 py-3.5 sm:py-4 text-white shadow-[0_16px_24px_rgba(11,51,45,0.24)]">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#b8ded5]">計算結果（概算）</p>
              <span className="text-[10px] font-bold tracking-[0.08em] text-white/60">LIVE</span>
            </div>
            <p className="mt-2 leading-none">
              <span className="text-3xl sm:text-4xl font-black tracking-tight">
                {resultValue === null ? '-' : fmtNum(Math.round(resultValue), 0)}
              </span>
              <span className="ml-2 text-lg sm:text-xl font-bold text-[#c9dfd9]">JPY/kg</span>
            </p>
            <div className="mt-2.5 border-t border-white/15 pt-2 grid gap-1 text-[10px] text-[#c2d8d1]">
              <p>・ LME×為替: {modelValue === null ? '-' : fmtNum(Math.round(modelValue), 0)} JPY/kg</p>
              <p>・ 入力プレミアム: {premiumValue === null ? '-' : fmtNum(Math.round(premiumValue), 0)} JPY/kg</p>
              <p>・ 最新国内建値: {latestTatene ? fmtNum(latestTatene.value, 0) : '-'} JPY/kg</p>
            </div>
          </section>
        </div>
      </article>
    </div>
  );
}
