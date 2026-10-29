import { BUILD_ID } from '../appVersion';
import { mergeShipments, parseShipments } from '../shipments';
import { numMap, strMap } from '../storage';
import type { Order, OrderStatus } from '../types';
import { isSampleOrderId, isSampleOnly } from '../storage';
import { dropDeleted, loadDeleted } from '../deletedOrders';
import { ORDERS_HEADERS, ORDERS_SHEET_NAME, getSheetId } from './config';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';

function sheetIdOrThrow(): string {
  const id = getSheetId();
  if (!id) throw new Error('스프레드시트 ID가 없습니다. 설정에서 Sheet ID를 입력해 주세요.');
  return id;
}

async function sheetsFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(`${API}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  return res;
}

async function readError(res: Response): Promise<string> {
  let msg: string;
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    msg = body.error?.message || res.statusText || `HTTP ${res.status}`;
  } catch {
    msg = res.statusText || `HTTP ${res.status}`;
  }
  // 429(읽기/쓰기 한도)·503 은 잠깐 기다렸다 다시 하면 되는 오류 → 표시해서 자동 재시도
  if (res.status === 429 || res.status === 503) msg += ` [HTTP ${res.status}]`;
  return msg;
}

/** 구글 시트 한도 초과(429)·일시 장애 — 잠깐 뒤 다시 하면 되는 오류 */
export function isQuotaError(msg: string): boolean {
  return /\[HTTP (429|503)\]|quota exceeded|rate ?limit|RESOURCE_EXHAUSTED|too many requests|currently unavailable/i.test(msg);
}

/**
 * 탭 목록(제목 → gid) — 앱을 켜 있는 동안 한 번만 읽음 (매 동기화마다 읽지 않음).
 * 탭이 없다고 나오면 그때만 다시 읽어 확인.
 */
let metaCache: { id: string; tabs: Map<string, number> } | null = null;
export function invalidateSheetMeta(): void {
  metaCache = null;
}
export async function getSheetTabs(accessToken: string, force = false): Promise<Map<string, number>> {
  const spreadsheetId = sheetIdOrThrow();
  if (!force && metaCache && metaCache.id === spreadsheetId) return metaCache.tabs;
  const metaRes = await sheetsFetch(accessToken, `${spreadsheetId}?fields=sheets.properties(sheetId,title)`);
  if (!metaRes.ok) throw new Error(`스프레드시트를 열 수 없습니다: ${await readError(metaRes)}`);
  const meta = (await metaRes.json()) as { sheets?: { properties?: { sheetId?: number; title?: string } }[] };
  const tabs = new Map<string, number>();
  for (const s of meta.sheets || []) if (s.properties?.title) tabs.set(s.properties.title, s.properties.sheetId ?? 0);
  metaCache = { id: spreadsheetId, tabs };
  return tabs;
}

/** 탭이 있는지 확인(캐시), 없으면 만들기. 만들었으면 true */
export async function ensureTab(accessToken: string, title: string): Promise<boolean> {
  let tabs = await getSheetTabs(accessToken);
  if (tabs.has(title)) return false;
  tabs = await getSheetTabs(accessToken, true);
  if (tabs.has(title)) return false;
  const spreadsheetId = sheetIdOrThrow();
  const createRes = await sheetsFetch(accessToken, `${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
  });
  invalidateSheetMeta();
  if (!createRes.ok) throw new Error(`${title} 탭 생성 실패: ${await readError(createRes)}`);
  return true;
}

/** 여러 범위를 읽기 요청 1번으로 (values.batchGet) */
export async function batchRead(accessToken: string, ranges: string[]): Promise<string[][][]> {
  const spreadsheetId = sheetIdOrThrow();
  const q = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
  const res = await sheetsFetch(accessToken, `${spreadsheetId}/values:batchGet?${q}`);
  if (!res.ok) throw new Error(`시트 읽기 실패: ${await readError(res)}`);
  const data = (await res.json()) as { valueRanges?: { values?: unknown[][] }[] };
  return ranges.map((_, i) => (data.valueRanges?.[i]?.values || []).map((r) => (r || []).map((c) => String(c ?? ''))));
}

export function orderToRow(o: Order): string[] {
  return [
    o.id,
    o.name,
    o.items,
    o.address,
    o.phone,
    o.group || '',
    o.status,
    o.priority ? 'true' : 'false',
    String(o.updatedAt),
    String(o.createdAt),
    o.trackingNumber || '',
    o.amount !== undefined ? String(o.amount) : '',
    o.paid ? 'true' : '',
    o.paidAt ? String(o.paidAt) : '',
    o.filamentG !== undefined ? String(o.filamentG) : '',
    o.filamentAt ? String(o.filamentAt) : '',
    o.filamentUse || o.filamentPick
      ? JSON.stringify({ u: o.filamentUse, p: o.filamentPick })
      : '',
    // R: 항상 기록. id + L~Q 열 사본까지 넣어서, 옛 버전 앱이 A~K 만 다시 써서 L~R 열이 다른 행으로 밀려도
    //    엉뚱한 주문에 붙지 않고(id 확인) 원래 값을 되살릴 수 있게 함
    JSON.stringify({
      i: o.id,
      v: 2, // v2: 이 행의 세부값(제작 체크 등)은 완전한 값 — 비어 있으면 진짜 비어 있음
      s: o.seq,
      d: o.doneMap,
      p: o.prices,
      g: o.filamentGrams,
      sh: o.shipments?.length ? o.shipments : undefined,
      x: { a: o.amount, pd: o.paid ? 1 : undefined, pa: o.paidAt, fg: o.filamentG, fa: o.filamentAt, fu: o.filamentUse, fp: o.filamentPick, fb: o.filamentBase },
    }),
  ];
}

function parseStatus(raw: string): OrderStatus {
  if (raw === '제작중' || raw === '완료' || raw === '대기') return raw;
  return '대기';
}

/** R 열의 id. 비어 있으면 null */
function progressId(raw: string | undefined): string | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  try {
    const j = JSON.parse(t) as { i?: unknown };
    return typeof j.i === 'string' ? j.i : '';
  } catch {
    return '';
  }
}

export function rowToOrder(row: string[], sheetMisaligned = false): Order | null {
  const id = (row[0] || '').trim();
  if (!id || id === 'id') return null;
  const updatedAt = Number(row[8]) || Date.now();
  const createdAt = Number(row[9]) || updatedAt;
  const tracking = (row[10] || '').trim();
  const base: Order = {
    id,
    name: row[1] || '이름없음',
    items: row[2] || '',
    address: row[3] || '',
    phone: row[4] || '',
    group: row[5]?.trim() || undefined,
    status: parseStatus(row[6] || ''),
    priority: String(row[7]).toLowerCase() === 'true' || row[7] === '1',
    updatedAt,
    createdAt,
    trackingNumber: tracking || undefined,
  };
  const rid = progressId(row[17]);
  // R 열 id 가 다르거나(밀림), R 이 비어 있으면(옛 버전 앱이 A~K 만 씀) L~R 열은 믿지 않음 → 로컬 세부값 유지
  void sheetMisaligned;
  if (rid !== id) {
    return { ...base, _partial: true };
  }
  let legacy = false;
  try {
    legacy = (JSON.parse(row[17]) as { v?: unknown }).v !== 2;
  } catch {
    legacy = true;
  }
  const out: Order = {
    ...base,
    amount: optNum(row[11]),
    paid: String(row[12] || '').toLowerCase() === 'true' || undefined,
    paidAt: optNum(row[13]),
    filamentG: optNum(row[14]),
    filamentAt: optNum(row[15]),
    ...parseFilamentCol(row[16]),
    ...parseProgressCol(row[17], id),
  };
  // R 안의 L~Q 사본이 있으면 그걸 기준으로 (가장 정확)
  try {
    const x = rid === id ? (JSON.parse(row[17]) as { x?: Record<string, unknown> }).x : undefined;
    if (x && typeof x === 'object') {
      const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
      out.amount = n(x.a);
      out.paid = x.pd ? true : undefined;
      out.paidAt = n(x.pa);
      out.filamentG = n(x.fg);
      out.filamentAt = n(x.fa);
      const fu = numMap(x.fu);
      const fp = strMap(x.fp);
      if (fu) out.filamentUse = fu;
      else delete out.filamentUse;
      const fb = numMap(x.fb);
      if (fb) out.filamentBase = fb;
      else delete out.filamentBase;
      if (fp) out.filamentPick = fp;
      else delete out.filamentPick;
    }
  } catch {
    /* ignore */
  }
  for (const k of Object.keys(out) as (keyof Order)[]) if (out[k] === undefined) delete out[k];
  if (legacy) out._legacy = true;
  return out;
}

function parseFilamentCol(raw: string | undefined): Pick<Order, 'filamentUse' | 'filamentPick'> {
  const t = String(raw ?? '').trim();
  if (!t) return {};
  try {
    const j = JSON.parse(t) as { u?: unknown; p?: unknown };
    const out: Pick<Order, 'filamentUse' | 'filamentPick'> = {};
    const u = numMap(j.u);
    const p = strMap(j.p);
    if (u) out.filamentUse = u;
    if (p) out.filamentPick = p;
    return out;
  } catch {
    return {};
  }
}

function parseProgressCol(raw: string | undefined, id: string): Pick<Order, 'seq' | 'doneMap' | 'prices' | 'filamentGrams' | 'shipments'> {
  const t = String(raw ?? '').trim();
  if (!t) return {};
  try {
    const j = JSON.parse(t) as { i?: unknown; s?: unknown; d?: unknown; p?: unknown; g?: unknown; sh?: unknown };
    if (j.i !== id) return {};
    const out: Pick<Order, 'seq' | 'doneMap' | 'prices' | 'filamentGrams' | 'shipments'> = {};
    if (typeof j.s === 'number' && j.s > 0) out.seq = j.s;
    const d = numMap(j.d);
    if (d) out.doneMap = d;
    const pr = numMap(j.p);
    if (pr) out.prices = pr;
    const g = numMap(j.g);
    if (g) out.filamentGrams = g;
    const sh = parseShipments(j.sh);
    if (sh) out.shipments = sh;
    return out;
  } catch {
    return {};
  }
}

function optNum(raw: string | undefined): number | undefined {
  const t = String(raw ?? '').replace(/,/g, '').trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** Ensure "Orders" tab exists; create with headers if missing. (탭 목록은 캐시 — 평소엔 읽기 0번) */
export async function ensureOrdersSheet(accessToken: string): Promise<void> {
  const created = await ensureTab(accessToken, ORDERS_SHEET_NAME);
  if (!created) return;
  const spreadsheetId = sheetIdOrThrow();
  const headerRes = await sheetsFetch(
    accessToken,
    `${spreadsheetId}/values/${encodeURIComponent(`${ORDERS_SHEET_NAME}!A1`)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      body: JSON.stringify({ values: [[...ORDERS_HEADERS]] }),
    },
  );
  if (!headerRes.ok) {
    throw new Error(`헤더 쓰기 실패: ${await readError(headerRes)}`);
  }
}

export async function pullOrders(accessToken: string): Promise<Order[]> {
  await ensureOrdersSheet(accessToken);
  const spreadsheetId = sheetIdOrThrow();
  const range = encodeURIComponent(`${ORDERS_SHEET_NAME}!A:R`);
  const res = await sheetsFetch(accessToken, `${spreadsheetId}/values/${range}`);
  if (!res.ok) {
    throw new Error(`시트 읽기 실패: ${await readError(res)}`);
  }
  const data = (await res.json()) as { values?: string[][] };
  return parseOrdersValues(data.values || []);
}

/** Orders!A:R 값 → 주문 목록 (batchGet 결과에도 씀) */
export function parseOrdersValues(values: string[][]): Order[] {
  if (values.length === 0) return [];

  const start = values[0]?.[0] === 'id' ? 1 : 0;
  const rows = values.slice(start).map((r) => r.map((c) => String(c ?? '')));
  // 한 행이라도 R 열 id 가 자기 id 와 다르면, 옛 버전이 일부 열만 다시 써서 L~R 열이 밀린 시트
  const fixed = realignRows(rows);
  const misaligned = fixed.some((r) => {
    const rid = progressId(r[17]);
    return rid !== null && rid !== (r[0] || '').trim();
  });
  const orders: Order[] = [];
  for (const r of fixed) {
    const order = rowToOrder(r, misaligned);
    if (order) orders.push(order);
  }
  return orders;
}

/**
 * 옛 버전 앱이 A~K 열만 자기 순서로 다시 쓰면 L~R 열이 다른 주문 행에 남음(밀림).
 * R 열 JSON 에 주문 id 가 있으니, id 로 L~R 을 제 주인 행에 다시 붙임 → 입금·체크·발송이 사라지지 않음.
 */
export function realignRows(rows: string[][]): string[][] {
  const owner = new Map<string, string[]>();
  for (const r of rows) {
    const rid = progressId(r[17]);
    if (rid) owner.set(rid, r);
  }
  return rows.map((r) => {
    const id = (r[0] || '').trim();
    if (!id || progressId(r[17]) === id) return r;
    const src = owner.get(id);
    if (!src) return r; // 이 주문의 R 이 시트에 없음 → rowToOrder 가 partial 처리(로컬 세부값 유지)
    const out = r.slice(0, 11);
    while (out.length < 11) out.push('');
    for (let i = 11; i <= 17; i++) out.push(src[i] ?? '');
    return out;
  });
}

/** A 열(id) → 시트 행 번호들 (1부터, 머리글=1). 같은 id 가 여러 행이면 모두 */
async function readIdRows(accessToken: string, spreadsheetId: string): Promise<{ rows: Map<string, number[]>; count: number }> {
  const res = await sheetsFetch(accessToken, `${spreadsheetId}/values/${encodeURIComponent(`${ORDERS_SHEET_NAME}!A:A`)}`);
  if (!res.ok) throw new Error(`시트 읽기 실패: ${await readError(res)}`);
  const data = (await res.json()) as { values?: string[][] };
  const rows = new Map<string, number[]>();
  const vals = data.values || [];
  vals.forEach((r, i) => {
    const id = String(r?.[0] ?? '').trim();
    if (!id || id === 'id') return;
    rows.set(id, [...(rows.get(id) || []), i + 1]);
  });
  return { rows, count: vals.length };
}

/**
 * 고친 주문만 그 행에 씀 (id 로 행을 찾음, 없으면 맨 아래 추가). 다른 주문 행은 절대 건드리지 않음.
 * 쓰기 직전에 A 열을 다시 읽어서 행 위치가 바뀌었어도 정확한 행에 씀.
 */
export async function patchOrders(accessToken: string, orders: Order[]): Promise<{ updated: number; appended: number }> {
  if (!orders.length) return { updated: 0, appended: 0 };
  await ensureOrdersSheet(accessToken);
  const spreadsheetId = sheetIdOrThrow();
  const { rows, count } = await readIdRows(accessToken, spreadsheetId);
  const data: { range: string; values: string[][] }[] = [];
  const append: string[][] = [];
  for (const o of orders) {
    const at = rows.get(o.id);
    const row = orderToRow(o);
    if (at?.length) for (const n of at) data.push({ range: `${ORDERS_SHEET_NAME}!A${n}:R${n}`, values: [row] });
    else append.push(row);
  }
  if (count === 0) data.unshift({ range: `${ORDERS_SHEET_NAME}!A1:R1`, values: [[...ORDERS_HEADERS]] });
  if (data.length) {
    const res = await sheetsFetch(accessToken, `${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'RAW', data }),
    });
    if (!res.ok) throw new Error(`시트 쓰기 실패: ${await readError(res)}`);
  }
  if (append.length) {
    const res = await sheetsFetch(
      accessToken,
      `${spreadsheetId}/values/${encodeURIComponent(`${ORDERS_SHEET_NAME}!A:R`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: append }) },
    );
    if (!res.ok) throw new Error(`시트 추가 실패: ${await readError(res)}`);
  }
  // S1: 마지막으로 쓴 기기·빌드
  try {
    const who = JSON.stringify({ at: Date.now(), build: BUILD_ID, ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : '', mode: 'patch', rows: orders.map((o) => o.name).slice(0, 10), n: orders.length });
    await sheetsFetch(accessToken, `${spreadsheetId}/values/${encodeURIComponent(`${ORDERS_SHEET_NAME}!S1`)}?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values: [[who]] }) });
  } catch {
    /* ignore */
  }
  return { updated: data.length, appended: append.length };
}

/** 시트 L~R 열에 해당하는 주문 필드 */
const DETAIL_KEYS = ['amount', 'paid', 'paidAt', 'filamentG', 'filamentAt', 'filamentUse', 'filamentBase', 'filamentPick', 'seq', 'doneMap', 'prices', 'filamentGrams', 'shipments'] as const;

function stripPartial(o: Order): Order {
  if (!o._partial && !o._legacy) return o;
  const r = { ...o };
  delete r._partial;
  delete r._legacy;
  return r;
}

/**
 * 주문별 병합: updatedAt 이 더 큰 쪽.
 * - 시각이 같으면 같은 수정이므로, 한쪽에만 있는 세부값(제작 체크·단가 등)은 지우지 않고 합침
 * - 시트 행이 밀려서 세부값을 믿을 수 없으면(_partial) 세부값은 로컬 것 유지
 */
export function mergeByUpdatedAt(local: Order[], remote: Order[]): Order[] {
  const map = new Map<string, Order>();
  for (const o of local) map.set(o.id, o);
  for (const o of remote) {
    const existing = map.get(o.id);
    if (!existing) {
      map.set(o.id, stripPartial(o));
      continue;
    }
    if (o.updatedAt < existing.updatedAt) {
      if (!o._partial && o.shipments?.length) {
        const sh = mergeShipments(existing.shipments, o.shipments);
        if (JSON.stringify(sh) !== JSON.stringify(existing.shipments)) map.set(o.id, { ...existing, shipments: sh });
      }
      continue;
    }
    const next: Order = stripPartial({ ...o });
    const rec = next as unknown as Record<string, unknown>;
    const ex = existing as unknown as Record<string, unknown>;
    if (o._partial) {
      for (const k of DETAIL_KEYS) {
        if (ex[k] !== undefined) rec[k] = ex[k];
        else delete rec[k];
      }
    } else if (o.updatedAt === existing.updatedAt) {
      // 같은 수정 시각: 시트에 빠진 세부값(제작 체크·단가 등)은 이 기기 값으로 채움 (더 옛 값으로는 채우지 않음)
      for (const k of DETAIL_KEYS) if (rec[k] === undefined && ex[k] !== undefined) rec[k] = ex[k];
    }
    if (!o._partial) {
      const sh = mergeShipments(next.shipments, existing.shipments);
      if (sh) next.shipments = sh;
    }
    map.set(o.id, next);
  }
  return Array.from(map.values()).map(stripPartial);
}

/**
 * Sync-aware merge:
 * - If local is empty / demo-only and remote has real rows → prefer remote (drop samples).
 * - Otherwise merge by updatedAt.
 */
export function mergeOrdersForSync(local: Order[], remote: Order[], deleted = loadDeleted()): Order[] {
  return dropDeleted(mergeOrdersRaw(local, remote), deleted);
}

function mergeOrdersRaw(local: Order[], remote: Order[]): Order[] {
  const remoteReal = remote.filter((o) => !isSampleOrderId(o.id));
  const localEmptyOrSample = local.length === 0 || isSampleOnly(local);

  if (localEmptyOrSample && remoteReal.length > 0) {
    return remoteReal.map(stripPartial);
  }

  if (local.length === 0 && remote.length > 0) {
    return remote.map(stripPartial);
  }

  return mergeByUpdatedAt(local, remote);
}

/**
 * Guard against wiping a non-empty sheet with empty or demo-only local data.
 * `knownRemoteCount` is from the last successful pull (-1 = unknown).
 */
export function canPushLocalOverRemote(
  local: Order[],
  knownRemoteCount: number,
): { ok: true } | { ok: false; reason: string } {
  if (knownRemoteCount > 0 && local.length === 0) {
    return {
      ok: false,
      reason: '로컬 주문이 비어 있어 시트를 덮어쓰지 않았습니다.',
    };
  }
  if (knownRemoteCount > 0 && isSampleOnly(local)) {
    return {
      ok: false,
      reason: '샘플 주문으로 시트를 덮어쓰지 않았습니다. 동기화를 다시 눌러 주세요.',
    };
  }
  return { ok: true };
}

/**
 * 지운 주문(deletedOrders 에 있고, 삭제 뒤 다시 고쳐지지 않은 것)의 시트 행을 실제로 지움.
 * 지우기 직전 A 열을 다시 읽어 id 로 행 번호를 찾고, 아래 행부터 지워서 다른 행 번호가 밀리지 않게 함.
 * 한 번에 최대 5행, 지운 뒤 다시 읽어서 확인.
 */
export async function purgeDeletedRows(accessToken: string, ids: string[]): Promise<number> {
  const want = Array.from(new Set(ids.filter((x) => x && !isSampleOrderId(x)))).slice(0, 5);
  if (!want.length) return 0;
  const spreadsheetId = sheetIdOrThrow();
  const gid = (await getSheetTabs(accessToken)).get(ORDERS_SHEET_NAME);
  if (gid === undefined) return 0;
  const { rows } = await readIdRows(accessToken, spreadsheetId);
  const targets: number[] = [];
  for (const id of want) for (const n of rows.get(id) || []) if (n > 1) targets.push(n);
  if (!targets.length) return 0;
  targets.sort((a, b) => b - a); // 아래 행부터
  const res = await sheetsFetch(accessToken, `${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: targets.map((n) => ({ deleteDimension: { range: { sheetId: gid, dimension: 'ROWS', startIndex: n - 1, endIndex: n } } })),
    }),
  });
  if (!res.ok) throw new Error(`지운 주문 행 정리 실패: ${await readError(res)}`);
  const after = await readIdRows(accessToken, spreadsheetId);
  const left = want.filter((id) => after.rows.has(id));
  if (left.length) throw new Error(`지운 주문 행이 아직 남아 있어요: ${left.join(', ')}`);
  return targets.length;
}
