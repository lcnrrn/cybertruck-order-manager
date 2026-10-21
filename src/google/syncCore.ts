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
    const loss = detailLoss(remote, merged);
    if (loss.unjustified > 0 || loss.total > 5) {
      throw new Error(`입금·제작 체크·발송 정보 ${loss.total}건이 지워질 뻔해서 저장을 멈췄어요 (${loss.names.slice(0, 3).join(', ')}…). 앱을 완전히 닫았다 다시 열어 주세요`);
    }
    await pushOrders(token, merged);
    pushed = true;
  }
  return { merged, pushed, remoteCount: remote.length };
}

/** 시트에 있던 세부값(입금·체크·발송·단가·금액)이 이번 저장으로 사라지는 주문 */
export function detailLoss(remote: Order[], merged: Order[]): { total: number; unjustified: number; names: string[] } {
  const m = new Map(merged.map((o) => [o.id, o]));
  let total = 0;
  let unjustified = 0;
  const names: string[] = [];
  for (const r of remote) {
    const o = m.get(r.id);
    if (!o) continue; // 삭제는 deletedOrders 로 따로 관리
    const lost =
      (r.paid && !o.paid) ||
      (r.doneMap && !o.doneMap) ||
      (r.shipments?.length && !o.shipments?.length) ||
      (r.prices && !o.prices) ||
      (r.amount !== undefined && o.amount === undefined);
    if (!lost) continue;
    total += 1;
    names.push(o.name);
    if (o.updatedAt <= r.updatedAt) unjustified += 1; // 이 기기에서 더 새로 고친 게 아닌데 사라짐 = 버그/옛 데이터
  }
  return { total, unjustified, names };
}
