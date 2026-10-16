import { useMemo, useState } from 'react';
import type { Order } from '../types';
import { getProductColor, type Product } from '../products';
import { buildProductionSummary } from '../production';

const COLLAPSE_KEY = 'cybertruck-production-collapsed';

interface Props {
  orders: Order[];
  products: Product[];
  selected: string | null;
  onSelect: (name: string | null) => void;
}

export function ProductionSummary({ orders, products, selected, onSelect }: Props) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const summary = useMemo(() => buildProductionSummary(orders, products), [orders, products]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  if (summary.orderCount === 0) return null;
  const pick = (n: string) => onSelect(selected === n ? null : n);

  return (
    <section className="prod-summary">
      <button type="button" className="prod-summary-head" onClick={toggle} aria-expanded={!collapsed}>
        <span className="prod-summary-title">🛠 만들 제품</span>
        <span className="prod-summary-meta">
          총 {summary.total}개 · 주문 {summary.orderCount}건
        </span>
        <span className="prod-summary-caret">{collapsed ? '▼' : '▲'}</span>
      </button>
      {selected && (
        <div className="prod-summary-filter">
          <span>‘{selected}’ 포함 주문만 보는 중</span>
          <button type="button" onClick={() => onSelect(null)}>해제 ✕</button>
        </div>
      )}
      {!collapsed && (
        <div className="prod-summary-body">
          <div className="prod-chips">
            {summary.rows.map((r) => {
              const c = getProductColor(r.name, products);
              return (
                <button
                  type="button"
                  key={r.name}
                  className={`prod-chip${selected === r.name ? ' is-active' : ''}`}
                  style={{ background: c.bg, borderColor: c.border, color: c.text }}
                  onClick={() => pick(r.name)}
                >
                  <span className="prod-chip-name">{r.name}</span>
                  <span className="prod-chip-qty">{r.total}</span>
                  {r.waiting > 0 && r.making > 0 ? (
                    <span className="prod-chip-split">대기 {r.waiting} · 제작 {r.making}</span>
                  ) : (
                    <span className="prod-chip-split">{r.making > 0 ? '제작중' : '대기'}</span>
                  )}
                </button>
              );
            })}
          </div>
          {summary.others.length > 0 && (
            <div className={`prod-others${selected === '기타' ? ' is-active' : ''}`} onClick={() => pick('기타')}>
              <span className="prod-others-title">기타 {summary.others.length}</span>
              <ul>
                {summary.others.map((x, i) => (
                  <li key={i}>
                    {x.text}
                    {x.qty > 1 ? ` ×${x.qty}` : ''} <em>({x.orderName})</em>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
