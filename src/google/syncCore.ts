import type { Order } from '../types';

/** 주문 목록 비교용 지문 (순서 무관) */
export function ordersFingerprint(list: Order[]): string {
  return JSON.stringify(
    [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((o) => {
      const keys = Object.keys(o).sort();
      return keys.map((k) => [k, (o as unknown as Record<string, unknown>)[k]]).filter(([, v]) => v !== undefined);
    }),
  );
}

export function isAuthError(msg: string): boolean {
  return /\b401\b|invalid authentication|invalid credentials|expired|UNAUTHENTICATED|Invalid Credentials/i.test(msg);
}

import { canPushLocalOverRemote, mergeOrdersForSync, pullOrders, pushOrders } from './sheets';
import { syncSettings } from './settingsSync';

/**
 * 동기화 한 번: 설정 받기·합치기·올리기 → 주문 최신본 받기 → 주문별 updatedAt 최신 쪽으로 병합 → 시트와 다르면 올리기.
 * 항상 '받고 나서' 쓰기 때문에 옛 로컬이 더 새 시트 내용을 덮지 못함.
 */
export async function pullMergePush(token: string, local: Order[]): Promise<{ merged: Order[]; pushed: boolean; remoteCount: number }> {
  await syncSettings(token);
  const remote = await pullOrders(token);
  const merged = mergeOrdersForSync(local, remote);
  let pushed = false;
  if (ordersFingerprint(merged) !== ordersFingerprint(remote)) {
    const guard = canPushLocalOverRemote(merged, remote.length);
    if (!guard.ok) throw new Error(guard.reason);
    await pushOrders(token, merged);
    pushed = true;
  }
  return { merged, pushed, remoteCount: remote.length };
}
