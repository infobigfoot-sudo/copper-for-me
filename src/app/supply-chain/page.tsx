import NativePageShell from '@/components/native/NativePageShell';
import SupplyNativeBoard from '@/components/native/SupplyNativeBoard';
import { normalizeChileMiningMonthlySeries } from '@/lib/mining_normalize';
import { normalizeSeries, readMergedPublishSeriesBundle } from '@/lib/publish_series_bundle';

export default async function SupplyChainPage() {
  const merged = await readMergedPublishSeriesBundle();
  const series = merged?.series || {};

  return (
    <NativePageShell active="supply-chain" title="供給と需要" description="鉱山生産・ICSG需給・国内スクラップ在庫の動きを統合し、市場の位置を把握。">
      <SupplyNativeBoard
        data={{
          chile: normalizeChileMiningMonthlySeries(
            normalizeSeries(series.supply_chain_mining_chile_mine_output_total_thousand_tmf_cochilco)
          ),
          peru: normalizeSeries(series.supply_chain_mining_peru_mine_output_total_tmf_bem),
          icsgBalance: normalizeSeries(series.icsg_world_refined_balance),
          icsgProd: normalizeSeries(series.icsg_world_refined_production),
          icsgUse: normalizeSeries(series.icsg_world_refined_usage),
          jpProd: normalizeSeries(series.supply_chain_refining_jp_electric_copper_production_qty),
          jpSales: normalizeSeries(series.supply_chain_refining_jp_electric_copper_sales_qty),
          jpInv: normalizeSeries(series.supply_chain_refining_jp_electric_copper_inventory_qty),
          hs7404Imp: normalizeSeries(series.japan_mof_import_hs7404_qty).map((row) => ({
            ...row,
            value: row.value / 1000,
          })),
          hs7404Exp: normalizeSeries(series.japan_mof_export_hs7404_qty).map((row) => ({
            ...row,
            value: row.value / 1000,
          })),
          tatene: normalizeSeries(series.japan_tatene_jpy_t),
          lme: normalizeSeries(series.lme_copper_cash_usd_t),
          usdjpy: normalizeSeries(series.america_dexjpus),
        }}
      />
    </NativePageShell>
  );
}
