import type { Order } from './types';
import { stripItemPrices } from './products';

/**
 * Reminders 스타일 한 줄 파싱 (best-effort)
 * 예: `이름 - 주문 / 주소 01012345678`
 *     `김민수 / 사이드미러 / 서울시 강남구 ... / 010-1234-5678`
 */
export function parseReminderLine(line: string): Partial<Order> | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // 전화번호 추출 (010으로 시작하는 한국 번호)
  const phoneMatch = trimmed.match(/(01[0-9][-.\s]?\d{3,4}[-.\s]?\d{4})/);
  const phone = phoneMatch
    ? phoneMatch[1].replace(/[-.\s]/g, '')
    : '';

  let rest = trimmed;
  if (phoneMatch) {
    rest = trimmed.replace(phoneMatch[0], '').trim();
  }

  // 구분자로 분리: " - ", " / ", " | ", 탭 등
  const parts = rest
    .split(/\s*[-–—|/·]\s*|\t+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0 && !phone) return null;

  // 흔한 패턴: 이름 / 주문 / 주소
  let name = '';
  let items = '';
  let address = '';

  if (parts.length >= 3) {
    name = parts[0];
    items = parts[1];
    address = parts.slice(2).join(' ').trim();
  } else if (parts.length === 2) {
    name = parts[0];
    // 두 번째가 주소처럼 보이면 (시/구/동/로/길 포함)
    if (/[시군구읍면동로길호]/.test(parts[1])) {
      address = parts[1];
      items = '';
    } else {
      items = parts[1];
    }
  } else if (parts.length === 1) {
    name = parts[0];
  }

  // 주소에서 남은 잡음 정리
  address = address.replace(/^[/|\-–—·\s]+|[/|\-–—·\s]+$/g, '').trim();
  items = items.replace(/^[/|\-–—·\s]+|[/|\-–—·\s]+$/g, '').trim();

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
