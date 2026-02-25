export type SupplyChainPageConfig = {
  slug: string;
  title: string;
  shortTitle: string;
  lead: string;
  badges: Array<'直接データ' | 'proxy' | '日次' | '月次' | '四半期'>;
  sections: string[];
  dataSources: string[];
  limits: string[];
};

export const SUPPLY_CHAIN_PAGES: SupplyChainPageConfig[] = [
  {
    slug: 'mining',
    shortTitle: '鉱山',
    title: '銅サプライチェーン：鉱山（上流供給）',
    lead: 'チリ・ペルーを中心に、銅鉱山の供給動向を確認するページ。上流供給ショックの兆候を月次で把握する。',
    badges: ['直接データ', '月次'],
    sections: ['鉱山工程とは', '主要指標', 'チリ・ペルー鉱山生産（月次）', '供給ショックの見方', 'このページの限界'],
    dataSources: [
      'data/chile/cochilco_copper_mine_production_by_company/',
      'data/peru/bem_copper_production/',
      'data/chile/ine_mining_production_index/（補助）',
    ],
    limits: ['他主要生産国の継続系列は未統合', '企業別の粒度差があるため単純比較に注意'],
  },
  {
    slug: 'refining',
    shortTitle: '精錬',
    title: '銅サプライチェーン：精錬（中流供給・需給）',
    lead: '中国の銅生産・精錬関連データとICSG系データを使って、中流の需給バランスを確認するページ。',
    badges: ['直接データ', 'proxy', '月次'],
    sections: ['精錬工程とは', '主要指標', '中国の銅生産・精錬関連', 'ICSGベースの世界需給バランス', 'このページの限界'],
    dataSources: ['data/china/china_index_2/（中国生産・精錬関連）', 'data/予測用/icsg_core_v1/', 'monthly_master_core_v1（補助）'],
    limits: ['primary / secondary の分解が弱い', '国別カバレッジは中国中心'],
  },
  {
    slug: 'end-use',
    shortTitle: '用途',
    title: '銅サプライチェーン：用途（電線・建設・EV・家電）',
    lead: '用途別需要を直接データではなく proxy 指標中心で把握するページ。電線・建設・製造関連を中心に見る。',
    badges: ['proxy', '月次', '四半期'],
    sections: ['用途工程とは（proxy中心）', '電線系のproxy（日本）', '建設・製造のproxy（マクロ）', 'EV・家電のproxy（補助指標）', '直接データとproxyの違い'],
    dataSources: ['data/japan/METI_COPPER/', 'data/japan/METI_INDEX_NONFERROUS_2018_2025/', 'data/america/*（FRED建設・製造系）'],
    limits: ['用途別銅消費の直接系列は未整備', 'proxyは説明補助であり断定用途には不向き'],
  },
  {
    slug: 'scrap',
    shortTitle: 'スクラップ回収',
    title: '銅サプライチェーン：スクラップ回収・流通',
    lead: 'HS7404（銅くず・残渣）の輸出入を中心に、スクラップの国際フローを確認するページ。',
    badges: ['直接データ', 'proxy', '月次'],
    sections: ['スクラップ工程とは', 'HS7404で見る国際フロー', '日本の輸出入（品目×国）', '中国・米国の関連フロー', 'このページの限界'],
    dataSources: [
      'data/japan/mof_export_item_country_copper_residue/',
      'data/japan/mof_import_item_country_copper_residue/',
      'data/china/china_index_2/（HS7404関連）',
      'data/america/us_census_hs_copper_trade/',
    ],
    limits: ['国内回収実量ではなく貿易フロー中心', '回収率そのものは直接観測できない'],
  },
  {
    slug: 'market',
    shortTitle: '市場',
    title: '銅サプライチェーン：市場（LME・在庫・建値・為替）',
    lead: 'LME価格・在庫、国内建値、為替をまとめて見て、サプライチェーン全体の最終価格形成を確認するページ。',
    badges: ['直接データ', '日次', '月次'],
    sections: ['市場工程とは（価格形成の出口）', 'LME価格（USD/mt）', 'LME在庫・warrant / off-warrant', '国内建値とUSD/JPY', '読み方（上流・中流とのつながり）'],
    dataSources: [
      'data/london/lme/',
      'data/london/warrant/',
      'data/london/off_warrant/',
      'data/london/lme_region_stock/',
      'data/japan/tate_ne/',
      'microCMS: economy_snapshots（USD/JPY, 金利, VIX等）',
    ],
    limits: ['建値はLME×為替だけでは完全一致しない', 'プレミアムや運用調整分を含む'],
  },
];

export function getSupplyChainPage(slug: string) {
  return SUPPLY_CHAIN_PAGES.find((p) => p.slug === slug);
}
