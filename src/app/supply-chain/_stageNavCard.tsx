import Link from 'next/link';
import { SUPPLY_CHAIN_PAGES } from './_pages';

type Props = {
  currentSlug?: string;
};

export default function SupplyChainStageNavCard({ currentSlug }: Props) {
  return (
    <section className="cf-insight-card cf-supply-nav-card" style={{ marginBottom: 16, background: '#fff', borderColor: '#fff' }}>
      <div className="cf-supply-stage-links" aria-label="サプライチェーン工程へのリンク">
        {SUPPLY_CHAIN_PAGES.map((p) => (
          <Link
            key={p.slug}
            href={`/supply-chain/${p.slug}`}
            aria-current={p.slug === currentSlug ? 'page' : undefined}
            className={p.slug === currentSlug ? 'is-active' : undefined}
          >
            {p.shortTitle}
          </Link>
        ))}
      </div>
    </section>
  );
}
