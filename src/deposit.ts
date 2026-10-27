import type { Order } from './types';
import type { Product } from './products';
import { isUnpaid, orderAmount } from './production';

/** 은행 앱에서 복사한 입금 내역 한 줄 */
export interface Deposit {
  /** 원문 위치 (목록 key) */
  idx: number;
  name: string;
  amount: number;
  /** 입금 시각 (알 수 있으면) */
  at?: number;
  raw: string;
}

const STOP = new Set([
  '입금', '출금', '잔액', '이체', '송금', '받음', '보냄', '거래', '내역', '카카오뱅크', '카카오페이', '토스', '토스뱅크', '국민', '신한', '우리', '하나', '농협', '기업',
  '체크카드', '모임통장', '세이프박스', '이자', '오늘', '어제', '오전', '오후', '입출금', '통장', '계좌', '원', '결제', '취소', '자동이체', '이체입금', '타행', '당행',
]);

function nameIn(line: string): string | null {
  // 금액·날짜·시각을 지운 뒤 남은 한글/영문 이름
  const s = line
    .replace(/[\d,]+\s*원/g, ' ')
    .replace(/\d{1,4}[./-]\d{1,2}([./-]\d{1,2})?/g, ' ')
    .replace(/\d{1,2}:\d{2}(:\d{2})?/g, ' ')
    .replace(/[+\-−]/g, ' ');
  const words = s.match(/[가-힣A-Za-z][가-힣A-Za-z0-9*()]{1,15}/g) || [];
  for (const w of words) {
    const clean = w.replace(/[()]/g, '');
    if (STOP.has(clean) || /^(입금|출금|잔액)/.test(clean)) continue;
    if (clean.length < 2) continue;
    return clean;
  }
  return null;
}

function dateIn(line: string, now: Date): number | undefined {
  const m = line.match(/(?:(\d{4})[./-])?(\d{1,2})[./-](\d{1,2})(?:\D+(\d{1,2}):(\d{2}))?/);
  if (!m) return undefined;
  const y = m[1] ? +m[1] : now.getFullYear();
  const mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  const t = new Date(y, mo - 1, d, m[4] ? +m[4] : 12, m[5] ? +m[5] : 0).getTime();
  // 연도 없는 날짜가 미래면 작년
  return !m[1] && t > now.getTime() + 864e5 ? new Date(y - 1, mo - 1, d, m[4] ? +m[4] : 12, m[5] ? +m[5] : 0).getTime() : t;
}

/**
 * 카카오뱅크 등 은행 앱 거래내역을 붙여넣으면 입금 건만 뽑음.
 * - 한 줄 형식: "10.27 14:22 홍길동 입금 25,000원 잔액 1,000,000원"
 * - 여러 줄 형식: "홍길동\n입금\n25,000원\n10.27 14:22"
 * 출금·잔액 금액은 무시.
 */
export function parseDeposits(text: string, now = new Date()): Deposit[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: Deposit[] = [];
  const used = new Set<number>();
  lines.forEach((line, i) => {
    if (/출금|보냄|결제|이체출금/.test(line) && !/입금/.test(line)) return;
    // 잔액 부분은 잘라냄
    const body = line.replace(/잔액\s*[\d,]+\s*원?/g, ' ');
    const am = body.match(/(?:^|[^\d,])\+?\s*([\d]{1,3}(?:,\d{3})+|\d{4,})\s*원/) || body.match(/^\+?\s*([\d]{1,3}(?:,\d{3})+)$/);
    if (!am) return;
    const amount = Number(am[1].replace(/,/g, ''));
    if (!amount || amount < 100) return;
    // 이웃 줄이 출금이면 제외
    const near = [lines[i - 1] || '', lines[i - 2] || ''].join(' ');
    if (!/입금/.test(line) && /출금|보냄/.test(near) && !/입금/.test(near)) return;
    let name = nameIn(body);
    let at = dateIn(line, now);
    for (const j of [i - 1, i - 2, i + 1, i - 3]) {
      if (j < 0 || j >= lines.length || used.has(j)) continue;
      const l = lines[j];
      if (/[\d,]{4,}\s*원/.test(l.replace(/잔액\s*[\d,]+\s*원?/g, '')) && j !== i) continue;
      if (!name) {
        const n = nameIn(l);
        if (n) { name = n; used.add(j); }
      }
      if (at === undefined) { at = dateIn(l, now); if (at !== undefined) used.add(j); }
    }
    if (!name) return;
    used.add(i);
    out.push({ idx: out.length, name, amount, at, raw: line });
  });
  return out;
}

export interface DepositCandidate {
  order: Order;
  amount: number;
  score: number;
  nameHit: boolean;
  amountHit: boolean;
}

function normName(s: string): string {
  return (s || '').replace(/\s+/g, '').replace(/[()（）]/g, '').toLowerCase();
}

/** 입금자명과 주문자명이 같은 사람인지 (닉네임·괄호 포함 이름도 허용) */
export function nameMatches(depositName: string, orderName: string): boolean {
  const d = normName(depositName);
  const o = normName(orderName);
  if (!d || !o) return false;
  if (d === o || o.includes(d) || d.includes(o)) return true;
  // 입금자명이 3글자 이상이면 앞 3글자로도 비교 (예: 홍길동카뱅 → 홍길동)
  return d.length >= 3 && o.includes(d.slice(0, 3));
}

/** 입금 1건의 후보 주문 (미입금만, 점수 높은 순) */
export function depositCandidates(dep: Deposit, orders: Order[], catalog: Product[]): DepositCandidate[] {
  const out: DepositCandidate[] = [];
  for (const o of orders) {
    if (!isUnpaid(o, catalog)) continue;
    const amount = orderAmount(o, catalog);
    const nameHit = nameMatches(dep.name, o.name);
    const amountHit = amount === dep.amount;
    if (!nameHit && !amountHit) continue;
    const score = (nameHit ? 2 : 0) + (amountHit ? 2 : 0) - (dep.at && o.createdAt && o.createdAt > dep.at + 864e5 ? 3 : 0);
    out.push({ order: o, amount, score, nameHit, amountHit });
  }
  return out.sort((a, b) => b.score - a.score || (a.order.createdAt || 0) - (b.order.createdAt || 0));
}

/** 확실한 짝: 이름·금액 모두 맞는 후보가 정확히 1건 */
export function sureMatch(c: DepositCandidate[]): DepositCandidate | null {
  const both = c.filter((x) => x.nameHit && x.amountHit);
  return both.length === 1 ? both[0] : null;
}
