import type { Order } from './types';
import type { Product } from './products';
import type { FilamentState } from './filament';
import { liveEntries } from './filament';
import type { ShopSettings } from './shop';
import { orderAmount, orderGrams, parseOrderProducts, unitPrice } from './production';

export const DEFAULT_COST_PER_GRAM = 20; // PLA 1kg ≈ 2만 원
export const DEFAULT_SHIP_FEE = 4000;

/** 필라멘트 1g 원가: 직접 지정 > 구매 기록(금액·g 있는 것) 평균 > 기본값 */
export function costPerGram(shop: ShopSettings, fil: Pick<FilamentState, 'entries'> | null): { value: number; source: 'shop' | 'purchase' | 'default' } {
  if (typeof shop.costPerGram === 'number' && shop.costPerGram > 0) return { value: shop.costPerGram, source: 'shop' };
  if (fil) {
    let won = 0, g = 0;
    for (const e of liveEntries(fil)) {
      if (e.kind === 'purchase' && typeof e.cost === 'number' && e.cost > 0 && e.grams > 0) {
        won += e.cost;
        g += e.grams;
      }
    }
    if (g >= 500 && won > 0) return { value: Math.round((won / g) * 10) / 10, source: 'purchase' };
  }
  return { value: DEFAULT_COST_PER_GRAM, source: 'default' };
}

export function shipFeeOf(shop: ShopSettings): number {
  return typeof shop.shipFee === 'number' && shop.shipFee >= 0 ? shop.shipFee : DEFAULT_SHIP_FEE;
}

export interface OrderProfit {
  revenue: number;
  grams: number;
  material: number;
  ship: number;
  net: number;
}

/** 주문 1건: 매출 − (필라멘트 g × 1g 원가) − 택배비(우체국 요금 기록 > 기본값) */
export function orderProfit(o: Order, catalog: Product[], cpg: number, shipFee: number): OrderProfit {
  const revenue = orderAmount(o, catalog);
  const grams = orderGrams(o, catalog);
  const material = grams * cpg;
  const ships = (o.shipments || []).filter((s) => s.postStatus !== 'cancelled');
  let ship = 0;
  if (ships.length) ship = ships.reduce((s, x) => s + (typeof x.fee === 'number' && x.fee > 0 ? x.fee : shipFee), 0);
  else if (o.trackingNumber || /택배/.test(o.items || '')) ship = shipFee;
  return { revenue, grams, material, ship, net: revenue - material - ship };
}

export interface MonthProfit extends OrderProfit {
  key: string;
  label: string;
  count: number;
}

export function monthlyProfit(orders: Order[], catalog: Product[], cpg: number, shipFee: number, months = 6, now = new Date()): MonthProfit[] {
  const out: MonthProfit[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: `${d.getMonth() + 1}월`, count: 0, revenue: 0, grams: 0, material: 0, ship: 0, net: 0 });
  }
  const idx = new Map(out.map((m, i) => [m.key, i]));
  for (const o of orders) {
    const d = new Date(o.createdAt || o.updatedAt);
    const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (i === undefined) continue;
    const p = orderProfit(o, catalog, cpg, shipFee);
    const m = out[i];
    m.count += 1;
    m.revenue += p.revenue;
    m.grams += p.grams;
    m.material += p.material;
    m.ship += p.ship;
    m.net += p.net;
  }
  return out;
}

export interface ProductMargin {
  name: string;
  qty: number;
  revenue: number;
  grams: number;
  material: number;
  margin: number;
  /** 0~1 */
  rate: number;
}

/** 제품별 마진 (택배비 제외, 판매가 − 필라멘트 원가) */
export function productMargins(orders: Order[], catalog: Product[], cpg: number, bounds?: [number, number] | null): ProductMargin[] {
  const names = catalog.map((c) => c.name);
  const m = new Map<string, ProductMargin>();
  for (const o of orders) {
    const at = o.createdAt || o.updatedAt;
    if (bounds && (at < bounds[0] || at > bounds[1])) continue;
    for (const p of parseOrderProducts(o.items, names).products) {
      const prod = catalog.find((c) => c.name === p.name);
      const gPer = prod?.filaments?.length
        ? prod.filaments.reduce((s, f) => s + (Number.isFinite(f.grams) && f.grams > 0 ? f.grams : 0), 0)
        : prod?.grams || 0;
      const row = m.get(p.name) || { name: p.name, qty: 0, revenue: 0, grams: 0, material: 0, margin: 0, rate: 0 };
      row.qty += p.qty;
      row.revenue += unitPrice(o, p.name, catalog) * p.qty;
      row.grams += gPer * p.qty;
      m.set(p.name, row);
    }
  }
  return [...m.values()]
    .map((r) => {
      const material = r.grams * cpg;
      const margin = r.revenue - material;
      return { ...r, material, margin, rate: r.revenue > 0 ? margin / r.revenue : 0 };
    })
    .sort((a, b) => b.margin - a.margin);
}
