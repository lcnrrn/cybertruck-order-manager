import type { Order, OrderStatus } from '../types';
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
  ];
}

function parseStatus(raw: string): OrderStatus {
  if (raw === '제작중' || raw === '완료' || raw === '대기') return raw;
  return '대기';
}

function rowToOrder(row: string[]): Order | null {
  const id = (row[0] || '').trim();
  if (!id || id === 'id') return null;
  const updatedAt = Number(row[8]) || Date.now();
  const createdAt = Number(row[9]) || updatedAt;
  return {
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
  };
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
  const range = encodeURIComponent(`${ORDERS_SHEET_NAME}!A:J`);
  const res = await sheetsFetch(accessToken, `${spreadsheetId}/values/${range}`);
  if (!res.ok) {
    throw new Error(`시트 읽기 실패: ${await readError(res)}`);
  }
  const data = (await res.json()) as { values?: string[][] };
  const values = data.values || [];
  if (values.length === 0) return [];

  const start = values[0]?.[0] === 'id' ? 1 : 0;
  const orders: Order[] = [];
  for (let i = start; i < values.length; i++) {
    const order = rowToOrder(values[i].map((c) => String(c ?? '')));
    if (order) orders.push(order);
  }
  return orders;
}

/** Replace entire Orders sheet with header + rows (source of truth write-through). */
export async function pushOrders(accessToken: string, orders: Order[]): Promise<void> {
  await ensureOrdersSheet(accessToken);
  const spreadsheetId = sheetIdOrThrow();
  const range = encodeURIComponent(`${ORDERS_SHEET_NAME}!A:J`);

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

/** Merge by id: keep the row with newer updatedAt. */
export function mergeByUpdatedAt(local: Order[], remote: Order[]): Order[] {
  const map = new Map<string, Order>();
  for (const o of local) map.set(o.id, o);
  for (const o of remote) {
    const existing = map.get(o.id);
    if (!existing || o.updatedAt >= existing.updatedAt) {
      map.set(o.id, o);
    }
  }
  return Array.from(map.values());
}
