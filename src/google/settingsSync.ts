import { getSheetId } from './config';
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
const KEYS: SettingKey[] = ['products', 'sources', 'sms', 'filament', 'production', 'expenses', 'deletedOrders'];

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
  throw new Error(`${what}: ${msg}`);
}

async function ensureSheet(token: string, id: string): Promise<void> {
  const meta = await check(await req(token, `${id}?fields=sheets.properties.title`), '설정 탭 확인 실패');
  const data = (await meta.json()) as { sheets?: { properties?: { title?: string } }[] };
  if ((data.sheets || []).some((s) => s.properties?.title === SETTINGS_SHEET_NAME)) return;
  await check(
    await req(token, `${id}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SETTINGS_SHEET_NAME } } }] }),
    }),
    '설정 탭 생성 실패',
  );
}

const STAMPS_ROW = 'itemStamps';
let remoteStamps: ItemStamps = {};

async function pullRemote(token: string, id: string): Promise<Map<SettingKey, Entry>> {
  const range = encodeURIComponent(`${SETTINGS_SHEET_NAME}!A:C`);
  const res = await check(await req(token, `${id}/values/${range}`), '설정 읽기 실패');
  const data = (await res.json()) as { values?: string[][] };
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

async function pushRemote(token: string, id: string, map: Map<SettingKey, Entry>, stamps: ItemStamps): Promise<void> {
  const range = encodeURIComponent(`${SETTINGS_SHEET_NAME}!A:C`);
  await check(await req(token, `${id}/values/${range}:clear`, { method: 'POST', body: '{}' }), '설정 비우기 실패');
  const values = [HEADERS, ...KEYS.filter((k) => map.has(k)).map((k) => [k, map.get(k)!.json, String(map.get(k)!.updatedAt)]), [STAMPS_ROW, JSON.stringify(stamps), String(Date.now())]];
  await check(
    await req(token, `${id}/values/${encodeURIComponent(`${SETTINGS_SHEET_NAME}!A1`)}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ values }),
    }),
    '설정 쓰기 실패',
  );
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
export function syncSettings(token: string): Promise<boolean> {
  if (running) return running.then(() => syncSettingsOnce(token));
  running = syncSettingsOnce(token).finally(() => {
    running = null;
  });
  return running;
}

async function syncSettingsOnce(token: string): Promise<boolean> {
  const id = getSheetId();
  if (!id) return false;
  await ensureSheet(token, id);
  const remote = await pullRemote(token, id);
  const localStamps = getItemStamps();
  const rStamps = remoteStamps;
  const stamps = mergeStamps(localStamps, rStamps);
  const merged = new Map<SettingKey, Entry>();
  let localChanged = false;
  let remoteChanged = false;

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
    if (!r || r.json !== m.json || r.updatedAt !== m.updatedAt) remoteChanged = true;
  }

  if (JSON.stringify(stamps) !== JSON.stringify(rStamps)) remoteChanged = true;
  setItemStamps(stamps);
  if (remoteChanged) await pushRemote(token, id, merged, stamps);
  if (localChanged) {
    try {
      window.dispatchEvent(new CustomEvent(SETTINGS_APPLIED_EVENT));
    } catch {
      /* ignore */
    }
  }
  return localChanged;
}
