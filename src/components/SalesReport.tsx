import { useMemo } from 'react';
import type { Order, PeriodRange } from '../types';
import type { Product } from '../products';
import { orderTimestamp, resolvePeriodBounds } from '../period';
import { formatWon, orderAmount, parseOrderProducts } from '../production';
import { PeriodFilterBar } from './PeriodFilter';

interface Props {
  orders: Order[];
  products: Product[];
  period: PeriodRange;
  onPeriod: (p: PeriodRange) => void;
  onTogglePaid: (id: string) => void;
  onMarkPaid: (ids: string[]) => void;
  onEdit: (o: Order) => void;
  onClose: () => void;
}

function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function SalesReport({ orders, products, period, onPeriod, onTogglePaid, onMarkPaid, onEdit, onClose }: Props) {
  const data = useMemo(() => {
    const bounds = resolvePeriodBounds(period);
    const list = orders.filter((o) => {
      if (!bounds) return true;
      const ts = orderTimestamp(o.createdAt, o.updatedAt);
      return ts >= bounds[0] && ts <= bounds[1];
    });
    let total = 0;
    let paid = 0;
    const months = new Map<string, { count: number; total: number; paid: number }>();
    const prod = new Map<string, { qty: number; amount: number }>();
    const unpaid: { order: Order; amount: number }[] = [];
    const names = products.map((p) => p.name);
    for (const o of list) {
      const amt = orderAmount(o, products);
      total += amt;
      if (o.paid) paid += amt;
      else if (amt > 0) unpaid.push({ order: o, amount: amt });
      const mk = monthKey(orderTimestamp(o.createdAt, o.updatedAt));
      const m = months.get(mk) ?? { count: 0, total: 0, paid: 0 };
      m.count += 1;
      m.total += amt;
      if (o.paid) m.paid += amt;
      months.set(mk, m);
      for (const p of parseOrderProducts(o.items, names).products) {
        const price = products.find((x) => x.name === p.name)?.price || 0;
        const r = prod.get(p.name) ?? { qty: 0, amount: 0 };
        r.qty += p.qty;
        r.amount += price * p.qty;
        prod.set(p.name, r);
      }
    }
    const monthRows = [...months.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    const prodRows = [...prod.entries()].sort((a, b) => b[1].amount - a[1].amount || b[1].qty - a[1].qty);
    unpaid.sort((a, b) => a.order.createdAt - b.order.createdAt);
    return { count: list.length, total, paid, unpaidSum: total - paid, unpaid, monthRows, prodRows, list };
  }, [orders, products, period]);

  const maxMonth = Math.max(1, ...data.monthRows.map(([, m]) => m.total));
  const maxProd = Math.max(1, ...data.prodRows.map(([, r]) => r.amount || r.qty));
  const noPrices = !products.some((p) => (p.price || 0) > 0);
  const oldDone = data.unpaid.filter((u) => u.order.status === '완료');

  return (
    <div className="sheet-body report">
      <h2 className="sheet-title">📊 매출 정리</h2>
      <PeriodFilterBar value={period} onChange={onPeriod} />
      {noPrices && (
        <p className="hint report-warn">「제품 관리」에서 제품별 판매가를 먼저 입력해 주세요. 그래야 금액이 자동 계산돼요.</p>
      )}
      <div className="report-cards">
        <div className="report-card"><span>주문</span><strong>{data.count}건</strong></div>
        <div className="report-card"><span>총 매출</span><strong>{formatWon(data.total)}</strong></div>
        <div className="report-card ok"><span>입금</span><strong>{formatWon(data.paid)}</strong></div>
        <div className="report-card bad"><span>미입금</span><strong>{formatWon(data.unpaidSum)}</strong></div>
      </div>

      <h3 className="report-h">미입금 주문 {data.unpaid.length}건</h3>
      {data.unpaid.length === 0 ? (
        <p className="hint">미입금 주문이 없어요 👍</p>
      ) : (
        <>
          <ul className="report-unpaid">
            {data.unpaid.map(({ order, amount }) => (
              <li key={order.id}>
                <button type="button" className="report-unpaid-name" onClick={() => onEdit(order)}>
                  {order.name}
                  <em>{new Date(order.createdAt).toLocaleDateString('ko-KR')} · {order.status}</em>
                </button>
                <span className="report-amt">{formatWon(amount)}</span>
                <button type="button" className="btn btn-secondary report-pay" onClick={() => onTogglePaid(order.id)}>
                  입금확인
                </button>
              </li>
            ))}
          </ul>
          {oldDone.length > 1 && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                if (window.confirm(`완료된 주문 ${oldDone.length}건을 모두 입금완료로 바꿀까요? (기존 주문 정리용)`)) {
                  onMarkPaid(oldDone.map((u) => u.order.id));
                }
              }}
            >
              완료 주문 {oldDone.length}건 모두 입금완료 처리
            </button>
          )}
        </>
      )}

      <h3 className="report-h">월별</h3>
      <ul className="report-bars">
        {data.monthRows.map(([k, m]) => (
          <li key={k}>
            <div className="report-bar-label">
              <span>{k.replace('-', '년 ')}월 · {m.count}건</span>
              <span>{formatWon(m.total)}{m.total - m.paid > 0 ? ` (미입금 ${formatWon(m.total - m.paid)})` : ''}</span>
            </div>
            <div className="report-bar"><i style={{ width: `${(m.total / maxMonth) * 100}%` }} /><b style={{ width: `${(m.paid / maxMonth) * 100}%` }} /></div>
          </li>
        ))}
      </ul>

      <h3 className="report-h">제품별 판매</h3>
      <ul className="report-bars">
        {data.prodRows.map(([name, r]) => (
          <li key={name}>
            <div className="report-bar-label">
              <span>{name} · {r.qty}개</span>
              <span>{formatWon(r.amount)}</span>
            </div>
            <div className="report-bar"><b style={{ width: `${((r.amount || r.qty) / maxProd) * 100}%` }} /></div>
          </li>
        ))}
      </ul>
      <p className="hint">제품별 금액은 판매가 × 수량 기준이에요 (할인·배송비 직접 입력분은 총 매출에만 반영).</p>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
