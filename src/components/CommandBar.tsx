import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { Order } from '../types';
import { formatWon, isUnpaid, orderAmount } from '../production';
import type { Product } from '../products';

export interface QuickAction {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

interface Props {
  orders: Order[];
  products: Product[];
  actions: QuickAction[];
  onPick: (o: Order) => void;
  onClose: () => void;
}

function hay(o: Order): string {
  const tracks = [o.trackingNumber, ...(o.shipments || []).map((s) => s.trackingNumber)].filter(Boolean).join(' ');
  return `${o.name} ${o.phone} ${(o.phone || '').replace(/\D/g, '')} ${o.address} ${o.items} ${tracks}`.toLowerCase();
}

/** 어느 화면에서든 열 수 있는 빠른 검색 · 바로가기 (Ctrl/⌘+K) */
export function CommandBar({ orders, products, actions, onPick, onClose }: Props) {
  const [q, setQ] = useState('');
  const [cur, setCur] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const orderHits = useMemo(() => {
    if (!terms.length) return [];
    const digits = terms.map((t) => t.replace(/\D/g, ''));
    return orders
      .filter((o) => {
        const h = hay(o);
        return terms.every((t, i) => h.includes(t) || (digits[i].length >= 3 && h.includes(digits[i])));
      })
      .sort((a, b) => (b.createdAt || b.updatedAt) - (a.createdAt || a.updatedAt))
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, q]);
  const actionHits = useMemo(
    () => (terms.length ? actions.filter((a) => terms.every((t) => a.label.toLowerCase().includes(t))) : actions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actions, q],
  );

  const rows: { key: string; run: () => void; node: React.ReactNode }[] = [
    ...orderHits.map((o) => ({
      key: `o-${o.id}`,
      run: () => onPick(o),
      node: (
        <>
          <span className="cmd-main">
            <b>{o.name}</b>
            <small>{o.items || '(내용 없음)'}</small>
          </span>
          <span className="cmd-meta">
            <em className={`cmd-pill st-${o.status}`}>{o.status}</em>
            {isUnpaid(o, products) ? <em className="cmd-pill warn">미입금</em> : null}
            <small>{formatWon(orderAmount(o, products))}</small>
          </span>
        </>
      ),
    })),
    ...actionHits.map((a) => ({
      key: `a-${a.id}`,
      run: a.run,
      node: (
        <>
          <span className="cmd-main"><b>{a.label}</b>{a.hint ? <small>{a.hint}</small> : null}</span>
          <span className="cmd-meta"><small>이동</small></span>
        </>
      ),
    })),
  ];
  const at = Math.min(cur, Math.max(rows.length - 1, 0));

  function key(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCur(Math.min(at + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCur(Math.max(at - 1, 0)); }
    else if (e.key === 'Enter' && rows[at]) { e.preventDefault(); rows[at].run(); }
  }

  return (
    <div className="cmd-backdrop" onClick={onClose}>
      <div className="cmd-box" role="dialog" aria-modal="true" aria-label="빠른 검색" onClick={(e) => e.stopPropagation()} onKeyDown={key}>
        <div className="cmd-input">
          <Search size={18} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setCur(0); }}
            placeholder="이름 · 연락처 · 송장 · 품목 검색, 또는 화면 이동"
            enterKeyHint="go"
            aria-label="빠른 검색"
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="cmd-list">
          {terms.length > 0 && orderHits.length === 0 ? <li className="cmd-empty">일치하는 주문이 없어요</li> : null}
          {rows.map((r, i) => (
            <li key={r.key}>
              <button type="button" className={`cmd-row${i === at ? ' is-cur' : ''}`} onMouseEnter={() => setCur(i)} onClick={r.run}>
                {r.node}
              </button>
            </li>
          ))}
        </ul>
        <p className="cmd-foot">↑↓ 이동 · Enter 열기 · Ctrl/⌘+K 어디서든</p>
      </div>
    </div>
  );
}
