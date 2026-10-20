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
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message || res.statusText || `HTTP ${res.status}`;
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

function orderToRow(o: Order): string[] {
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
      s: o.seq,
      d: o.doneMap,
      p: o.prices,
      g: o.filamentGrams,
      x: { a: o.amount, pd: o.paid ? 1 : undefined, pa: o.paidAt, fg: o.filamentG, fa: o.filamentAt, fu: o.filamentUse, fp: o.filamentPick },
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

function rowToOrder(row: string[], sheetMisaligned = false): Order | null {
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
  // R 열 id 가 다르거나(밀림), 시트에 밀린 행이 있는데 R 이 비어 있으면 L~R 열은 믿지 않음
  if ((rid !== null && rid !== id) || (rid === null && sheetMisaligned)) {
    return { ...base, _partial: true };
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
      if (fp) out.filamentPick = fp;
      else delete out.filamentPick;
    }
  } catch {
    /* ignore */
  }
  for (const k of Object.keys(out) as (keyof Order)[]) if (out[k] === undefined) delete out[k];
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

function parseProgressCol(raw: string | undefined, id: string): Pick<Order, 'seq' | 'doneMap' | 'prices' | 'filamentGrams'> {
  const t = String(raw ?? '').trim();
  if (!t) return {};
  try {
    const j = JSON.parse(t) as { i?: unknown; s?: unknown; d?: unknown; p?: unknown; g?: unknown };
    if (j.i !== id) return {};
    const out: Pick<Order, 'seq' | 'doneMap' | 'prices' | 'filamentGrams'> = {};
    if (typeof j.s === 'number' && j.s > 0) out.seq = j.s;
    const d = numMap(j.d);
    if (d) out.doneMap = d;
    const pr = numMap(j.p);
    if (pr) out.prices = pr;
    const g = numMap(j.g);
    if (g) out.filamentGrams = g;
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

/** Ensure "Orders" tab exists; create with headers if missing. */
export async function ensureOrdersSheet(accessToken: string): Promise<void> {
  const spreadsheetId = sheetIdOrThrow();
  const metaRes = await sheetsFetch(
    accessToken,
    `${spreadsheetId}?fields=sheets.properties.title`,
  );
  if (!metaRes.ok) {
    throw new Error(`스프레드시트를 열 수 없습니다: ${await readError(metaRes)}`);
  }
  const meta = (await metaRes.json()) as {
    sheets?: { properties?: { title?: string } }[];
  };
  const titles = (meta.sheets || []).map((s) => s.properties?.title || '');
  if (titles.includes(ORDERS_SHEET_NAME)) return;

  const createRes = await sheetsFetch(accessToken, `${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: ORDERS_SHEET_NAME } } }],
    }),
  });
  if (!createRes.ok) {
    throw new Error(`Orders 탭 생성 실패: ${await readError(createRes)}`);
  }

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
  const values = data.values || [];
  if (values.length === 0) return [];

  const start = values[0]?.[0] === 'id' ? 1 : 0;
  const rows = values.slice(start).map((r) => r.map((c) => String(c ?? '')));
  // 한 행이라도 R 열 id 가 자기 id 와 다르면, 옛 버전이 일부 열만 다시 써서 L~R 열이 밀린 시트
  const misaligned = rows.some((r) => {
    const rid = progressId(r[17]);
    return rid !== null && rid !== (r[0] || '').trim();
  });
  const orders: Order[] = [];
  for (const r of rows) {
    const order = rowToOrder(r, misaligned);
    if (order) orders.push(order);
  }
  return orders;
}

/** Replace entire Orders sheet with header + rows (source of truth write-through). */
export async function pushOrders(accessToken: string, orders: Order[]): Promise<void> {
  await ensureOrdersSheet(accessToken);
  const spreadsheetId = sheetIdOrThrow();
  const range = encodeURIComponent(`${ORDERS_SHEET_NAME}!A:Z`);

  const clearRes = await sheetsFetch(accessToken, `${spreadsheetId}/values/${range}:clear`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!clearRes.ok) {
    throw new Error(`시트 비우기 실패: ${await readError(clearRes)}`);
  }

  const values = [[...ORDERS_HEADERS], ...orders.map(orderToRow)];
  const updateRes = await sheetsFetch(
    accessToken,
    `${spreadsheetId}/values/${encodeURIComponent(`${ORDERS_SHEET_NAME}!A1`)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      body: JSON.stringify({ values }),
    },
  );
  if (!updateRes.ok) {
    throw new Error(`시트 쓰기 실패: ${await readError(updateRes)}`);
  }
}

/** 시트 L~R 열에 해당하는 주문 필드 */
const DETAIL_KEYS = ['amount', 'paid', 'paidAt', 'filamentG', 'filamentAt', 'filamentUse', 'filamentPick', 'seq', 'doneMap', 'prices', 'filamentGrams'] as const;

function stripPartial(o: Order): Order {
  if (!o._partial) return o;
  const r = { ...o };
  delete r._partial;
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
    if (o.updatedAt < existing.updatedAt) continue;
    const next: Order = stripPartial({ ...o });
    const rec = next as unknown as Record<string, unknown>;
    const ex = existing as unknown as Record<string, unknown>;
    if (o._partial) {
      for (const k of DETAIL_KEYS) {
        if (ex[k] !== undefined) rec[k] = ex[k];
        else delete rec[k];
      }
    } else if (o.updatedAt === existing.updatedAt) {
      for (const k of DETAIL_KEYS) if (rec[k] === undefined && ex[k] !== undefined) rec[k] = ex[k];
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
