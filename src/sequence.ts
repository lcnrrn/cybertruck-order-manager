import type { Order } from './types';

export function isActive(o: Pick<Order, 'status'>): boolean {
  return o.status === '대기' || o.status === '제작중';
}

const ts = (o: Order) => o.createdAt || o.updatedAt || 0;

/** 정렬: ★우선 → 접수일 오래된 순(선착순) → id (안정적) */
export function compareOrders(a: Order, b: Order): number {
  if (a.priority !== b.priority) return a.priority ? -1 : 1;
  return ts(a) - ts(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** 완료 탭: ★우선 → 최근 접수 먼저 → id */
export function compareOrdersNewest(a: Order, b: Order): number {
  if (a.priority !== b.priority) return a.priority ? -1 : 1;
  return ts(b) - ts(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** (사용 중지) 예전 순번 정렬 — 저장된 seq는 무시 */
export function compareOrdersBySeq(a: Order, b: Order): number {
  if (a.priority !== b.priority) return a.priority ? -1 : 1;
  const sa = isActive(a) ? a.seq : undefined;
  const sb = isActive(b) ? b.seq : undefined;
  if (sa !== undefined || sb !== undefined) {
    if (sa === undefined) return 1;
    if (sb === undefined) return -1;
    if (sa !== sb) return sa - sb;
  }
  return (b.createdAt || b.updatedAt) - (a.createdAt || a.updatedAt);
}

/** 순번 있는 작업중 주문 id (순번 순서) */
function numberedIds(orders: Order[]): string[] {
  return orders
    .filter((o) => isActive(o) && o.seq !== undefined)
    .sort((a, b) => (a.seq! - b.seq!) || compareOrdersBySeq(a, b))
    .map((o) => o.id);
}

/** ids 순서대로 1..n 재부여, 나머지는 순번 제거. 바뀐 주문만 updatedAt 갱신 */
function applyNumbering(orders: Order[], ids: string[], now: number): Order[] {
  const pos = new Map(ids.map((id, i) => [id, i + 1]));
  return orders.map((o) => {
    const want = pos.get(o.id);
    if (want === o.seq) return o;
    const next: Order = { ...o, updatedAt: now };
    if (want === undefined) delete next.seq;
    else next.seq = want;
    return next;
  });
}

/** 완료 등으로 빠진 순번을 1..n으로 정리 */
export function compactSeq(orders: Order[], now = Date.now()): Order[] {
  return applyNumbering(orders, numberedIds(orders), now);
}

/** 특정 주문을 n번으로 지정 (null/0이면 순번 해제) */
export function setSeq(orders: Order[], id: string, n: number | null, now = Date.now()): Order[] {
  const ids = numberedIds(orders).filter((x) => x !== id);
  const target = orders.find((o) => o.id === id);
  if (n && n > 0 && target && isActive(target)) {
    ids.splice(Math.min(ids.length, Math.floor(n) - 1), 0, id);
  }
  return applyNumbering(orders, ids, now);
}

/**
 * ▲▼ 이동: 화면 순서(compareOrders) 기준으로 같은 ★그룹 안의 이웃과 자리를 바꾸고,
 * 그 지점까지를 1..n으로 깔끔하게 다시 번호 매김.
 */
export function moveSeq(orders: Order[], id: string, dir: -1 | 1, now = Date.now()): Order[] {
  const target = orders.find((o) => o.id === id);
  if (!target || !isActive(target)) return orders;
  const list = orders.filter(isActive).sort(compareOrdersBySeq);
  const i = list.findIndex((o) => o.id === id);
  const j = i + dir;
  if (j < 0 || j >= list.length || list[j].priority !== target.priority) return orders;
  [list[i], list[j]] = [list[j], list[i]];
  // 순번이 있던 마지막 위치와 이동한 두 칸 중 더 뒤까지 번호 부여
  let last = Math.max(i, j);
  list.forEach((o, k) => {
    if (o.seq !== undefined) last = Math.max(last, k);
  });
  return applyNumbering(orders, list.slice(0, last + 1).map((o) => o.id), now);
}
