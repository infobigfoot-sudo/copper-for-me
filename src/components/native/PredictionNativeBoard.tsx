import { SectionCard, fmtNum } from '@/components/native/NativeWidgets';

export default function PredictionNativeBoard({
  rangeLow,
  rangeHigh,
  adopted,
  reference,
  warningReason,
  maeDiffPct,
  warrant7dPct,
  offMoMPct,
  usdJpy,
  usdCny,
  us10y,
  copx,
  updateDate,
}: {
  rangeLow: number;
  rangeHigh: number;
  adopted: number;
  reference: number;
  warningReason: string;
  maeDiffPct: number | null;
  warrant7dPct: number | null;
  offMoMPct: number | null;
  usdJpy: number | null;
  usdCny: number | null;
  us10y: number | null;
  copx: number | null;
  updateDate: string;
}) {
  const pct = (v: number | null) => (v === null || !Number.isFinite(v) ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);
  const widthFromPct = (v: number | null) => `${Math.max(8, Math.min(100, Math.abs(v ?? 0) * 5)).toFixed(1)}%`;
  const tone = (v: number | null) => (v !== null && v > 0 ? 'bg-negative' : 'bg-positive');

  return (
    <div className="space-y-8">
      <SectionCard title="結論レイヤー">
        <p className="text-cool-grey text-sm mb-4">1分で判断するための要約</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card rounded-2xl p-5">
            <p className="text-cool-grey text-xs mb-1">建値 想定レンジ（1ヶ月）</p>
            <p className="text-2xl font-black text-off-white">{fmtNum(rangeLow, 0)} - {fmtNum(rangeHigh, 0)}</p>
            <p className="text-cool-grey text-xs mt-1">JPY/mt</p>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <p className="text-cool-grey text-xs mb-1">採用値（基準）</p>
            <p className="text-2xl font-black text-off-white">{fmtNum(adopted, 0)}</p>
            <p className="text-cool-grey text-xs mt-1">LME naive × USDJPY naive</p>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <p className="text-cool-grey text-xs mb-1">参考値（代替）</p>
            <p className="text-2xl font-black text-off-white">{fmtNum(reference, 0)}</p>
            <p className="text-cool-grey text-xs mt-1">LME naive × USDJPY xgboost</p>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <p className="text-cool-grey text-xs mb-1">警戒フラグ</p>
            <p className="text-2xl font-black text-positive">中</p>
            <p className="text-cool-grey text-xs mt-1">方向: 上昇寄り / 需給: {warningReason}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="根拠レイヤー">
        <p className="text-cool-grey text-sm mb-4">なぜその結論かを分解して表示</p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="glass-card rounded-2xl p-5">
            <h5 className="text-off-white font-bold mb-3">建値分解</h5>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-cool-grey">LME寄与</span><strong className="text-positive">+1.23%</strong></div>
              <div className="flex justify-between"><span className="text-cool-grey">為替寄与</span><strong className="text-positive">+0.29%</strong></div>
              <div className="flex justify-between"><span className="text-cool-grey">諸コスト寄与</span><strong className="text-negative">-13.74%</strong></div>
            </div>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <h5 className="text-off-white font-bold mb-3">主要4指標（最新）</h5>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-cool-grey">USD/JPY</span><strong className="text-off-white">{fmtNum(usdJpy, 2)}</strong></div>
              <div className="flex justify-between"><span className="text-cool-grey">USD/CNY</span><strong className="text-off-white">{fmtNum(usdCny, 3)}</strong></div>
              <div className="flex justify-between"><span className="text-cool-grey">米10年金利</span><strong className="text-off-white">{fmtNum(us10y, 2)}%</strong></div>
              <div className="flex justify-between"><span className="text-cool-grey">銅ETF（COPX）</span><strong className="text-off-white">{fmtNum(copx, 2)}</strong></div>
            </div>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <h5 className="text-off-white font-bold mb-3">需給スナップショット</h5>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1"><span className="text-cool-grey">Warrant 7日比</span><strong className="text-off-white">{pct(warrant7dPct)}</strong></div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden"><span className={`block h-full ${tone(warrant7dPct)}`} style={{ width: widthFromPct(warrant7dPct) }} /></div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1"><span className="text-cool-grey">off-warrant 前月比</span><strong className="text-off-white">{pct(offMoMPct)}</strong></div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden"><span className={`block h-full ${tone(offMoMPct)}`} style={{ width: widthFromPct(offMoMPct) }} /></div>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="監査レイヤー">
        <p className="text-cool-grey text-sm mb-4">予測値の信頼性と更新状態を確認</p>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="glass-card rounded-2xl p-5">
            <h5 className="text-off-white font-bold mb-3">naive比較（CV）</h5>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-cool-grey">LME MAE差</span><strong className="text-negative">{pct(maeDiffPct)}</strong></div>
              <div className="flex justify-between"><span className="text-cool-grey">USDJPY MAE差</span><strong className="text-off-white">改善</strong></div>
              <div className="flex justify-between"><span className="text-cool-grey">建値 MAE差</span><strong className="text-negative">+0.8%</strong></div>
            </div>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <h5 className="text-off-white font-bold mb-3">データ鮮度</h5>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-cool-grey">更新日</span><strong className="text-off-white">{updateDate}</strong></div>
              <div className="flex justify-between"><span className="text-cool-grey">LME</span><strong className="text-off-white">{updateDate}</strong></div>
              <div className="flex justify-between"><span className="text-cool-grey">USDJPY</span><strong className="text-off-white">{updateDate}</strong></div>
              <div className="flex justify-between"><span className="text-cool-grey">建値</span><strong className="text-off-white">{updateDate}</strong></div>
            </div>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <h5 className="text-off-white font-bold mb-3">運用ルール</h5>
            <p className="text-cool-grey text-sm leading-relaxed">点予測は基準ケースを優先。方向・レンジ・警戒は補助用途。</p>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <h5 className="text-off-white font-bold mb-3">統計モデルって何？</h5>
            <p className="text-cool-grey text-sm leading-relaxed">過去データのパターンから、次の値を予想する計算ルールです。</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

