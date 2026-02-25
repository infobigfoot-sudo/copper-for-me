import type { CSSProperties } from 'react';

type SourceLink = {
  label: string;
  href: string;
};

export default function SupplyChainSourceLinks({
  links,
  style,
}: {
  links: SourceLink[];
  style?: CSSProperties;
}) {
  return (
    <section
      style={{
        marginBottom: 16,
        border: '1px dashed #cbd5e1',
        borderRadius: 12,
        padding: 16,
        ...style,
      }}
    >
      <p style={{ margin: 0, color: '#475569', lineHeight: 1.8 }}>
        参照元:{' '}
        {links.map((link, i) => (
          <span key={link.href}>
            {i > 0 ? ' / ' : ''}
            <a href={link.href} target="_blank" rel="noreferrer" style={{ color: '#0f766e' }}>
              {link.label}
            </a>
          </span>
        ))}
      </p>
    </section>
  );
}
