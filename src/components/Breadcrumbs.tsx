

type Item = {
  label: string;
  href?: string;
};

export default function Breadcrumbs({ items }: { items: Item[] }) {
  return (
    <nav aria-label="パンくず" className="breadcrumbs">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`}>
          {item.href ? <a href={item.href}>{item.label}</a> : <strong>{item.label}</strong>}
          {i < items.length - 1 ? ' / ' : ''}
        </span>
      ))}
    </nav>
  );
}
