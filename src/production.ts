import { markSettingChanged as _markProd } from './settingsMeta';
import type { Order } from './types';
import { scoreCatalogMatch, stripItemPrices, type Product } from './products';

export const SHIPPING_NAME = '우체국 택배';

export interface ProductionRow {
  name: string;
  total: number;
  waiting: number;
  making: number;
}

export interface ProductionSummary {
  rows: ProductionRow[];
  others: { text: string; qty: number; orderName: string }[];
  total: number;
  orderCount: number;
}

const QTY_RE = /\s*(?:[xX×]\s*(\d{1,3})|(\d{1,3})\s*(?:개|ea|EA|세트|셋트|set|SET|pcs))\s*$/;
const QTY_PREFIX_RE = /^\s*(\d{1,3})\s*(?:개|ea|세트)\s+/;

export function splitQty(part: string): { text: string; qty: number; explicit?: boolean } {
  let text = stripItemPrices(part).trim();
  let qty = 1;
  let explicit = false;
  const m = text.match(QTY_RE);
  if (m && m.index !== undefined && m.index > 0) {
    qty = Number(m[1] || m[2]) || 1;
    explicit = Boolean(m[1]); // 'x3'/'×3' 은 항상 수량 (제품명 속 숫자와 무관)
    text = text.slice(0, m.index).trim();
  } else {
    const p = text.match(QTY_PREFIX_RE);
    if (p) {
      qty = Number(p[1]) || 1;
      text = text.slice(p[0].length).trim();
    }
  }
  return { text, qty: Math.max(1, qty), explicit };
}

/** 이 이상은 오인식(전화번호·치수 등)으로 보고 1개로 처리 */
export const MAX_QTY = 50;

function countsInName(name: string): number[] {
  return Array.from(name.matchAll(/(\d{1,3})\s*(?:개|ea|세트|셋트|set|pcs)/gi)).map((m) => Number(m[1]));
}

function charOverlap(a: string, b: string): number {
  const set = new Set(b.replace(/\s+/g, ''));
  let n = 0;
  for (const ch of a.replace(/\s+/g, '')) if (set.has(ch)) n += 1;
  return n;
}

export function matchProduct(text: string, names: string[]): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const n of names) {
    const s = scoreCatalogMatch(text, n);
    if (s > bestScore || (s > 0 && s === bestScore && best && charOverlap(text, n) > charOverlap(text, best))) {
      bestScore = s;
      best = n;
    }
  }
  return best && bestScore >= 60 ? best : null;
}

/** Parse order items into catalog products (with qty) + unmatched texts. */
export function parseOrderProducts(
  items: string,
  names: string[],
): { products: { name: string; qty: number }[]; others: { text: string; qty: number }[] } {
  const products: { name: string; qty: number }[] = [];
  const others: { text: string; qty: number }[] = [];
  const parts = stripItemPrices(items || '')
    .split(/\s*\/\s*|\s*,\s*|\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    if (/^\s*요청\s*[:：]/.test(part)) continue;
    const sp = splitQty(part);
    let { text, qty } = sp;
    if (!text) continue;
    let name = matchProduct(text, names);
    // 제품명 자체에 들어 있는 개수(예: '안전벨트 클립 (풀셋 5개)', '(뒷자석 3개)')는 수량이 아님
    // 단, 'x3'처럼 명시적인 수량 표기는 이름 속 숫자와 같아도 수량으로 인정
    if (qty > 1 && !sp.explicit) {
      const whole = stripItemPrices(part).trim();
      const wholeName = matchProduct(whole, names);
      if (wholeName && (!name || wholeName === name) && countsInName(wholeName).includes(qty)) {
        name = wholeName;
        qty = 1;
        text = whole;
      }
    }
    if (name === SHIPPING_NAME) continue;
    if (name) {
      const ex = products.find((p) => p.name === name);
      if (ex) ex.qty += qty;
      else products.push({ name, qty });
    } else if (!/택배|배송/.test(text)) {
      others.push({ text, qty });
    }
  }
  return { products, others };
}

export function orderHasProduct(order: Order, product: string, catalog: Product[]): boolean {
  const names = catalog.map((c) => c.name);
  const r = parseOrderProducts(order.items, names);
  if (product === '기타') return r.others.length > 0;
  return r.products.some((p) => p.name === product);
}

/* ───────── 품목별 부분 제작 ───────── */

export interface OrderItemProgress {
  key: string;
  label: string;
  qty: number;
  done: number;
  matched: boolean;
}

export function otherKey(text: string): string {
  return `기타:${text}`;
}

/** 주문 1건 품목 목록 + 제작 완료 개수 */
export function orderItemProgress(order: Pick<Order, 'items' | 'doneMap'>, names: string[]): OrderItemProgress[] {
  const r = parseOrderProducts(order.items, names);
  const done = (k: string, q: number) => Math.max(0, Math.min(q, Math.floor(order.doneMap?.[k] || 0)));
  return [
    ...r.products.map((p) => ({ key: p.name, label: p.name, qty: p.qty, done: done(p.name, p.qty), matched: true })),
    // 카탈로그에 없는 조각은 「추가 메모」(빨간 글씨)로 보여지는 부분이라 제작 목록에서 제외
  ];
}

export function progressTotals(list: OrderItemProgress[]): { done: number; total: number } {
  return list.reduce((a, x) => ({ done: a.done + x.done, total: a.total + x.qty }), { done: 0, total: 0 });
}

/** 남은(아직 안 만든) 수량 */
export function remainingQty(order: Pick<Order, 'doneMap'>, key: string, qty: number): number {
  return Math.max(0, qty - Math.max(0, Math.floor(order.doneMap?.[key] || 0)));
}

export function buildProductionSummary(orders: Order[], catalog: Product[]): ProductionSummary {
  const names = catalog.map((c) => c.name);
  const map = new Map<string, ProductionRow>();
  const others: ProductionSummary['others'] = [];
  let orderCount = 0;
  for (const o of orders) {
    if (o.status !== '대기' && o.status !== '제작중') continue;
    const r = parseOrderProducts(o.items, names);
    const prods = r.products.map((p) => ({ ...p, qty: remainingQty(o, p.name, p.qty) })).filter((p) => p.qty > 0);
    // 메모(카탈로그에 없는 조각)는 제작 수량에 넣지 않음
    const oth: { text: string; qty: number }[] = [];
    if (prods.length || oth.length) orderCount += 1;
    for (const p of prods) {
      const row = map.get(p.name) ?? { name: p.name, total: 0, waiting: 0, making: 0 };
      row.total += p.qty;
      if (o.status === '대기') row.waiting += p.qty;
      else row.making += p.qty;
      map.set(p.name, row);
    }
    for (const x of oth) others.push({ ...x, orderName: o.name });
  }
  const rows = names.filter((n) => map.has(n)).map((n) => map.get(n)!);
  const total = rows.reduce((s, r) => s + r.total, 0) + others.reduce((s, x) => s + x.qty, 0);
  return { rows, others, total, orderCount };
}

/** 제품 판매가 × 수량 자동 금액 */
/** 품목 단가: 주문에 직접 지정한 값(0=서비스) 우선, 없으면 제품 판매가 */
export function unitPrice(order: Pick<Order, 'prices'>, name: string, catalog: Product[]): number {
  const o = order.prices?.[name];
  if (typeof o === 'number' && o >= 0) return o;
  return catalog.find((c) => c.name === name)?.price || 0;
}

export function isServiceItem(order: Pick<Order, 'prices'>, name: string): boolean {
  return order.prices?.[name] === 0;
}

export function autoOrderAmount(order: Pick<Order, 'items' | 'prices'>, catalog: Product[]): number {
  const r = parseOrderProducts(order.items, catalog.map((c) => c.name));
  let sum = 0;
  for (const p of r.products) {
    if (p.name === SHIPPING_NAME) continue;
    sum += unitPrice(order, p.name, catalog) * p.qty;
  }
  const ship = catalog.find((c) => c.name === SHIPPING_NAME);
  if (ship && /택배/.test(order.items || '')) sum += unitPrice(order, SHIPPING_NAME, catalog);
  return sum;
}

/** 실제 금액: 직접 입력값 우선, 없으면 자동 계산 */
export function orderAmount(order: Order, catalog: Product[]): number {
  return order.amount !== undefined ? order.amount : autoOrderAmount(order, catalog);
}

export function isUnpaid(order: Order, catalog: Product[]): boolean {
  return !order.paid && orderAmount(order, catalog) > 0;
}

/** 주문 1건 필라멘트 소모량(g) */
export function orderGrams(order: Pick<Order, 'items' | 'doneMap' | 'filamentGrams'>, catalog: Product[], remainingOnly = false): number {
  const r = parseOrderProducts(order.items, catalog.map((c) => c.name));
  let sum = 0;
  for (const p of r.products) {
    const qty = remainingOnly ? remainingQty(order, p.name, p.qty) : p.qty;
    const prod = catalog.find((c) => c.name === p.name);
    const parts: number[] = prod?.filaments?.length
      ? prod.filaments.map((f) => (Number.isFinite(f.grams) && f.grams > 0 ? f.grams : 0))
      : prod?.grams
        ? [prod.grams]
        : [];
    // 이 주문에서 직접 지정한 줄(총량) 반영
    const ov: Record<number, number> = {};
    for (const [k, v] of Object.entries(order.filamentGrams || {})) {
      const i = k.lastIndexOf('#');
      if (i > 0 && k.slice(0, i) === p.name && typeof v === 'number' && v >= 0) ov[Number(k.slice(i + 1))] = v;
    }
    const n = Math.max(parts.length, ...Object.keys(ov).map((x) => Number(x) + 1), 0);
    for (let idx = 0; idx < n; idx++) {
      const perUnit = idx in ov ? ov[idx] / Math.max(1, p.qty) : parts[idx] || 0;
      sum += perUnit * qty;
    }
  }
  return sum;
}

export function pendingGrams(orders: Order[], catalog: Product[]): number {
  return orders
    .filter((o) => o.status === '대기' || o.status === '제작중')
    .reduce((s, o) => s + orderGrams(o, catalog, true), 0);
}

export function formatWon(n: number): string {
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}

/* ───────── 제작 시간 ───────── */

export interface ProductionSettings {
  /** 프린터 대수 */
  printers: number;
  /** 하루 가동 시간(시간) */
  hoursPerDay: number;
}

const LS_PROD_SETTINGS = 'cybertruck-production-settings-v1';
export const DEFAULT_PRODUCTION_SETTINGS: ProductionSettings = { printers: 1, hoursPerDay: 12 };

export function loadProductionSettings(): ProductionSettings {
  try {
    const raw = localStorage.getItem(LS_PROD_SETTINGS);
    if (raw) {
      const p = JSON.parse(raw) as Partial<ProductionSettings>;
      return {
        printers: typeof p.printers === 'number' && p.printers > 0 ? p.printers : 1,
        hoursPerDay: typeof p.hoursPerDay === 'number' && p.hoursPerDay > 0 ? Math.min(24, p.hoursPerDay) : 12,
      };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_PRODUCTION_SETTINGS };
}

export function saveProductionSettings(s: ProductionSettings): void {
  try {
    localStorage.setItem(LS_PROD_SETTINGS, JSON.stringify(s));
    _markProd('production');
    window.dispatchEvent(new CustomEvent('cybertruck-production-settings'));
  } catch {
    /* ignore */
  }
}

/** 주문 1건 출력 시간(분) */
export function orderMinutes(order: Order, catalog: Product[], remainingOnly = false): number {
  const r = parseOrderProducts(order.items, catalog.map((c) => c.name));
  let sum = 0;
  for (const p of r.products) {
    const prod = catalog.find((c) => c.name === p.name);
    sum += (prod?.minutes || 0) * (remainingOnly ? remainingQty(order, p.name, p.qty) : p.qty);
  }
  return sum;
}

export function pendingMinutes(orders: Order[], catalog: Product[]): number {
  return orders
    .filter((o) => o.status === '대기' || o.status === '제작중')
    .reduce((s, o) => s + orderMinutes(o, catalog, true), 0);
}

export function formatDuration(min: number): string {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}분`;
  return r ? `${h}시간 ${r}분` : `${h}시간`;
}

/** 예상 소요 일수 (프린터 대수 × 하루 가동 시간 기준) */
export function estimateDays(min: number, s: ProductionSettings): number {
  const perDay = Math.max(1, s.printers) * Math.max(0.5, s.hoursPerDay) * 60;
  return min > 0 ? Math.ceil((min / perDay) * 10) / 10 : 0;
}
