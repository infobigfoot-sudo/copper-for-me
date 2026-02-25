import Link from 'next/link';

import FooterReferenceLinks from '@/components/FooterReferenceLinks';

type Item = {
  href: string;
  label: string;
};

type Props = {
  referenceItems?: Item[];
  aboutHref?: string;
  privacyHref?: string;
  disclaimerHref?: string;
};

const DEFAULT_REFERENCE_ITEMS: Item[] = [
  { href: '/#price-overview', label: '最新の価格' },
  { href: '/#tatene-calculator', label: '銅建値計算ツール（簡易）' },
  { href: '/#conclusion', label: '1ヶ月軸の結論' },
  { href: '/#lme-domestic', label: 'LME価格と国内建値' },
  { href: '/#fx-section', label: 'USD/JPY とUSD/CNY' },
  { href: '/#inventory-section', label: 'LME在庫　Warrant / Off-warrant' },
  { href: '/#other-indicators', label: '指標' },
  { href: '/#economic-calendar', label: '経済指標カレンダー' },
  { href: '/#article-section', label: 'ARTICLE' },
  { href: '/learn/copper-price-basics', label: '銅価格を知るうえで見るポイント' },
  { href: '/supply-chain', label: 'サプライチェーン' },
  { href: '/category/index', label: '指標記事' },
];

export default function SiteFooter({
  referenceItems = DEFAULT_REFERENCE_ITEMS,
  aboutHref = '/category/about',
  privacyHref = '/blog/privacypolicy',
  disclaimerHref = '/blog/disclaimer',
}: Props) {
  return (
    <>
      <FooterReferenceLinks items={referenceItems} />
      <footer className="cf-footer">
        <p className="cf-footer-links">
          <Link href={aboutHref}>このサイトについて</Link>
          <span> / </span>
          <Link href={privacyHref}>プライバシーポリシー</Link>
          <span> / </span>
          <Link href={disclaimerHref}>免責事項</Link>
        </p>
        <p className="cf-footer-note">
          本サイトは公開データ/APIをもとに情報を掲載しています。できるだけ最新化していますが、反映に時間差が出る場合があります。
        </p>
        <p>© 2026 Copper for me. All Rights Reserved.</p>
      </footer>
    </>
  );
}
