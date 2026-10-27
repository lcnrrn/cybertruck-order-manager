/** Per-key "last edited" timestamps for synced device settings (products, sources, SMS, filament). */
const META_KEY = 'cybertruck-settings-meta-v1';
export const SETTINGS_CHANGED_EVENT = 'cybertruck-settings-changed';
export const SETTINGS_APPLIED_EVENT = 'cybertruck-settings-applied';

export type SettingKey = 'products' | 'sources' | 'sms' | 'filament' | 'production' | 'expenses' | 'deletedOrders' | 'epostRequest' | 'productImages' | 'shop';

export const SETTING_LS_KEYS: Record<SettingKey, string> = {
  products: 'cybertruck-products-v1',
  sources: 'cybertruck-sources-v1',
  sms: 'cybertruck-sms-templates-v1',
  filament: 'cybertruck-filament-v1',
  production: 'cybertruck-production-settings-v1',
  expenses: 'cybertruck-expenses-v1',
  deletedOrders: 'cybertruck-deleted-orders-v1',
  epostRequest: 'cybertruck-epost-request-v1',
  /** 제품 사진 썸네일 {제품명: dataURL} — 설정 탭 'productImages' 행 */
  productImages: 'cybertruck-product-images-v1',
  /** 가게 설정 {bankName, bankNumber, bankHolder, costPerGram …} — 설정 탭 'shop' 행 */
  shop: 'cybertruck-shop-v1',
};

export function getSettingsMeta(): Partial<Record<SettingKey, number>> {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) return JSON.parse(raw) as Partial<Record<SettingKey, number>>;
  } catch {
    /* ignore */
  }
  return {};
}

export function setSettingMeta(key: SettingKey, at: number): void {
  try {
    const m = getSettingsMeta();
    m[key] = at;
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

/** Call after a user edit is persisted to localStorage. */
export function markSettingChanged(key: SettingKey): void {
  const now = Date.now();
  setSettingMeta(key, now);
  stampItemChanges(key, now);
  try {
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT, { detail: key }));
  } catch {
    /* ignore */
  }
}

/* ───────── 항목별 수정 시각 (제품·경로·문자·제작설정) ─────────
 * 설정 한 덩어리를 통째로 덮어쓰지 않고, 항목(제품 1개, 경로 1개, 문자 1종류)마다
 * "언제 바뀌었는지/지웠는지"를 기록해서 두 기기 수정이 섞여도 각자 최신 항목이 살아남게 함.
 */
export type ItemStamp = { u: number; d?: true };
export type ItemStamps = Partial<Record<SettingKey, Record<string, ItemStamp>>>;
export const ITEM_KEYS: SettingKey[] = ['products', 'sources', 'sms', 'production', 'productImages', 'shop'];
const STAMPS_KEY = 'cybertruck-item-stamps-v1';
const SNAP_KEY = 'cybertruck-settings-snap-v1';

export function getItemStamps(): ItemStamps {
  try {
    const raw = localStorage.getItem(STAMPS_KEY);
    if (raw) return JSON.parse(raw) as ItemStamps;
  } catch {
    /* ignore */
  }
  return {};
}

export function setItemStamps(s: ItemStamps): void {
  try {
    localStorage.setItem(STAMPS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** 설정 JSON → {항목id: 값(JSON 문자열)} */
export function itemsOf(key: SettingKey, json: string): Map<string, string> {
  const m = new Map<string, string>();
  if (!json) return m;
  try {
    const v = JSON.parse(json) as unknown;
    if (Array.isArray(v)) {
      for (const x of v) {
        if (typeof x === 'string') m.set(x, JSON.stringify(x));
        else if (x && typeof x === 'object' && typeof (x as { name?: unknown }).name === 'string') m.set((x as { name: string }).name, JSON.stringify(x));
      }
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) m.set(k, JSON.stringify(x));
    }
  } catch {
    /* ignore */
  }
  void key;
  return m;
}

function getSnaps(): Partial<Record<SettingKey, string>> {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    if (raw) return JSON.parse(raw) as Partial<Record<SettingKey, string>>;
  } catch {
    /* ignore */
  }
  return {};
}

/** 동기화로 받은 값을 기준점으로 저장 (다음 로컬 수정과 비교용) */
export function setSettingSnapshot(key: SettingKey, json: string): void {
  if (!ITEM_KEYS.includes(key)) return;
  try {
    const s = getSnaps();
    s[key] = json;
    localStorage.setItem(SNAP_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** 로컬 저장 직후: 기준점과 비교해 바뀐/추가/삭제된 항목에 현재 시각 기록 */
export function stampItemChanges(key: SettingKey, now = Date.now()): void {
  if (!ITEM_KEYS.includes(key)) return;
  let cur = '';
  try {
    cur = localStorage.getItem(SETTING_LS_KEYS[key]) || '';
  } catch {
    return;
  }
  const snaps = getSnaps();
  const prev = itemsOf(key, snaps[key] ?? '');
  const next = itemsOf(key, cur);
  const all = getItemStamps();
  const st = { ...(all[key] || {}) };
  for (const [id, v] of next) if (prev.get(id) !== v) st[id] = { u: now };
  for (const id of prev.keys()) if (!next.has(id)) st[id] = { u: now, d: true };
  all[key] = st;
  setItemStamps(all);
  setSettingSnapshot(key, cur);
}

/** 앱 시작 시: 기준점이 없는 설정은 현재 값을 기준점으로 (업데이트 직후 전체가 '방금 수정'으로 찍히지 않게) */
export function initSettingSnapshots(): void {
  const snaps = getSnaps();
  for (const k of ITEM_KEYS) {
    if (snaps[k] !== undefined) continue;
    try {
      setSettingSnapshot(k, localStorage.getItem(SETTING_LS_KEYS[k]) || '');
    } catch {
      /* ignore */
    }
  }
}

/** 두 기기의 항목 시각 합치기 (항목마다 더 늦은 기록) */
export function mergeStamps(a: ItemStamps, b: ItemStamps): ItemStamps {
  const out: ItemStamps = {};
  for (const k of ITEM_KEYS) {
    const m: Record<string, ItemStamp> = { ...(a[k] || {}) };
    for (const [id, s] of Object.entries(b[k] || {})) if (!m[id] || s.u > m[id].u) m[id] = s;
    if (Object.keys(m).length) out[k] = m;
  }
  return out;
}

/**
 * 항목 단위 병합. 같은 항목은 시각이 늦은 쪽, 한쪽에만 있으면 유지(더 늦은 삭제 기록이 있으면 제외).
 * 순서는 설정 전체가 더 최근인 쪽 기준, 나머지는 뒤에 붙임.
 */
export function mergeItems(
  key: SettingKey,
  local: { json: string; updatedAt: number },
  remote: { json: string; updatedAt: number },
  stamps: Record<string, ItemStamp>,
  localStamps: Record<string, ItemStamp>,
  remoteStamps: Record<string, ItemStamp>,
): string {
  const L = itemsOf(key, local.json);
  const R = itemsOf(key, remote.json);
  const primaryIsLocal = local.updatedAt > remote.updatedAt;
  const P = primaryIsLocal ? L : R;
  const S = primaryIsLocal ? R : L;
  const ids = [...P.keys(), ...[...S.keys()].filter((k) => !P.has(k))];
  const pick = new Map<string, string>();
  for (const id of ids) {
    const lv = L.get(id);
    const rv = R.get(id);
    const ls = localStamps[id]?.u || 0;
    const rs = remoteStamps[id]?.u || 0;
    let v: string | undefined;
    if (lv !== undefined && rv !== undefined) v = ls > rs ? lv : rs > ls ? rv : primaryIsLocal ? lv : rv;
    else v = lv ?? rv;
    const st = stamps[id];
    const presentAt = lv !== undefined && rv !== undefined ? Math.max(ls, rs) : lv !== undefined ? ls : rs;
    if (st?.d && st.u >= presentAt) continue; // 더 늦게 지움
    if (v !== undefined) pick.set(id, v);
  }
  let isArray = false;
  let isStrArray = false;
  try {
    const pv = JSON.parse((primaryIsLocal ? local.json : remote.json) || (primaryIsLocal ? remote.json : local.json) || 'null');
    isArray = Array.isArray(pv);
    isStrArray = isArray && pv.every((x: unknown) => typeof x === 'string');
  } catch {
    /* ignore */
  }
  const vals = [...pick.entries()];
  if (isArray) return JSON.stringify(vals.map(([id, v]) => (isStrArray ? id : JSON.parse(v))));
  return JSON.stringify(Object.fromEntries(vals.map(([id, v]) => [id, JSON.parse(v)])));
}
