import type { Order, OrderStatus } from './types';
import { STORAGE_KEY } from './types';
import { SAMPLE_ORDERS } from './sampleData';

/** Older keys that may still hold orders from earlier builds. */
const LEGACY_STORAGE_KEYS = [
  'cybertruck-orders',
  'cybertruck-orders-v0',
  'cybertruck_orders',
  'orders',
] as const;

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

export function isSampleOrderId(id: string): boolean {
  return id.startsWith('sample-');
}

/** True when the list is non-empty and every row looks like built-in demo data. */
export function isSampleOnly(orders: Order[]): boolean {
  return orders.length > 0 && orders.every((o) => isSampleOrderId(o.id));
}

function parseOrdersArray(raw: string): Order[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.map(normalizeOrder).filter((o): o is Order => o !== null);
  } catch {
    return null;
  }
}

/**
 * Load orders from localStorage.
 * - Migrates legacy keys → STORAGE_KEY when primary is missing.
 * - Empty saved array stays empty (do not re-seed samples — that felt like a wipe).
 * - First visit (no key anywhere) seeds SAMPLE_ORDERS for demo.
 */
export function loadOrders(): Order[] {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    let migratedFrom: string | null = null;

    if (!raw) {
      for (const key of LEGACY_STORAGE_KEYS) {
        const legacy = localStorage.getItem(key);
        if (legacy) {
          raw = legacy;
          migratedFrom = key;
          break;
        }
      }
    }

    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SAMPLE_ORDERS));
      return SAMPLE_ORDERS.map((o) => ({ ...o }));
    }

    const orders = parseOrdersArray(raw);
    if (!orders) {
      return SAMPLE_ORDERS.map((o) => ({ ...o }));
    }

    if (migratedFrom) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
      } catch {
        /* ignore */
      }
    }

    // Intentionally allow [] — user cleared all orders; do not resurrect samples.
    return orders;
  } catch {
    return SAMPLE_ORDERS.map((o) => ({ ...o }));
  }
}

export function saveOrders(orders: Order[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  } catch {
    /* ignore quota / private mode */
  }
}
