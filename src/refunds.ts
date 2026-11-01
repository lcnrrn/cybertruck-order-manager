import type { Order, OrderStatus, Refund } from './types';
import type { Product } from './products';
import { orderAmount } from './production';

const STATUSES: OrderStatus[] = ['대기', '제작중', '완료', '환불'];

export function parseRefunds(raw: unknown): Refund[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Refund[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const s = r as Record<string, unknown>;
    if (typeof s.id !== 'string' || !s.id || seen.has(s.id)) continue;
    const amount = typeof s.amount === 'number' && Number.isFinite(s.amount) ? Math.round(s.amount) : 0;
    const at = typeof s.at === 'number' && Number.isFinite(s.at) ? s.at : 0;
    if (amount <= 0 || !at) continue;
    seen.add(s.id);
    const f: Refund = { id: s.id, at, amount };
    if (typeof s.memo === 'string' && s.memo.trim()) f.memo = s.memo.trim();
    if (STATUSES.includes(s.prev as OrderStatus)) f.prev = s.prev as OrderStatus;
    out.push(f);
  }
  return out.length ? out.sort((a, b) => a.at - b.at) : undefined;
}

export function refundTotal(o: Pick<Order, 'refunds'>): number {
  return (o.refunds || []).reduce((s, r) => s + r.amount, 0);
}

/** 환불을 뺀 순매출 (0 미만으로는 안 내려감) */
export function orderNet(o: Order, catalog: Product[]): number {
  return Math.max(0, orderAmount(o, catalog) - refundTotal(o));
}

/** 아직 환불 안 한 남은 금액 */
export function refundRemaining(o: Order, catalog: Product[]): number {
  return Math.max(0, orderAmount(o, catalog) - refundTotal(o));
}

export function newRefundId(): string {
  return `rf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 기간(ms) 안에 한 환불 합계 */
export function refundsBetween(orders: Pick<Order, 'refunds'>[], from: number, to: number): number {
  let s = 0;
  for (const o of orders) for (const r of o.refunds || []) if (r.at >= from && r.at < to) s += r.amount;
  return s;
}

/** 환불 추가 → 새 주문 값. 전액 환불이면 상태를 '환불'로 */
export function applyRefund(o: Order, catalog: Product[], r: { at: number; amount: number; memo?: string }, markFull: boolean): Order {
  const refund: Refund = { id: newRefundId(), at: r.at, amount: Math.round(r.amount) };
  if (r.memo?.trim()) refund.memo = r.memo.trim();
  const refunds = [...(o.refunds || []), refund];
  const full = markFull && orderAmount(o, catalog) > 0 && refunds.reduce((s, x) => s + x.amount, 0) >= orderAmount(o, catalog);
  if (full && o.status !== '환불') refund.prev = o.status;
  return { ...o, refunds, status: full ? '환불' : o.status };
}

/** 환불 삭제 → 새 주문 값. '환불' 상태를 만든 환불이면 이전 상태로 되돌림 */
export function removeRefund(o: Order, refundId: string): Order {
  const target = (o.refunds || []).find((x) => x.id === refundId);
  const refunds = (o.refunds || []).filter((x) => x.id !== refundId);
  const next: Order = { ...o, refunds: refunds.length ? refunds : undefined };
  if (o.status === '환불' && target?.prev) next.status = target.prev;
  else if (o.status === '환불' && !refunds.length) next.status = '완료';
  return next;
}
