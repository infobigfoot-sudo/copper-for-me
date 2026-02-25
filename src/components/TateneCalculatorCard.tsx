'use client';

import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';

type CalcOption = {
  date: string;
  value: number;
};

type Props = {
  lmeOptions: CalcOption[];
  usdJpyOptions: CalcOption[];
  defaultLme?: number | null;
  defaultUsdJpy?: number | null;
  defaultPremium?: number | null;
};

function fmtNum(value: number, maxFractionDigits = 3) {
  return value.toLocaleString('ja-JP', { maximumFractionDigits: maxFractionDigits });
}

function fmtYmd(value?: string) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseInputNum(text: string): number | null {
  if (!text.trim()) return null;
  const v = Number(text.replace(/,/g, '').trim());
  return Number.isFinite(v) ? v : null;
}

export default function TateneCalculatorCard({
  lmeOptions,
  usdJpyOptions,
  defaultLme,
  defaultUsdJpy,
  defaultPremium,
}: Props) {
  const initialLme = defaultLme ?? lmeOptions[0]?.value ?? null;
  const initialUsdJpy = defaultUsdJpy ?? usdJpyOptions[0]?.value ?? null;
  const initialPremium = defaultPremium ?? 0;

  const [selectedLmeIndex, setSelectedLmeIndex] = useState(0);
  const [selectedFxIndex, setSelectedFxIndex] = useState(0);
  const [lmeMode, setLmeMode] = useState<'select' | 'manual'>('select');
  const [fxMode, setFxMode] = useState<'select' | 'manual'>('select');
  const [premiumMode, setPremiumMode] = useState<'default' | 'manual'>('default');
  const [manualLme, setManualLme] = useState('');
  const [manualFx, setManualFx] = useState('');
  const [premium, setPremium] = useState('');

  const selectedLme = lmeOptions[selectedLmeIndex] ?? null;
  const selectedFx = usdJpyOptions[selectedFxIndex] ?? null;

  const lmeValue =
    lmeMode === 'manual'
      ? parseInputNum(manualLme)
      : selectedLme?.value ?? initialLme ?? null;
  const fxValue =
    fxMode === 'manual'
      ? parseInputNum(manualFx)
      : selectedFx?.value ?? initialUsdJpy ?? null;
  const premiumValue = premiumMode === 'manual' ? parseInputNum(premium) ?? 0 : initialPremium;

  const calcValue = useMemo(() => {
    if (lmeValue === null || fxValue === null) return null;
    return lmeValue * fxValue + premiumValue;
  }, [lmeValue, fxValue, premiumValue]);

  const latestProduct = useMemo(() => {
    if (initialLme === null || initialUsdJpy === null) return null;
    return initialLme * initialUsdJpy;
  }, [initialLme, initialUsdJpy]);

  const buildSelectLabel = (count: number) => {
    const n = Math.max(1, Math.min(7, count || 0));
    return n <= 1 ? '最新を選択' : `直近${n}件から選択`;
  };
  const lmeSelectLabel = buildSelectLabel(lmeOptions.length);
  const fxSelectLabel = buildSelectLabel(usdJpyOptions.length);

  const tabButtonStyle = (active: boolean): CSSProperties => ({
    padding: '6px 10px',
    borderRadius: 999,
    border: active ? '1px solid #cfdcf4' : '1px solid #d8e0ed',
    background: active ? '#eef5ff' : '#fff',
    fontSize: 12,
    fontWeight: 700,
    color: active ? '#315a92' : '#5f6f85',
    cursor: 'pointer',
  });

  const inputBaseStyle: CSSProperties = {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    padding: '8px 10px',
    fontSize: 16,
    borderRadius: 10,
    border: '1px solid #dbe3ef',
    background: '#fff',
    color: '#1f2937',
  };

  return (
    <div className="cf-card cf-econ-card cf-stock-chart-card" style={{ marginTop: '12px', width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
      <h4>銅建値計算ツール（簡易）</h4>
      <p className="cf-kpi-note" style={{ marginBottom: 10 }}>
        国内建値 ≒ LME銅価格（USD/mt） × USD/JPY + 諸コスト・プレミアム
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
          gap: 10,
          alignItems: 'start',
          width: '100%',
          minWidth: 0
        }}
      >
        <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
          <label style={{ fontWeight: 600, fontSize: 13 }}>LME銅価格（USD/mt）</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setLmeMode('select')}
              style={tabButtonStyle(lmeMode === 'select')}
            >
              {lmeSelectLabel}
            </button>
            <button
              type="button"
              onClick={() => setLmeMode('manual')}
              style={tabButtonStyle(lmeMode === 'manual')}
            >
              手入力
            </button>
          </div>
          {lmeMode === 'select' ? (
            <select
              value={String(selectedLmeIndex)}
              onChange={(e) => setSelectedLmeIndex(Number(e.target.value))}
              style={inputBaseStyle}
            >
              {lmeOptions.map((opt, idx) => (
                <option key={`lme-${idx}-${opt.date}`} value={idx}>
                  {idx === 0 ? '最新データ' : fmtYmd(opt.date)} / {fmtNum(opt.value)}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="number"
              inputMode="decimal"
              placeholder="LME価格を手入力"
              value={manualLme}
              onChange={(e) => setManualLme(e.target.value)}
              style={inputBaseStyle}
            />
          )}
        </div>

        <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
          <label style={{ fontWeight: 600, fontSize: 13 }}>USD/JPY</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setFxMode('select')}
              style={tabButtonStyle(fxMode === 'select')}
            >
              {fxSelectLabel}
            </button>
            <button
              type="button"
              onClick={() => setFxMode('manual')}
              style={tabButtonStyle(fxMode === 'manual')}
            >
              手入力
            </button>
          </div>
          {fxMode === 'select' ? (
            <select
              value={String(selectedFxIndex)}
              onChange={(e) => setSelectedFxIndex(Number(e.target.value))}
              style={inputBaseStyle}
            >
              {usdJpyOptions.map((opt, idx) => (
                <option key={`fx-${idx}-${opt.date}`} value={idx}>
                  {idx === 0 ? '最新データ' : fmtYmd(opt.date)} / {fmtNum(opt.value, 4)}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="number"
              inputMode="decimal"
              step="0.0001"
              placeholder="USD/JPYを手入力"
              value={manualFx}
              onChange={(e) => setManualFx(e.target.value)}
              style={inputBaseStyle}
            />
          )}
        </div>

        <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
          <label style={{ fontWeight: 600, fontSize: 13 }}>諸コスト・プレミアム（円/mt）</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setPremiumMode('default')}
              style={tabButtonStyle(premiumMode === 'default')}
            >
              最新差分を使用
            </button>
            <button
              type="button"
              onClick={() => setPremiumMode('manual')}
              style={tabButtonStyle(premiumMode === 'manual')}
            >
              手入力
            </button>
          </div>
          {premiumMode === 'manual' ? (
            <input
              type="number"
              inputMode="decimal"
              placeholder="例: 0 または 50000"
              value={premium}
              onChange={(e) => setPremium(e.target.value)}
              style={inputBaseStyle}
            />
          ) : (
            <div
              style={{
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid #e6edf6',
                background: '#f8fbff',
                color: '#465569',
                fontSize: 13,
                fontWeight: 600,
                overflowWrap: 'anywhere'
              }}
            >
              {fmtNum(initialPremium, 0)} 円/mt（最新差分 = 最新国内建値−最新LME×最新USD/JPY）
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          borderRadius: 12,
          border: '1px solid #e6edf6',
          background: 'linear-gradient(180deg, #ffffff, #f8fbff)',
          padding: '12px 14px'
        }}
      >
        <div className="cf-kpi-note" style={{ marginBottom: 4 }}>
          計算結果（概算）
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2, color: '#0f172a' }}>
          {calcValue === null ? '-' : fmtNum(calcValue, 0)}
          <span style={{ fontSize: 14, fontWeight: 600, marginLeft: 6, color: '#64748b' }}>JPY/mt</span>
        </div>
        <div className="cf-kpi-note" style={{ marginTop: 6, overflowWrap: 'anywhere' }}>
          既定値（最新LME×最新USD/JPY）+ 最新差分: {latestProduct === null ? '-' : `${fmtNum(latestProduct + initialPremium, 0)}（※最新国内建値） JPY/mt`}
        </div>
      </div>
    </div>
  );
}
