import type { Order } from './types';
import { buildBackup, type BackupFile } from './backup';

/**
 * 자동 백업 스냅샷 — 이 기기(브라우저 IndexedDB)에 하루 1번 주문+설정을 저장해 둠.
 * 최근 14일치 + 「복원 직전」 5개를 보관. 구글 시트와는 별개의 안전장치라, 시트가 잘못 덮여도 되돌릴 수 있음.
 */
const DB = 'cybertruck-snapshots';
const STORE = 'snaps';
const KEEP_DAILY = 14;
const KEEP_PRE = 5;
const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;

export interface SnapMeta {
  id: string;
  kind: 'daily' | 'pre-restore';
  at: number;
  count: number;
}
interface Snap extends SnapMeta {
  backup: BackupFile;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB 없음'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

async function all(): Promise<Snap[]> {
  const db = await open();
  try {
    return (await tx(db, 'readonly', (s) => s.getAll() as IDBRequest<Snap[]>)) || [];
  } finally {
    db.close();
  }
}

async function put(snap: Snap): Promise<void> {
  const db = await open();
  try {
    await tx(db, 'readwrite', (s) => s.put(snap));
  } finally {
    db.close();
  }
}

async function del(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await open();
  try {
    for (const id of ids) await tx(db, 'readwrite', (s) => s.delete(id));
  } finally {
    db.close();
  }
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `d-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function prune(): Promise<void> {
  const snaps = await all();
  const daily = snaps.filter((x) => x.kind === 'daily').sort((a, b) => b.at - a.at);
  const pre = snaps.filter((x) => x.kind === 'pre-restore').sort((a, b) => b.at - a.at);
  await del([...daily.slice(KEEP_DAILY), ...pre.slice(KEEP_PRE)].map((x) => x.id));
}

/** 하루 1번(같은 날은 6시간 이상 지났고 주문 수가 크게 줄지 않았을 때만 갱신). 실패해도 앱엔 영향 없음 */
let lastCheck = 0;
export async function maybeDailySnapshot(orders: Order[]): Promise<boolean> {
  try {
    if (!orders.length) return false;
    const now = Date.now();
    if (now - lastCheck < 10 * 60 * 1000) return false;
    lastCheck = now;
    const id = dayKey(now);
    const cur = (await all()).find((x) => x.id === id);
    if (cur && (now - cur.at < REFRESH_AFTER_MS || orders.length < cur.count * 0.8)) return false;
    await put({ id, kind: 'daily', at: now, count: orders.length, backup: buildBackup(orders, false) });
    await prune();
    return true;
  } catch {
    return false;
  }
}

/** 복원 직전 현재 상태를 따로 저장 (복원을 후회할 때 되돌리기용) */
export async function savePreRestoreSnapshot(orders: Order[]): Promise<void> {
  try {
    const now = Date.now();
    await put({ id: `p-${now}`, kind: 'pre-restore', at: now, count: orders.length, backup: buildBackup(orders, false) });
    await prune();
  } catch {
    /* ignore */
  }
}

export async function listSnapshots(): Promise<SnapMeta[]> {
  try {
    return (await all()).map(({ id, kind, at, count }) => ({ id, kind, at, count })).sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

export async function getSnapshotBackup(id: string): Promise<BackupFile | null> {
  try {
    return (await all()).find((x) => x.id === id)?.backup ?? null;
  } catch {
    return null;
  }
}
