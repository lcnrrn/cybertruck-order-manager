import {
  getProductColor,
  parseItemsAgainstCatalog,
  type Product,
} from '../products';

interface Props {
  items: string;
  products: Product[];
  className?: string;
}

/**
 * Render order items as colored catalog badges + leftover note text.
 * Best-effort match against the current product catalog.
 */
export function ProductBadges({ items, products, className }: Props) {
  const raw = (items || '').trim();
  if (!raw) {
    return <span className={className}>주문 내용 없음</span>;
  }

  const { selected, note } = parseItemsAgainstCatalog(raw, products);

  if (selected.length === 0 && !note) {
    return <span className={className}>{raw}</span>;
  }

  // If nothing matched catalog, keep plain text
  if (selected.length === 0) {
    return <span className={className}>{raw}</span>;
  }

  return (
    <span className={`product-badges ${className ?? ''}`.trim()}>
      {selected.map((name) => {
        const c = getProductColor(name, products);
        return (
          <span
            key={name}
            className="product-badge"
            style={{
              background: c.bg,
              borderColor: c.border,
              color: c.text,
            }}
            title={name}
          >
            {name}
          </span>
        );
      })}
      {note ? <span className="product-badge-note">{note}</span> : null}
    </span>
  );
}
