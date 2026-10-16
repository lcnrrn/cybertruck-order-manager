import type { Order } from '../types';
import type { Product } from '../products';
import { formatWon, orderAmount } from '../production';

interface Props {
  order: Order;
  products: Product[];
  onToggle: (id: string) => void;
  showAmount?: boolean;
}

/** 금액 + 입금 상태 배지 (누르면 입금완료 ↔ 미입금) */
export function PayBadge({ order, products, onToggle, showAmount }: Props) {
  const amt = orderAmount(order, products);
  if (amt <= 0 && !order.paid) return null;
  const paid = Boolean(order.paid);
  return (
    <button
      type="button"
      className={`pay-badge ${paid ? 'paid' : 'unpaid'}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(order.id);
      }}
      title={paid ? '누르면 미입금으로' : '누르면 입금완료로'}
    >
      {paid ? '입금완료' : '미입금'}
      {showAmount || !paid ? ` · ${formatWon(amt)}` : ''}
    </button>
  );
}
