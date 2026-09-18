import type { Order, OrderStatus } from './types';
import { STORAGE_KEY } from './types';
import { SAMPLE_ORDERS } from './sampleData';

function parseStatus(raw: unknown): OrderStatus {
  if (raw === '제작중' || raw === '완료' || raw === '대기') return raw;
  return '대기';
}

/** Normalize a raw localStorage row so older orders without trackingNumber still work. */
export function normalizeOrder(raw: unknown): Order | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id.trim() : '';
  if (!id) return null;

  const trackingRaw = o.trackingNumber;
  const trackingNumber =
    typeof trackingRaw === 'string' && trackingRaw.trim()
      ? trackingRaw.trim()
      : undefined;

  const updatedAt = typeof o.updatedAt === 'number' ? o.updatedAt : Date.now();
  const createdAt = typeof o.createdAt === 'number' ? o.createdAt : updatedAt;

  return {
    id,
    name: typeof o.name === 'string' ? o.name : '이름없음',
    items: typeof o.items === 'string' ? o.items : '',
    address: typeof o.address === 'string' ? o.address : '',
    phone: typeof o.phone === 'string' ? o.phone : '',
    group: typeof o.group === 'string' && o.group.trim() ? o.group.trim() : undefined,
    status: parseStatus(o.status),
    priority: Boolean(o.priority),
    trackingNumber,
    createdAt,
    updatedAt,
  };
}

export function loadOrders(): Order[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SAMPLE_ORDERS));
      return [...SAMPLE_ORDERS];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...SAMPLE_ORDERS];
    const orders = parsed
      .map(normalizeOrder)
      .filter((o): o is Order => o !== null);
    return orders.length > 0 ? orders : [...SAMPLE_ORDERS];
  } catch {
    return [...SAMPLE_ORDERS];
  }
}

export function saveOrders(orders: Order[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}
