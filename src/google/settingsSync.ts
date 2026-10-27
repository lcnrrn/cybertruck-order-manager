import { getSheetId } from './config';
import { ensureTab } from './sheets';
import { mergeDeleted, normalizeDeleted } from '../deletedOrders';
import { mergeById, mergeExpenseStates, normalizeExpenses } from '../expenses';
import {
  SETTINGS_APPLIED_EVENT,
  SETTING_LS_KEYS,
  ITEM_KEYS,
  getItemStamps,
  getSettingsMeta,
  mergeItems,
  mergeStamps,
  setItemStamps,
  setSettingMeta,
  setSettingSnapshot,
  type ItemStamps,
  type SettingKey,
} from '../settingsMeta';

/**
 * Device settings sync via a separate "설정" tab: one row per key (key | json | updatedAt).
 * - products / sources / sms: last-write-wins per key (updatedAt).
 * - filament: entries merged append-only by id (both devices' purchases kept); threshold LWW.
 * - A device that never edited a key (no local data) has updatedAt 0 → remote always wins.
 * - Remote empty → local real data is pushed (first device with real data wins).
 */
const API = 'https://sheets.googleapis.com/v4/spreadsheets';
export const SETTINGS_SHEET_NAME = '설정';
const HEADERS = ['key', 'json', 'updatedAt'];
const KEYS: SettingKey[] = ['products', 'sources', 'sms', 'filament', 'production', 'expenses', 'deletedOrders', 'epostRequest', 'productImages', 'shop'];

interface Entry {
  json: string; // '' = default / not set
  updatedAt: number;
}

function req(token: string, path: string, init?: RequestInit) {
  return fetch(`${API}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

async function check(res: Response, what: string): Promise<Response> {
  if (res.ok) return res;
  let msg = `HTTP ${res.status}`;
  try {
    const b = (await res.json()) as { error?: { message?: string } };
    msg = b.error?.message || msg;
  } catch {
    /* ignore */
  }
  if (res.status === 429 || res.status === 503) msg += ` [HTTP ${res.status}]`;
  throw new Error(`${what}: ${msg}`);
}

const STAMPS_ROW = 'itemStamps';
let remoteStamps: ItemStamps = {};

/** 설정 탭 범위 — 동기화 때 주문 탭과 함께 batchGet 으로 한 번에 읽음 */
export const SETTINGS_RANGE = `${SETTINGS_SHEET_NAME}!A:C`;

async function pullRemote(token: string, id: string, prefetched?: string[][]): Promise<Map<SettingKey, Entry>> {
  let values = prefetched;
  if (!values) {
    const range = encodeURIComponent(SETTINGS_RANGE);
    const res = await check(await req(token, `${id}/values/${range}`), '설정 읽기 실패');
    values = ((await res.json()) as { values?: string[][] }).values || [];
  }
  const data = { values };
  const out = new Map<SettingKey, Entry>();
  remoteStamps = {};
  for (const row of data.values || []) {
    if (String(row[0] || '').trim() === STAMPS_ROW) {
      try {
        remoteStamps = (JSON.parse(String(row[1] || '{}')) as ItemStamps) || {};
      } catch {
        remoteStamps = {};
      }
      continue;
    }
    const key = String(row[0] || '').trim() as SettingKey;
    if (!KEYS.includes(key)) continue;
    out.set(key, { json: String(row[1] ?? ''), updatedAt: Number(row[2]) || 0 });
  }
  return out;
}

/** 바뀐 키 행만 씀 (A 열 key 로 행을 찾고, 없으면 아래에 추가). 탭 전체를 지우지 않음 */
async function pushRemote(token: string, id: string, map: Map<SettingKey, Entry>, stamps: ItemStamps, keys: string[]): Promise<void> {
  const range = encodeURIComponent(`${SETTINGS_SHEET_NAME}!A:A`);
  const res = await check(await req(token, `${id}/values/${range}`), '설정 읽기 실패');
  const vals = ((await res.json()) as { values?: string[][] }).values || [];
  const rowOf = new Map<string, number>();
  vals.forEach((r, i) => {
    const k = String(r?.[0] ?? '').trim();
    if (k && !rowOf.has(k)) rowOf.set(k, i + 1);
  });
  const rowFor = (k: string): string[] =>
    k === STAMPS_ROW ? [STAMPS_ROW, JSON.stringify(stamps), String(Date.now())] : [k, map.get(k as SettingKey)!.json, String(map.get(k as SettingKey)!.updatedAt)];
  const data: { range: string; values: string[][] }[] = [];
  const append: string[][] = [];
  if (!vals.length) data.push({ range: `${SETTINGS_SHEET_NAME}!A1:C1`, values: [HEADERS] });
  for (const k of keys) {
    if (k !== STAMPS_ROW && !map.has(k as SettingKey)) continue;
    const n = rowOf.get(k);
    if (n) data.push({ range: `${SETTINGS_SHEET_NAME}!A${n}:C${n}`, values: [rowFor(k)] });
    else append.push(rowFor(k));
  }
  if (data.length) {
    await check(await req(token, `${id}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }) }), '설정 쓰기 실패');
  }
  if (append.length) {
    await check(
      await req(token, `${id}/values/${encodeURIComponent(`${SETTINGS_SHEET_NAME}!A:C`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', body: JSON.stringify({ values: append }) }),
      '설정 추가 실패',
    );
  }
}

function readLocal(key: SettingKey): Entry | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SETTING_LS_KEYS[key]);
  } catch {
    /* ignore */
  }
  const ts = getSettingsMeta()[key] || 0;
  if (raw === null && ts === 0) return null; // never edited: defaults only
  // Edited before sync existed → treat as real but oldest (1)
  return { json: raw ?? '', updatedAt: ts || 1 };
}

function writeLocal(key: SettingKey, e: Entry): void {
  try {
    if (e.json) localStorage.setItem(SETTING_LS_KEYS[key], e.json);
    else localStorage.removeItem(SETTING_LS_KEYS[key]);
  } catch {
    /* ignore */
  }
  setSettingMeta(key, e.updatedAt);
  setSettingSnapshot(key, e.json);
}

interface FilamentLike {
  entries?: { id?: string; at?: number; typeId?: string; updatedAt?: number }[];
  threshold?: number;
  types?: { id?: string }[];
  materials?: string[];
  colors?: string[];
}

function parseFil(json: string): FilamentLike {
  try {
    const p = JSON.parse(json) as FilamentLike;
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

function mergeFilament(local: Entry | null, remote: Entry | null): Entry | null {
  if (!local) return remote;
  if (!remote) return local;
  const l = parseFil(local.json);
  const r = parseFil(remote.json);
  // id별 병합: 금액 수정·삭제는 updatedAt이 큰 쪽이 이김 (같으면 시트 쪽)
  const entries = mergeById(r.entries || [], l.entries || []).sort((a, b) => (a.at || 0) - (b.at || 0));
  const newer = local.updatedAt > remote.updatedAt ? l : r;
  const older = newer === l ? r : l;
  const threshold = typeof newer.threshold === 'number' ? newer.threshold : (l.threshold ?? r.threshold ?? 1000);
  // types: newer list wins (LWW); keep older-only types still referenced by entries so nothing is orphaned
  const types = [...(newer.types || older.types || [])];
  const used = new Set(entries.map((e) => e.typeId).filter(Boolean));
  for (const t of older.types || []) {
    if (t && t.id && used.has(t.id) && !types.some((x) => x && x.id === t.id)) types.push(t);
  }
  const out: FilamentLike = { entries, threshold };
  if (types.length) out.types = types;
  const materials = newer.materials || older.materials;
  const colors = newer.colors || older.colors;
  if (materials) out.materials = materials;
  if (colors) out.colors = colors;
  return { json: JSON.stringify(out), updatedAt: Math.max(local.updatedAt, remote.updatedAt) };
}

function mergeExpensesEntry(local: Entry | null, remote: Entry | null): Entry | null {
  if (!local) return remote;
  if (!remote) return local;
  const parse = (j: string) => {
    try {
      return normalizeExpenses(JSON.parse(j));
    } catch {
      return normalizeExpenses(null);
    }
  };
  const m = mergeExpenseStates(parse(local.json), parse(remote.json), local.updatedAt > remote.updatedAt);
  return { json: JSON.stringify(m), updatedAt: Math.max(local.updatedAt, remote.updatedAt) };
}

let running: Promise<boolean> | null = null;

/** Pull → merge → write local / push remote. Returns true if local settings changed. */
/** prefetched: 같은 동기화에서 방금 batchGet 으로 읽은 설정!A:C 값 (있으면 다시 안 읽음) */
export function syncSettings(token: string, prefetched?: string[][]): Promise<boolean> {
  // 이미 실행 중이면 그 뒤에 새로 읽어서 (미리 읽은 값은 그새 낡았을 수 있음)
  if (running) return running.then(() => syncSettingsOnce(token));
  running = syncSettingsOnce(token, prefetched).finally(() => {
    running = null;
  });
  return running;
}

async function syncSettingsOnce(token: string, prefetched?: string[][]): Promise<boolean> {
  const id = getSheetId();
  if (!id) return false;
  if (!prefetched) await ensureTab(token, SETTINGS_SHEET_NAME);
  const remote = await pullRemote(token, id, prefetched);
  const localStamps = getItemStamps();
  const rStamps = remoteStamps;
  const stamps = mergeStamps(localStamps, rStamps);
  const merged = new Map<SettingKey, Entry>();
  let localChanged = false;
  let remoteChanged = false;
  const changedKeys: string[] = [];

  for (const key of KEYS) {
    const l = readLocal(key);
    const r = remote.get(key) || null;
    let m: Entry | null;
    if (key === 'filament') m = mergeFilament(l, r);
    else if (key === 'expenses') m = mergeExpensesEntry(l, r);
    else if (key === 'deletedOrders') {
      const parse = (e: Entry | null) => {
        try {
          return normalizeDeleted(e ? JSON.parse(e.json || '{}') : {});
        } catch {
          return {};
        }
      };
      m = !l && !r ? null : { json: JSON.stringify(mergeDeleted(parse(r), parse(l))), updatedAt: Math.max(l?.updatedAt || 0, r?.updatedAt || 0) };
    }
    else if (!l) m = r;
    else if (!r) m = l;
    else if (ITEM_KEYS.includes(key) && l.json !== r.json) {
      // 항목 단위 병합: 두 기기에서 서로 다른 제품을 고쳐도 둘 다 살아남음
      m = {
        json: mergeItems(key, l, r, stamps[key] || {}, localStamps[key] || {}, rStamps[key] || {}),
        updatedAt: Math.max(l.updatedAt, r.updatedAt),
      };
    } else m = l.updatedAt > r.updatedAt ? l : r; // tie → remote (first pusher) wins
    if (!m) continue;
    merged.set(key, m);
    if (!l || l.json !== m.json) {
      writeLocal(key, m);
      localChanged = true;
    } else if (l.updatedAt !== m.updatedAt) {
      setSettingMeta(key, m.updatedAt);
    }
    if (!r || r.json !== m.json || r.updatedAt !== m.updatedAt) {
      remoteChanged = true;
      changedKeys.push(key);
    }
  }

  if (JSON.stringify(stamps) !== JSON.stringify(rStamps)) {
    remoteChanged = true;
    changedKeys.push(STAMPS_ROW);
  }
  setItemStamps(stamps);
  if (remoteChanged) await pushRemote(token, id, merged, stamps, changedKeys);
  if (localChanged) {
    try {
      window.dispatchEvent(new CustomEvent(SETTINGS_APPLIED_EVENT));
    } catch {
      /* ignore */
    }
  }
  return localChanged;
}
