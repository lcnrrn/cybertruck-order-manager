import type { Order } from './types';

export function normalizeTracking(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function isLikelyTracking(raw: string): boolean {
  const d = normalizeTracking(raw);
  return d.length >= 12 && d.length <= 13;
}

export type ParsedTracking = {
  name: string;
  trackingNumber: string;
};

function looksLikeName(s: string): boolean {
  const t = s.replace(/\s+/g, '').trim();
  if (t.length < 2 || t.length > 20) return false;
  if (/^\d+$/.test(t)) return false;
  if (/송장|등기|우체국|접수|무게|요금|주소|전화|연락|생활용품|소포/.test(t)) return false;
  return /[가-힣A-Za-z]/.test(t);
}

/** 우체국 모바일 영수증: `등기번호  요금  우편번호  수취인` */
export function parseTrackingText(text: string): ParsedTracking[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00a0/g, ' ').trim())
    .filter(Boolean);

  const out: ParsedTracking[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const numbers = [...line.matchAll(/(\d[\d\-\s]{10,22}\d)/g)].map((m) =>
      normalizeTracking(m[1]),
    );
    const tracking = numbers.find((n) => n.length >= 12 && n.length <= 13);
    if (!tracking) continue;

    let name = '';
    const mask = line.match(/([\uac00-\ud7a3A-Za-z]\s*[\uac00-\ud7a3A-Za-z*\u00b7•]·?[\uac00-\ud7a3A-Za-z]?)/g);
    const maskName = line.match(/([\uac00-\ud7a3A-Za-z][*\u00b7•]+[\uac00-\ud7a3A-Za-z]*)/);
    if (maskName) name = maskName[1].replace(/\s+/g, '');

    if (!name) {
      const withoutNum = line.replace(/[\d,\-\s]{5,}/g, ' ').trim();
      const tokens = withoutNum.split(/[\s,|/:：]+/).filter(Boolean);
      const nameTok = [...tokens].reverse().find(looksLikeName);
      if (nameTok) name = nameTok;
    }

    if (!name && i > 0 && looksLikeName(lines[i - 1])) name = lines[i - 1];
    if (!name && i + 1 < lines.length && looksLikeName(lines[i + 1])) {
      name = lines[i + 1];
    }

    const key = `${name}|${tracking}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: name.trim(), trackingNumber: tracking });
  }

  return out;
}

function hangulTokens(s: string): string[] {
  return s.match(/[\uac00-\ud7a3]{2,6}/g) || [];
}

function normName(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

/** `안*우` / `황*` → 주문 이름의 한글 토큰과 비교 */
function maskMatches(mask: string, orderName: string): boolean {
  const m = mask.replace(/\s+/g, '');
  const tokens = hangulTokens(orderName);
  if (tokens.length === 0) return false;

  const pattern = m.replace(/\*+/g, '(.+)');
  let re: RegExp;
  try {
    re = new RegExp(`^${pattern}$`);
  } catch {
    return false;
  }

  return tokens.some((tok) => re.test(tok));
}

export type TrackingMatch = {
  parsed: ParsedTracking;
  order: Order | null;
  reason: 'exact' | 'contains' | 'mask' | 'ambiguous' | 'none';
};

export function matchTrackingToOrders(
  parsed: ParsedTracking[],
  orders: Order[],
): TrackingMatch[] {
  const used = new Set<string>();

  return parsed.map((p) => {
    if (!p.name) return { parsed: p, order: null, reason: 'none' };
    const pn = normName(p.name);
    const available = orders.filter((o) => !used.has(o.id));

    const exact = available.find((o) => {
      const tokens = hangulTokens(o.name);
      return normName(o.name) === pn || tokens.some((t) => t === p.name.replace(/\*/g, ''));
    });
    if (exact) {
      used.add(exact.id);
      return { parsed: p, order: exact, reason: 'exact' };
    }

    if (p.name.includes('*')) {
      const masked = available.filter((o) => maskMatches(p.name, o.name));
      if (masked.length === 1) {
        used.add(masked[0].id);
        return { parsed: p, order: masked[0], reason: 'mask' };
      }
      if (masked.length > 1) {
        return { parsed: p, order: null, reason: 'ambiguous' };
      }
    }

    const contains = available.filter((o) => {
      const on = normName(o.name);
      const tokens = hangulTokens(o.name);
      return on.includes(pn) || tokens.some((t) => t.includes(pn) || pn.includes(t));
    });
    if (contains.length === 1) {
      used.add(contains[0].id);
      return { parsed: p, order: contains[0], reason: 'contains' };
    }
    if (contains.length > 1) {
      return { parsed: p, order: null, reason: 'ambiguous' };
    }
    return { parsed: p, order: null, reason: 'none' };
  });
}

export function buildShipSmsBody(trackingNumber?: string): string {
  const base = '안녕하세요. 주문하신 제품이 발송되었습니다.';
  const t = trackingNumber?.trim();
  if (t) {
    return `${base} 우체국 송장번호 ${t} 입니다. 도착까지 조금만 기다려 주세요.`;
  }
  return `${base} 도착까지 조금만 기다려 주세요.`;
}
