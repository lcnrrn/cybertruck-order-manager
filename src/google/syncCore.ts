import type { Order } from '../types';
import { isSampleOrderId } from '../storage';
import { loadDeleted } from '../deletedOrders';
import { mergeShipments } from '../shipments';

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

import { patchOrders, pullOrders } from './sheets';
import { syncSettings } from './settingsSync';

/** 주문 하나의 지문(짧은 해시) */
export function orderHash(o: Order): string {
  const s = ordersFingerprint([o]);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

/** 마지막으로 시트와 맞춘 주문별 지문 — 이것과 다르면 '이 기기에서 고친 것(아직 안 올림)' */
const LS_BASE = 'cybertruck-sync-base-v2';
export function loadBase(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(LS_BASE);
    if (!raw) return null;
    const j = JSON.parse(raw) as unknown;
    return j && typeof j === 'object' ? (j as Record<string, string>) : null;
  } catch {
    return null;
  }
}
function saveBase(list: Order[]): void {
  try {
    const m: Record<string, string> = {};
    for (const o of list) m[o.id] = orderHash(o);
    localStorage.setItem(LS_BASE, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

/** 이 기기에서 고쳐서 아직 시트에 안 올린 주문 id */
export function dirtyOrderIds(local: Order[]): string[] {
  const base = loadBase();
  if (!base) return [];
  return local.filter((o) => !isSampleOrderId(o.id) && base[o.id] !== orderHash(o)).map((o) => o.id);
}

const DETAIL_KEYS = ['amount', 'paid', 'paidAt', 'filamentG', 'filamentAt', 'filamentUse', 'filamentPick', 'seq', 'doneMap', 'prices', 'filamentGrams', 'shipments'] as const;

function clean(o: Order): Order {
  if (!o._partial && !o._legacy) return o;
  const r = { ...o };
  delete r._partial;
  delete r._legacy;
  return r;
}

/**
 * 시트가 기준. 결과: 합친 목록 + 시트에 써야 할 주문(이 기기에서 고친 것만).
 * - 이 기기에서 고쳤고(지문이 다름) 시트보다 새것 → 이 기기 것을 씀
 * - 그 외엔 전부 시트 것 (이 기기가 옛것/빈 것이어도 시트를 못 건드림)
 * - 시트 행의 세부값이 깨져서(_partial) 못 읽으면 이 기기 세부값을 유지하고 그 행만 고쳐 씀
 */
export function planSync(local: Order[], remote: Order[], base: Record<string, string> | null, deleted: Record<string, number> = {}) {
  const lmap = new Map(local.map((o) => [o.id, o]));
  const rmap = new Map(remote.map((o) => [o.id, o]));
  const remoteReal = remote.filter((o) => !isSampleOrderId(o.id));
  const dirty = (l: Order): boolean => {
    if (isSampleOrderId(l.id)) return false;
    const r = rmap.get(l.id);
    if (base) return base[l.id] !== orderHash(l);
    // 이 버전 첫 실행(지문 기록 없음): 시트보다 확실히 새것만 내 수정으로 봄
    return !r || l.updatedAt > r.updatedAt;
  };
  const merged: Order[] = [];
  const write: Order[] = [];
  for (const r of remote) {
    if (isSampleOrderId(r.id) && remoteReal.length) continue;
    const l = lmap.get(r.id);
    if (l && dirty(l) && l.updatedAt >= r.updatedAt) {
      const sh = mergeShipments(l.shipments, r._partial ? undefined : r.shipments);
      const win = clean({ ...l, ...(sh ? { shipments: sh } : {}) });
      merged.push(win);
      write.push(win);
      continue;
    }
    if (r._partial) {
      // 시트 세부값을 못 읽음 → 이 기기 값 유지 + 그 행 고쳐 쓰기 (없으면 그대로)
      const fix: Order = clean({ ...r });
      const rec = fix as unknown as Record<string, unknown>;
      if (l) for (const k of DETAIL_KEYS) if ((l as unknown as Record<string, unknown>)[k] !== undefined) rec[k] = (l as unknown as Record<string, unknown>)[k];
      merged.push(fix);
      if (l) write.push(fix);
      continue;
    }
    const win = clean(r);
    // 접수 완료된 발송건은 어느 쪽에 있든 지키기
    const sh = l ? mergeShipments(win.shipments, l.shipments) : win.shipments;
    if (sh && JSON.stringify(sh) !== JSON.stringify(win.shipments)) {
      const fixed = { ...win, shipments: sh };
      merged.push(fixed);
      write.push(fixed);
    } else merged.push(win);
  }
  for (const l of local) {
    if (rmap.has(l.id) || deleted[l.id]) continue;
    if (isSampleOrderId(l.id)) {
      if (!remoteReal.length) merged.push(l);
      continue;
    }
    // 시트에 없는 주문: 이 기기에서 새로 만든 것 / 시트에서 행이 사라진 것(삭제는 deletedOrders 로만 하므로 복구)
    if (dirty(l) || (base && base[l.id])) {
      merged.push(l);
      write.push(l);
    }
  }
  const out = merged.filter((o) => !deleted[o.id]);
  return { merged: out, write: write.filter((o) => !deleted[o.id]) };
}

/**
 * 동기화 한 번: 설정 받기·합치기·(바뀐 키만) 올리기 → 주문 최신본 받기 → 이 기기에서 고친 주문만 그 행에 쓰기.
 * 한 번도 받은 적 없는 기기(새 아이콘·저장소 비워짐)는 받기 전엔 아무것도 쓰지 않음.
 */
export async function pullMergePush(token: string, local: Order[]): Promise<{ merged: Order[]; pushed: boolean; remoteCount: number }> {
  await syncSettings(token);
  const remote = await pullOrders(token);
  const deleted = loadDeleted();
  const { merged, write } = planSync(local, remote, loadBase(), deleted);
  let pushed = false;
  if (write.length) {
    const loss = detailLoss(remote, write);
    if (loss.unjustified > 0 || loss.total > 5) {
      throw new Error(`입금·제작 체크·발송 정보 ${loss.total}건이 지워질 뻔해서 저장을 멈췄어요 (${loss.names.slice(0, 3).join(', ')}…). 앱을 완전히 닫았다 다시 열어 주세요`);
    }
    await patchOrders(token, write);
    pushed = true;
  }
  saveBase(merged);
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
