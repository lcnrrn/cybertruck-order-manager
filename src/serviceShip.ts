import type { Order } from './types';
import type { ShopSettings } from './shop';
import { COURIER_FEE_CATEGORY, type Expense, type ExpenseState } from './expenses';
import { SHIPPING_NAME } from './production';
import { activeShipments } from './shipments';

/** 서비스(무료배송) 우체국 택배 — 판매자가 내는 택배비 기본값(원). 구매자에게 받는 택배비(4,000원)와 별개 */
export const DEFAULT_SVC_SHIP_FEE = 4500;

export function svcShipFeeOf(shop: Pick<ShopSettings, 'svcShipFee'>): number {
  return typeof shop.svcShipFee === 'number' && shop.svcShipFee >= 0 ? Math.floor(shop.svcShipFee) : DEFAULT_SVC_SHIP_FEE;
}

/** 주문 수정에서 「우체국 택배」 줄의 [서비스] 버튼을 켠 주문 (택배비 0원 = 무료배송) */
export function isServiceShipping(o: Pick<Order, 'items' | 'prices'> | null | undefined): boolean {
  if (!o) return false;
  return o.prices?.[SHIPPING_NAME] === 0 && /택배/.test(o.items || '');
}

function hasKyungdong(o: Pick<Order, 'shipments'>): boolean {
  return activeShipments(o).some((s) => s.carrier === 'kyungdong');
}

/** 이 주문의 서비스 택배비 지출 id — 주문마다 하나로 고정이라 두 기기에서 동시에 켜도 한 건으로 합쳐짐 */
export function svcFeeExpenseId(orderId: string): string {
  return `svc-${orderId}`;
}

/** 지금 이 주문에 서비스 택배비 지출이 있어야 하는가 (경동화물은 자기 택배비를 따로 기록하니 제외) */
export function wantsSvcFee(o: Order | null | undefined): boolean {
  return !!o && isServiceShipping(o) && !hasKyungdong(o);
}

/**
 * 주문이 바뀔 때 지출(택배비)을 맞춤. 바뀐 주문 하나만 봐서, 예전 주문은 건드리지 않음.
 * - 서비스를 새로 켬(꺼져 있다가) → 지출 추가
 * - 서비스를 끔 / 경동화물로 보냄 / 주문 삭제 → 그 지출 삭제 표시
 * - 경동화물을 취소해서 다시 우체국이 되면 → 전에 있던(삭제 표시된) 지출만 되살림
 * 바꿀 게 없으면 null.
 */
export function reconcileSvcFee(prev: Order | null, next: Order | null, st: ExpenseState, fee: number, now = Date.now()): ExpenseState | null {
  const id = svcFeeExpenseId((next || prev)?.id || '');
  if (!id || id === 'svc-') return null;
  const ex = st.items.find((x) => x.id === id);
  const live = !!ex && !ex.deleted;
  const want = wantsSvcFee(next);
  if (want && !live) {
    const turnedOn = !isServiceShipping(prev);
    if (!turnedOn && !ex) return null; // 이미 서비스였던 예전 주문 — 건드리지 않음
    if (fee <= 0) return null;
    const item: Expense = { id, at: now, category: COURIER_FEE_CATEGORY, note: `우체국 서비스 택배비 ${next!.name}`, amount: fee, updatedAt: now };
    const items = ex ? st.items.map((x) => (x.id === id ? item : x)) : [...st.items, item];
    return { ...st, items, categories: st.categories.includes(COURIER_FEE_CATEGORY) ? st.categories : [...st.categories, COURIER_FEE_CATEGORY] };
  }
  if (!want && live) {
    return { ...st, items: st.items.map((x) => (x.id === id ? { ...x, deleted: true, updatedAt: now } : x)) };
  }
  return null;
}
