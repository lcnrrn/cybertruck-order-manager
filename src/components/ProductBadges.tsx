import {
  getProductColor,
  parseItemsAgainstCatalog,
  type Product,
} from '../products';

interface Props {
  items: string;
  products: Product[];
  className?: string;
  /** 주문별 단가 지정 — 0이면 서비스 배지 */
  prices?: Record<string, number>;
}

/**
 * Render order items as colored catalog badges + leftover note text.
 * Best-effort match against the current product catalog.
 */
export function ProductBadges({ items, products, className, prices }: Props) {
  const raw = (items || '').trim();
  if (!raw) {
    return <span className={className}>주문 내용 없음</span>;
  }

  const { selected, note, qty } = parseItemsAgainstCatalog(raw, products);

  if (selected.length === 0 && !note) {
    return <span className={className}>{raw}</span>;
  }

  // Nothing matched catalog — treat whole leftover as note (red, larger)
  if (selected.length === 0) {
    return (
      <span className={className}>
        <span className="product-badge-note">{note || raw}</span>
      </span>
    );
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
            {(qty[name] || 1) > 1 ? <b className="product-badge-qty"> ×{qty[name]}</b> : null}
            {prices?.[name] === 0 ? <em className="service-tag">서비스</em> : null}
          </span>
        );
      })}
      {note ? <span className="product-badge-note">{note}</span> : null}
    </span>
  );
}
