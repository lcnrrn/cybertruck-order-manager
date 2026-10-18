import { markSettingChanged } from './settingsMeta';

/** 삭제된 주문 id → 삭제 시각(ms). 동기화 시 다른 기기/시트에서 되살아나지 않게 */
export const DELETED_ORDERS_LS_KEY = 'cybertruck-deleted-orders-v1';
/** 이보다 오래된 삭제 기록은 정리 (시트·기기에 이미 반영됐다고 봄) */
const KEEP_MS = 180 * 24 * 3600 * 1000;

export type DeletedMap = Record<string, number>;

export function normalizeDeleted(v: unknown, now = Date.now()): DeletedMap {
  const out: DeletedMap = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, t] of Object.entries(v as Record<string, unknown>)) {
    if (k && typeof t === 'number' && Number.isFinite(t) && now - t < KEEP_MS) out[k] = t;
  }
  return out;
}

export function mergeDeleted(a: DeletedMap, b: DeletedMap): DeletedMap {
  const out: DeletedMap = { ...a };
  for (const [k, t] of Object.entries(b)) out[k] = Math.max(out[k] || 0, t);
  return out;
}

export function loadDeleted(): DeletedMap {
  try {
    return normalizeDeleted(JSON.parse(localStorage.getItem(DELETED_ORDERS_LS_KEY) || '{}'));
  } catch {
    return {};
  }
}

export function markOrderDeleted(id: string, at = Date.now()): void {
  try {
    const m = loadDeleted();
    m[id] = at;
    localStorage.setItem(DELETED_ORDERS_LS_KEY, JSON.stringify(m));
    markSettingChanged('deletedOrders');
  } catch {
    /* ignore */
  }
}

/** 삭제 이후에 다시 수정된 주문(복원 등)은 살림 */
export function dropDeleted<T extends { id: string; updatedAt: number }>(orders: T[], del: DeletedMap): T[] {
  return orders.filter((o) => !(del[o.id] && del[o.id] >= o.updatedAt));
}
