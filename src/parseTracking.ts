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
  if (/송장|등기|우체국|접수|무게|요금|주소|전화|연락/.test(t)) return false;
  return /[가-힣A-Za-z]/.test(t);
}

export function parseTrackingText(text: string): ParsedTracking[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00a0/g, ' ').trim())
    .filter(Boolean);

  const out: ParsedTracking[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const numbers = [...line.matchAll(/(\d[\d\-\s]{10,20}\d)/g)].map((m) =>
      normalizeTracking(m[1]),
    );
    const tracking = numbers.find((n) => n.length >= 12 && n.length <= 13);
    if (!tracking) continue;

    let name = '';
    const withoutNum = line.replace(/[\d\-\s]{12,}/g, ' ').trim();
    const tokens = withoutNum.split(/[\s,|/·:：]+/).filter(Boolean);
    const nameTok = [...tokens].reverse().find(looksLikeName);
    if (nameTok) name = nameTok;

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

function normName(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

export type TrackingMatch = {
  parsed: ParsedTracking;
  order: Order | null;
  reason: 'exact' | 'contains' | 'none';
};

export function matchTrackingToOrders(
  parsed: ParsedTracking[],
  orders: Order[],
): TrackingMatch[] {
  return parsed.map((p) => {
    if (!p.name) return { parsed: p, order: null, reason: 'none' };
    const pn = normName(p.name);

    const exact = orders.find((o) => normName(o.name) === pn);
    if (exact) return { parsed: p, order: exact, reason: 'exact' };

    const contains = orders.filter((o) => {
      const on = normName(o.name);
      return on.includes(pn) || pn.includes(on);
    });
    if (contains.length === 1) {
      return { parsed: p, order: contains[0], reason: 'contains' };
    }
    if (contains.length > 1) {
      const best = contains.sort(
        (a, b) => normName(a.name).length - normName(b.name).length,
      )[0];
      return { parsed: p, order: best, reason: 'contains' };
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
