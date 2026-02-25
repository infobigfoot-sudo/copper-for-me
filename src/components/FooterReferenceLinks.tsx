import Link from 'next/link';

type Item = {
  href: string;
  label: string;
};

type Props = {
  items: Item[];
  title?: string;
  className?: string;
};

export default function FooterReferenceLinks({
  items,
  title = '参考情報',
  className = '',
}: Props) {
  if (!items.length) return null;
  return (
    <section className={`cf-footer-links-panel ${className}`.trim()} aria-label={title}>
      <p className="cf-footer-links-panel-label">{title}</p>
      <p className="cf-footer-links-panel-inline">
        {items.map((item, idx) => (
          <span key={`${item.href}:${item.label}`}>
            {idx > 0 ? <span className="cf-footer-links-panel-sep"> / </span> : null}
            <Link href={item.href}>{item.label}</Link>
          </span>
        ))}
      </p>
    </section>
  );
}
