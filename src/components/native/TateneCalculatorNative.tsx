'use client';

import { useMemo, useState } from 'react';

type PresetPoint = {
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

type Props = {
  lmeOptions: PresetPoint[];
  fxOptions: PresetPoint[];
  latestPremium: PresetPoint | null;
  latestTatene: PresetPoint | null;
};

export default function TateneCalculatorNative({
  lmeOptions,
  fxOptions,
  latestPremium,
  latestTatene,
}: Props) {
  const [lmeMode, setLmeMode] = useState<'preset' | 'manual'>('preset');
  const [fxMode, setFxMode] = useState<'preset' | 'manual'>('preset');
  const [premiumMode, setPremiumMode] = useState<'latest' | 'manual'>('latest');
  const [selectedLme, setSelectedLme] = useState('0');
  const [selectedFx, setSelectedFx] = useState('0');
  const [lmeManual, setLmeManual] = useState(lmeOptions[0] ? String(lmeOptions[0].value) : '');
  const [fxManual, setFxManual] = useState(fxOptions[0] ? String(fxOptions[0].value) : '');
  const [premiumManual, setPremiumManual] = useState(latestPremium ? String(Math.round(latestPremium.value)) : '');

  const lmeValue = useMemo(() => {
    if (lmeMode === 'preset') {
      const picked = lmeOptions[Number(selectedLme)];
      return picked?.value ?? lmeOptions[0]?.value ?? null;
    }
    const parsed = Number(lmeManual);
    return Number.isFinite(parsed) ? parsed : null;
  }, [lmeMode, selectedLme, lmeOptions, lmeManual]);

  const fxValue = useMemo(() => {
    if (fxMode === 'preset') {
      const picked = fxOptions[Number(selectedFx)];
      return picked?.value ?? fxOptions[0]?.value ?? null;
    }
    const parsed = Number(fxManual);
    return Number.isFinite(parsed) ? parsed : null;
  }, [fxMode, selectedFx, fxOptions, fxManual]);

  const premiumValue = useMemo(() => {
    if (premiumMode === 'latest') return latestPremium?.value ?? null;
    const parsed = Number(premiumManual);
    return Number.isFinite(parsed) ? parsed : null;
  }, [premiumMode, latestPremium, premiumManual]);

  const modelValue = lmeValue !== null && fxValue !== null ? lmeValue * fxValue : null;
  const resultValue = modelValue !== null && premiumValue !== null ? modelValue + premiumValue : null;
  const lmePicked = lmeOptions[Number(selectedLme)] ?? lmeOptions[0] ?? null;
  const fxPicked = fxOptions[Number(selectedFx)] ?? fxOptions[0] ?? null;

  const modeBtn = (active: boolean) =>
    `px-3 py-1.5 text-[11px] font-bold transition-colors ${
      active ? 'bg-positive/20 text-positive' : 'text-cool-grey hover:text-off-white'
    }`;

  return (
    <div className="w-full">
      <article className="w-full rounded-[24px] border border-[#e6dfd3] bg-[#faf8f4] p-4 sm:p-6 shadow-[0_16px_28px_rgba(15,23,42,0.06)]">
        <p className="text-xs sm:text-sm font-bold text-cool-grey">
          国内建値 ≒ LME銅価格（USD/mt） × USD/JPY + 諸コスト・プレミアム
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <section className="h-full rounded-2xl border border-[#e8e3da] bg-[#f3f0ea] p-3.5 sm:p-4">
            <h4 className="text-[14px] font-black text-cool-grey tracking-[0.04em]">LME銅価格（USD/mt）</h4>
            <div className="mt-2 inline-flex rounded-lg border border-[#d6dce5] overflow-hidden bg-white/60">
              <button type="button" className={modeBtn(lmeMode === 'preset')} onClick={() => setLmeMode('preset')}>直近7件から選択</button>
              <button type="button" className={modeBtn(lmeMode === 'manual')} onClick={() => setLmeMode('manual')}>手入力</button>
            </div>
            <div className="relative mt-2.5">
              {lmeMode === 'preset' ? (
                <select
                  value={selectedLme}
                  onChange={(e) => setSelectedLme(e.target.value)}
                  className="w-full rounded-xl border border-[#d8d2c8] bg-white px-4 py-3 text-lg sm:text-xl text-off-white font-semibold"
                >
                  {lmeOptions.map((row, idx) => (
                    <option key={`lme-opt-${row.date}-${idx}`} value={idx}>
                      {`${fmtNum(row.value, 0)} (${row.date})`}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={lmeManual}
                  onChange={(e) => setLmeManual(e.target.value)}
                  className="w-full rounded-xl border border-[#d8d2c8] bg-white px-4 py-3 text-lg sm:text-xl text-off-white font-semibold"
                  inputMode="decimal"
                  placeholder="例: 13171"
                />
              )}
              <span className="pointer-events-none absolute bottom-2 right-3 text-[10px] font-black uppercase tracking-[0.08em] text-[#99a0ac]">USD</span>
            </div>
            {lmeMode === 'preset' && lmePicked ? (
              <p className="mt-1 text-[10px] font-bold tracking-[0.08em] text-[#7b8697]">
                日付: {lmePicked.date}
              </p>
            ) : null}
          </section>

          <section className="h-full rounded-2xl border border-[#e8e3da] bg-[#f3f0ea] p-3.5 sm:p-4">
            <h4 className="text-[14px] font-black text-cool-grey tracking-[0.04em]">USD / JPY</h4>
            <div className="mt-2 inline-flex rounded-lg border border-[#d6dce5] overflow-hidden bg-white/60">
              <button type="button" className={modeBtn(fxMode === 'preset')} onClick={() => setFxMode('preset')}>直近7件から選択</button>
              <button type="button" className={modeBtn(fxMode === 'manual')} onClick={() => setFxMode('manual')}>手入力</button>
            </div>
            <div className="relative mt-2.5">
              {fxMode === 'preset' ? (
                <select
                  value={selectedFx}
                  onChange={(e) => setSelectedFx(e.target.value)}
                  className="w-full rounded-xl border border-[#d8d2c8] bg-white px-4 py-3 text-lg sm:text-xl text-off-white font-semibold"
                >
                  {fxOptions.map((row, idx) => (
                    <option key={`fx-opt-${row.date}-${idx}`} value={idx}>
                      {`${fmtNum(row.value, 2)} (${row.date})`}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={fxManual}
                  onChange={(e) => setFxManual(e.target.value)}
                  className="w-full rounded-xl border border-[#d8d2c8] bg-white px-4 py-3 text-lg sm:text-xl text-off-white font-semibold"
                  inputMode="decimal"
                  placeholder="例: 157.03"
                />
              )}
            </div>
            {fxMode === 'preset' && fxPicked ? (
              <p className="mt-1 text-[10px] font-bold tracking-[0.08em] text-[#7b8697]">
                日付: {fxPicked.date}
              </p>
            ) : null}
          </section>

          <section className="h-full rounded-2xl border border-[#e8e3da] bg-[#f3f0ea] p-3.5 sm:p-4">
            <h4 className="text-[14px] font-black text-cool-grey tracking-[0.04em]">諸コスト・プレミアム（円/mt）</h4>
            <div className="mt-2 inline-flex rounded-lg border border-[#d6dce5] overflow-hidden bg-white/60">
              <button type="button" className={modeBtn(premiumMode === 'latest')} onClick={() => setPremiumMode('latest')}>最新差分を使用</button>
              <button type="button" className={modeBtn(premiumMode === 'manual')} onClick={() => setPremiumMode('manual')}>手入力</button>
            </div>
            <div className="relative mt-2.5">
              {premiumMode === 'latest' ? (
                <div className="rounded-xl border border-[#d8d2c8] bg-white px-4 py-3">
                  <p className="text-xl sm:text-2xl font-semibold text-off-white">
                    {fmtNum(latestPremium?.value ?? null, 0)}
                  </p>
                </div>
              ) : (
                <input
                  value={premiumManual}
                  onChange={(e) => setPremiumManual(e.target.value)}
                  className="w-full rounded-xl border border-[#d8d2c8] bg-white px-4 py-3 text-lg sm:text-xl text-off-white font-semibold"
                  inputMode="numeric"
                  placeholder="例: 80978"
                />
              )}
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
              <span className="ml-2 text-lg sm:text-xl font-bold text-[#c9dfd9]">JPY/mt</span>
            </p>
            <div className="mt-2.5 border-t border-white/15 pt-2 grid gap-1 text-[10px] text-[#c2d8d1]">
              <p>・ 既定値: {modelValue === null ? '-' : fmtNum(Math.round(modelValue), 0)}</p>
              <p>・ 最新差分: {premiumValue === null ? '-' : fmtNum(Math.round(premiumValue), 0)}</p>
              <p>・ 最新国内建値: {latestTatene ? fmtNum(latestTatene.value, 0) : '-'} JPY/mt</p>
            </div>
          </section>
        </div>
      </article>
    </div>
  );
}
