import type { Order, PostStatus, Shipment } from './types';

const RANK: Record<PostStatus, number> = { cancelled: 0, requested: 1, registered: 2 };

function cleanItems(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = Math.floor(v);
    }
  }
  return out;
}

export function parseShipments(raw: unknown): Shipment[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Shipment[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const s = r as Record<string, unknown>;
    if (typeof s.id !== 'string' || !s.id) continue;
    const st = s.postStatus;
    if (st !== 'requested' && st !== 'registered' && st !== 'cancelled') continue;
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const sh: Shipment = {
      id: s.id,
      no: n(s.no) || 1,
      items: cleanItems(s.items),
      postStatus: st,
      requestedAt: n(s.requestedAt) || 0,
      updatedAt: n(s.updatedAt) || n(s.requestedAt) || 0,
    };
    const ra = n(s.registeredAt); if (ra) sh.registeredAt = ra;
    const rn = str(s.receiptNo); if (rn) sh.receiptNo = rn;
    const tn = str(s.trackingNumber); if (tn) sh.trackingNumber = tn;
    out.push(sh);
  }
  return out.length ? out.sort((a, b) => a.no - b.no || a.requestedAt - b.requestedAt) : undefined;
}

/** 한 발송건 병합: registered 는 절대 되돌리지 않음, 그 외엔 updatedAt 최신. 송장/접수번호는 있는 쪽 보존 */
function mergeOne(a: Shipment, b: Shipment): Shipment {
  let win: Shipment;
  if (RANK[a.postStatus] === 2 || RANK[b.postStatus] === 2) {
    win = a.postStatus === 'registered' && (b.postStatus !== 'registered' || a.updatedAt >= b.updatedAt) ? a : b;
  } else win = a.updatedAt >= b.updatedAt ? a : b;
  const lose = win === a ? b : a;
  const out = { ...win };
  if (!out.trackingNumber && lose.trackingNumber) out.trackingNumber = lose.trackingNumber;
  if (!out.receiptNo && lose.receiptNo) out.receiptNo = lose.receiptNo;
  if (!out.registeredAt && lose.registeredAt && out.postStatus === 'registered') out.registeredAt = lose.registeredAt;
  return out;
}

export function mergeShipments(a?: Shipment[], b?: Shipment[]): Shipment[] | undefined {
  if (!a?.length) return b?.length ? b : undefined;
  if (!b?.length) return a;
  const map = new Map<string, Shipment>();
  for (const s of a) map.set(s.id, s);
  for (const s of b) {
    const e = map.get(s.id);
    map.set(s.id, e ? mergeOne(e, s) : s);
  }
  return Array.from(map.values()).sort((x, y) => x.no - y.no || x.requestedAt - y.requestedAt);
}

export function activeShipments(o: Pick<Order, 'shipments'>): Shipment[] {
  return (o.shipments || []).filter((s) => s.postStatus !== 'cancelled');
}

/** 이미 발송건(전송 대기 + 접수 완료)에 들어간 수량 {제품명: 수량} */
export function shippedQty(o: Pick<Order, 'shipments'>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of activeShipments(o)) for (const [k, q] of Object.entries(s.items)) out[k] = (out[k] || 0) + q;
  return out;
}

/** 만들었지만 아직 어떤 발송건에도 안 들어간 수량 */
export function shippableItems(
  o: Pick<Order, 'shipments'>,
  progress: { key: string; done: number }[],
): Record<string, number> {
  const used = shippedQty(o);
  const out: Record<string, number> = {};
  for (const it of progress) {
    const left = it.done - (used[it.key] || 0);
    if (left > 0) out[it.key] = left;
  }
  return out;
}

function newId(): string {
  return `sh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 새 발송건(전송 대기) 생성. 남은 가능 수량을 넘으면 잘라냄(중복 방지) */
export function addShipment(
  o: Order,
  want: Record<string, number>,
  progress: { key: string; done: number }[],
  now = Date.now(),
): Order | null {
  const avail = shippableItems(o, progress);
  const items: Record<string, number> = {};
  for (const [k, q] of Object.entries(want)) {
    const n = Math.min(Math.floor(q), avail[k] || 0);
    if (n > 0) items[k] = n;
  }
  if (!Object.keys(items).length) return null;
  const all = o.shipments || [];
  const no = activeShipments(o).reduce((m, s) => Math.max(m, s.no), 0) + 1;
  const sh: Shipment = { id: newId(), no, items, postStatus: 'requested', requestedAt: now, updatedAt: now };
  return { ...o, shipments: [...all, sh], updatedAt: now };
}

/** 전송 대기만 취소 가능 (기록은 cancelled 로 남겨서 다른 기기가 되살리지 않게) */
export function cancelShipment(o: Order, shipId: string, now = Date.now()): Order | null {
  const s = o.shipments?.find((x) => x.id === shipId);
  if (!s || s.postStatus !== 'requested') return null;
  return {
    ...o,
    shipments: o.shipments!.map((x) => (x.id === shipId ? { ...x, postStatus: 'cancelled' as const, updatedAt: now } : x)),
    updatedAt: now,
  };
}

/** 송장 붙이기: 송장이 없는 가장 오래된 발송건(접수 완료 우선, 다음 전송 대기)에 붙이고 접수 완료 처리 */
export function attachTracking(o: Order, trackingNumber: string, now = Date.now()): Order {
  const tn = trackingNumber.replace(/\s/g, '');
  const list = activeShipments(o);
  if (list.some((s) => s.trackingNumber === tn)) return { ...o, trackingNumber: tn, updatedAt: now };
  const free = list.filter((s) => !s.trackingNumber);
  const target = free.find((s) => s.postStatus === 'registered') || free.find((s) => s.postStatus === 'requested');
  if (!target) return { ...o, trackingNumber: tn, updatedAt: now };
  return {
    ...o,
    trackingNumber: tn,
    shipments: o.shipments!.map((x) =>
      x.id === target.id
        ? { ...x, trackingNumber: tn, postStatus: 'registered' as const, registeredAt: x.registeredAt || now, updatedAt: now }
        : x,
    ),
    updatedAt: now,
  };
}

/** 모든 품목이 송장 있는 접수 완료 발송건에 들어갔는지 */
export function isFullyShipped(o: Pick<Order, 'shipments'>, progress: { key: string; qty: number }[]): boolean {
  if (!progress.length) return false;
  const got: Record<string, number> = {};
  for (const s of activeShipments(o)) {
    if (s.postStatus !== 'registered' || !s.trackingNumber) continue;
    for (const [k, q] of Object.entries(s.items)) got[k] = (got[k] || 0) + q;
  }
  return progress.every((it) => (got[it.key] || 0) >= it.qty);
}

export function pendingShipmentCount(orders: Order[]): number {
  return orders.reduce((n, o) => n + activeShipments(o).filter((s) => s.postStatus === 'requested').length, 0);
}

export function shipmentLabel(s: Shipment): string {
  return Object.entries(s.items).map(([k, q]) => `${k}×${q}`).join(', ');
}
