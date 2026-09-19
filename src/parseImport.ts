import type { Order } from './types';
import { stripItemPrices } from './products';

/** Korean phone (01x…) — capture then strip from line. */
const PHONE_RE = /(01[0-9][-.\s]?\d{3,4}[-.\s]?\d{4})/;

/**
 * Earliest index where a Korean street address likely begins.
 * Cues: 시/군/구 (+ 로/길/동/읍/면/아파트…) or numbered 로/길 / N동 N호.
 */
function findAddressStart(text: string): number {
  const patterns: RegExp[] = [
    // 부산시 동래구 … / 서울특별시 강남구 …
    /[가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도)?\s*[가-힣]+[시군구](?:\s|[가-힣0-9])/,
    // …시/군/구 + 로/길/동/읍/면
    /[가-힣]+[시군구]\s+[가-힣0-9\-]+(?:로|길|동|읍|면|가)/,
    // 사직로80 / ○○길12
    /[가-힣0-9]+(?:로|길)\s*\d+/,
    // ○○아파트 (often after street)
    /[가-힣0-9]+아파트/,
    // 115동 1403호
    /\d+\s*동\s*\d+\s*호/,
  ];

  let best = -1;
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m.index !== undefined) {
      if (best < 0 || m.index < best) best = m.index;
    }
  }
  return best;
}

function cleanSeg(s: string): string {
  return s.replace(/^[/|·\s\-–—]+|[/|·\s\-–—]+$/g, '').trim();
}

/**
 * Reminders 스타일 한 줄 파싱 (best-effort)
 * 예: `이름 - 주문 / 주소 01012345678`
 *     `김민수 / 사이드미러 / 서울시 강남구 ... / 010-1234-5678`
 *
 * Does NOT split every `/` into name/items/address — products stay in items;
 * address is detected via Korean address cues.
 */
export function parseReminderLine(line: string): Partial<Order> | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // 1) Phone first
  const phoneMatch = trimmed.match(PHONE_RE);
  const phone = phoneMatch
    ? phoneMatch[1].replace(/[-.\s]/g, '')
    : '';

  let rest = trimmed;
  if (phoneMatch) {
    rest = trimmed.replace(phoneMatch[0], '').trim();
  }
  rest = cleanSeg(rest);
  if (!rest && !phone) return null;

  // 2) Name: first " - " / " – " / " — "
  let name = '';
  let afterName = rest;
  const dashSplit = rest.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dashSplit) {
    name = dashSplit[1].trim();
    afterName = dashSplit[2].trim();
  } else if (/\s*\/\s*/.test(rest)) {
    // Fallback: first `/`-segment as name (legacy "이름 / 주문 / 주소")
    const slashIdx = rest.search(/\s*\/\s*/);
    name = rest.slice(0, slashIdx).trim();
    afterName = rest.slice(slashIdx).replace(/^\s*\/\s*/, '').trim();
  } else {
    // Single blob — try address split; leftover name
    name = rest;
    afterName = '';
  }

  // 3) Address vs items in remainder
  let items = '';
  let address = '';

  if (afterName) {
    const addrIdx = findAddressStart(afterName);
    if (addrIdx >= 0) {
      items = cleanSeg(afterName.slice(0, addrIdx));
      address = cleanSeg(afterName.slice(addrIdx));
    } else if (/[시군구읍면동로길호아파트]/.test(afterName) && !/\//.test(afterName)) {
      // Whole remainder looks like address (no product separators)
      address = cleanSeg(afterName);
    } else {
      items = cleanSeg(afterName);
    }
  } else if (name) {
    // No separator: maybe "이름주소전화" rare — try peel address off name
    const addrIdx = findAddressStart(name);
    if (addrIdx > 0) {
      const maybeName = cleanSeg(name.slice(0, addrIdx));
      const maybeAddr = cleanSeg(name.slice(addrIdx));
      if (maybeName && maybeAddr) {
        name = maybeName;
        address = maybeAddr;
      }
    }
  }

  // Normalize items: keep ` / ` between product segments (already present)
  items = items.replace(/\s*\/\s*/g, ' / ').replace(/\s{2,}/g, ' ').trim();
  address = address.replace(/\s{2,}/g, ' ').trim();
  name = name.trim();

  if (!name && !items && !address && !phone) return null;

  return {
    name: name || '이름없음',
    items: items || '',
    address: address || '',
    phone,
    status: '대기',
    priority: false,
  };
}

export function parseReminderText(text: string): Partial<Order>[] {
  return text
    .split(/\r?\n/)
    .map((line) => parseReminderLine(line))
    .filter((o): o is Partial<Order> => o !== null);
}

/** Known Naver Form product option column labels (substring match). */
const PRODUCT_LABELS = [
  '휴대폰 마운틴 거치대',
  '태블릿 마그네틱 거치대',
  'DC콤보+J1772 거치대',
  '안전벨트 클립',
  '트럭 MAT',
  '운전석/조수석 손잡이 커버',
  '견인고리 커버',
  '사이버트럭 전면 번호판 로고',
  '사이버트럭 비스트 앰블럼',
];

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function normalizePhone(raw: string): string {
  return raw.replace(/[-.\s]/g, '');
}

function normalizeHeader(h: string): string {
  return h.replace(/\s+/g, '').replace(/\(\*\)/g, '').trim();
}

function findCol(
  headers: string[],
  predicate: (normalized: string, raw: string) => boolean,
): number {
  return headers.findIndex((h) => predicate(normalizeHeader(h), h));
}

function isProductHeader(raw: string): boolean {
  const n = normalizeHeader(raw);
  return PRODUCT_LABELS.some(
    (label) => n.includes(normalizeHeader(label)) || raw.includes(label),
  );
}

function isMemoHeader(raw: string): boolean {
  return (
    /카카오뱅크/.test(raw) ||
    /요청\s*하신\s*목록/.test(raw) ||
    /요청하신목록/.test(normalizeHeader(raw))
  );
}

/**
 * Parse Naver Form survey export rows (first row = headers).
 * Strips price tokens (e.g. `13,000원`) from option/shipping cells.
 * Skips empty name+phone rows. Default status: 대기.
 */
export function parseNaverFormRows(rows: unknown[][]): Partial<Order>[] {
  if (!rows.length) return [];

  const headers = rows[0].map((h) => cellStr(h));
  const nameIdx = findCol(
    headers,
    (n, raw) => n.includes('성함') || /성\s*함/.test(raw),
  );
  const nickIdx = findCol(
    headers,
    (n) => n.includes('카페닉네임') || n.includes('닉네임'),
  );
  const phoneIdx = findCol(headers, (n) => n.includes('연락처'));
  const addrIdx = findCol(
    headers,
    (n, raw) => n.includes('주소') || /주\s*소/.test(raw),
  );
  const shipIdx = findCol(headers, (n) => n.includes('택배비용'));
  const memoIdx = headers.findIndex((h) => isMemoHeader(h));
  const productIdxs = headers
    .map((h, i) => (isProductHeader(h) ? i : -1))
    .filter((i) => i >= 0);

  const out: Partial<Order>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const nameRaw = nameIdx >= 0 ? cellStr(row[nameIdx]) : '';
    const nick = nickIdx >= 0 ? cellStr(row[nickIdx]) : '';
    const phone = phoneIdx >= 0 ? normalizePhone(cellStr(row[phoneIdx])) : '';
    const address = addrIdx >= 0 ? cellStr(row[addrIdx]) : '';

    if (!nameRaw && !phone) continue;

    const itemParts: string[] = [];
    for (const i of productIdxs) {
      const v = stripItemPrices(cellStr(row[i]));
      if (v) itemParts.push(v);
    }

    if (shipIdx >= 0) {
      const ship = stripItemPrices(cellStr(row[shipIdx]));
      if (ship) itemParts.push(ship);
    }

    if (memoIdx >= 0) {
      const memo = cellStr(row[memoIdx]);
      if (memo) itemParts.push(`요청: ${memo}`);
    }

    const displayName =
      nick && nameRaw ? `${nick} ${nameRaw}` : nameRaw || nick || '이름없음';

    out.push({
      name: displayName,
      items: itemParts.join(' / '),
      address,
      phone,
      group: nick || undefined,
      status: '대기',
      priority: false,
    });
  }

  return out;
}

/** Read .xlsx / .xls / .csv ArrayBuffer → Naver Form orders. */
export async function parseNaverFormFile(data: ArrayBuffer): Promise<Partial<Order>[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(data, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  });
  return parseNaverFormRows(rows);
}
