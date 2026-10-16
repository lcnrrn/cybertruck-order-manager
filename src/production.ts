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

const QTY_RE = /\s*(?:[xX×]\s*(\d{1,3})|(\d{1,3})\s*(?:개|ea|EA|세트|set|SET|pcs))\s*$/;
const QTY_PREFIX_RE = /^\s*(\d{1,3})\s*(?:개|ea|세트)\s+/;

export function splitQty(part: string): { text: string; qty: number } {
  let text = stripItemPrices(part).trim();
  let qty = 1;
  const m = text.match(QTY_RE);
  if (m && m.index !== undefined && m.index > 0) {
    qty = Number(m[1] || m[2]) || 1;
    text = text.slice(0, m.index).trim();
  } else {
    const p = text.match(QTY_PREFIX_RE);
    if (p) {
      qty = Number(p[1]) || 1;
      text = text.slice(p[0].length).trim();
    }
  }
  return { text, qty: Math.max(1, qty) };
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
    const { text, qty } = splitQty(part);
    if (!text) continue;
    const name = matchProduct(text, names);
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

export function buildProductionSummary(orders: Order[], catalog: Product[]): ProductionSummary {
  const names = catalog.map((c) => c.name);
  const map = new Map<string, ProductionRow>();
  const others: ProductionSummary['others'] = [];
  let orderCount = 0;
  for (const o of orders) {
    if (o.status !== '대기' && o.status !== '제작중') continue;
    orderCount += 1;
    const r = parseOrderProducts(o.items, names);
    for (const p of r.products) {
      const row = map.get(p.name) ?? { name: p.name, total: 0, waiting: 0, making: 0 };
      row.total += p.qty;
      if (o.status === '대기') row.waiting += p.qty;
      else row.making += p.qty;
      map.set(p.name, row);
    }
    for (const x of r.others) others.push({ ...x, orderName: o.name });
  }
  const rows = names.filter((n) => map.has(n)).map((n) => map.get(n)!);
  const total = rows.reduce((s, r) => s + r.total, 0) + others.reduce((s, x) => s + x.qty, 0);
  return { rows, others, total, orderCount };
}
