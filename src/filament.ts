import type { Order } from './types';
import type { Product } from './products';
import { parseOrderProducts, remainingQty } from './production';
import { markSettingChanged } from './settingsMeta';

const KEY = 'cybertruck-filament-v1';
export const DEFAULT_TYPE_ID = 'default';
export const DEFAULT_THRESHOLD = 1000;

export const DEFAULT_MATERIALS = ['PLA', 'PETG', 'TPU95A', 'ABS', 'ASA'];
export const DEFAULT_COLORS = ['블랙', '화이트', '그레이', '실버', '레드', '블루'];
/** 색 이름 → 기본 스와치 */
export const COLOR_SWATCH: Record<string, string> = {
  블랙: '#111111', 검정: '#111111', 화이트: '#f8fafc', 흰색: '#f8fafc', 그레이: '#6b7280', 회색: '#6b7280',
  실버: '#c0c0c0', 레드: '#dc2626', 빨강: '#dc2626', 블루: '#2563eb', 파랑: '#2563eb', 그린: '#16a34a',
  옐로우: '#facc15', 오렌지: '#f97316', 투명: '#cbd5e1',
};

export interface FilamentType {
  id: string;
  material: string;
  color: string;
  /** #rrggbb */
  swatch?: string;
  threshold?: number;
  /** 기록이 있는 종류를 삭제하면 숨김 처리 */
  hidden?: boolean;
}

export interface FilamentEntry {
  id: string;
  at: number;
  /** +구매 / ±재고 보정 (g) */
  grams: number;
  note: string;
  kind: 'purchase' | 'adjust';
  /** 없으면 기본(미지정) */
  typeId?: string;
}

export interface FilamentState {
  entries: FilamentEntry[];
  /** 레거시 전체 기준 (기본 종류 기준값으로 사용) */
  threshold: number;
  types: FilamentType[];
  materials: string[];
  colors: string[];
}

export const DEFAULT_TYPE: FilamentType = { id: DEFAULT_TYPE_ID, material: '기본', color: '미지정' };

export function typeLabel(t: FilamentType | undefined): string {
  if (!t) return '기본 (미지정)';
  return `${t.material} ${t.color}`.trim();
}

export function swatchOf(t: FilamentType | undefined): string {
  return t?.swatch || (t ? COLOR_SWATCH[t.color] : undefined) || '#64748b';
}

function strList(v: unknown, def: string[]): string[] {
  if (!Array.isArray(v)) return [...def];
  const out = Array.from(new Set(v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim())));
  return out;
}

export function normalizeTypes(v: unknown): FilamentType[] {
  const out: FilamentType[] = [];
  if (Array.isArray(v)) {
    for (const x of v) {
      if (!x || typeof x !== 'object') continue;
      const o = x as Record<string, unknown>;
      if (typeof o.id !== 'string' || !o.id) continue;
      if (out.some((t) => t.id === o.id)) continue;
      const t: FilamentType = {
        id: o.id,
        material: typeof o.material === 'string' ? o.material : '',
        color: typeof o.color === 'string' ? o.color : '',
      };
      if (typeof o.swatch === 'string' && o.swatch) t.swatch = o.swatch;
      if (typeof o.threshold === 'number' && o.threshold >= 0) t.threshold = o.threshold;
      if (o.hidden === true) t.hidden = true;
      out.push(t);
    }
  }
  if (!out.some((t) => t.id === DEFAULT_TYPE_ID)) out.unshift({ ...DEFAULT_TYPE });
  return out;
}

export function normalizeFilament(p: Partial<FilamentState> | null | undefined): FilamentState {
  const src = p && typeof p === 'object' ? p : {};
  return {
    entries: Array.isArray(src.entries) ? src.entries.filter((e) => e && typeof e.grams === 'number') : [],
    threshold: typeof src.threshold === 'number' && src.threshold >= 0 ? src.threshold : DEFAULT_THRESHOLD,
    types: normalizeTypes(src.types),
    materials: strList(src.materials, DEFAULT_MATERIALS),
    colors: strList(src.colors, DEFAULT_COLORS),
  };
}

export function loadFilament(): FilamentState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeFilament(JSON.parse(raw) as Partial<FilamentState>);
  } catch {
    /* ignore */
  }
  return normalizeFilament(null);
}

export function saveFilament(s: FilamentState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    markSettingChanged('filament');
  } catch {
    /* ignore */
  }
}

export function thresholdOf(state: FilamentState, typeId: string): number {
  const t = state.types.find((x) => x.id === typeId);
  if (t?.threshold !== undefined) return t.threshold;
  return state.threshold ?? DEFAULT_THRESHOLD;
}

/* ---------- product filament recipe ---------- */

export interface FilamentPart {
  typeId: string;
  grams: number;
}

/** 제품 1개당 필라멘트 구성 (레거시 grams → 기본 종류) */
export function productParts(p: Product | undefined, keepEmpty = false): FilamentPart[] {
  if (!p) return [];
  if (Array.isArray(p.filaments) && p.filaments.length > 0) {
    return keepEmpty ? p.filaments.map((f) => ({ ...f })) : p.filaments.filter((f) => f.grams > 0 && Number.isFinite(f.grams));
  }
  return p.grams ? [{ typeId: DEFAULT_TYPE_ID, grams: p.grams }] : [];
}

export function pickKey(product: string, idx: number): string {
  return `${product}#${idx}`;
}

/** 주문 메모의 색상 요청(예: '블랙')을 읽어 같은 재질의 해당 색 종류를 고름 */
export function autoPickType(defaultId: string, text: string, state: FilamentState): string {
  const base = state.types.find((t) => t.id === defaultId);
  if (!base || !text) return defaultId;
  const cand = state.types.filter(
    (t) => !t.hidden && t.id !== defaultId && t.color && text.includes(t.color) &&
      (base.id === DEFAULT_TYPE_ID || t.material === base.material),
  );
  if (cand.length === 1) return cand[0].id;
  if (cand.length > 1 && base.id === DEFAULT_TYPE_ID) return defaultId;
  return cand[0]?.id || defaultId;
}

export interface OrderSlot {
  product: string;
  idx: number;
  qty: number;
  grams: number;
  defaultTypeId: string;
  typeId: string;
}

export function orderSlots(
  order: Pick<Order, 'items' | 'filamentPick' | 'doneMap'>,
  catalog: Product[],
  state: FilamentState,
  remainingOnly = false,
): OrderSlot[] {
  const r = parseOrderProducts(order.items, catalog.map((c) => c.name));
  const out: OrderSlot[] = [];
  for (const p of r.products) {
    const parts = productParts(catalog.find((c) => c.name === p.name));
    parts.forEach((part, idx) => {
      const k = pickKey(p.name, idx);
      const picked = order.filamentPick?.[k];
      const valid = picked && state.types.some((t) => t.id === picked) ? picked : undefined;
      out.push({
        product: p.name,
        idx,
        qty: remainingOnly ? remainingQty(order, p.name, p.qty) : p.qty,
        grams: part.grams,
        defaultTypeId: part.typeId,
        typeId: valid || autoPickType(part.typeId, order.items, state),
      });
    });
  }
  return out;
}

export function orderUseByType(
  order: Pick<Order, 'items' | 'filamentPick' | 'doneMap'>,
  catalog: Product[],
  state: FilamentState,
  remainingOnly = false,
): Record<string, number> {
  const m: Record<string, number> = {};
  for (const s of orderSlots(order, catalog, state, remainingOnly)) m[s.typeId] = (m[s.typeId] || 0) + s.grams * s.qty;
  return m;
}

/** 이미 차감된 사용량 (레거시 filamentG만 있으면 기본 종류) */
export function deductedUse(o: Order): Record<string, number> {
  if (o.filamentUse && Object.keys(o.filamentUse).length) return o.filamentUse;
  if (o.filamentG) return { [DEFAULT_TYPE_ID]: o.filamentG };
  return {};
}

export interface NeedLine {
  orderId: string;
  orderName: string;
  product: string;
  qty: number;
  gramsPerUnit: number;
  total: number;
}

/** 종류별 필요량 내역 (주문·제품 단위) — 사용자가 숫자를 검증할 수 있게 */
export function pendingBreakdownByType(orders: Order[], catalog: Product[], state: FilamentState): Record<string, NeedLine[]> {
  const m: Record<string, NeedLine[]> = {};
  for (const o of orders) {
    if (o.status !== '대기' && o.status !== '제작중') continue;
    for (const s of orderSlots(o, catalog, state, true)) {
      if (s.qty <= 0) continue;
      (m[s.typeId] ||= []).push({ orderId: o.id, orderName: o.name, product: s.product, qty: s.qty, gramsPerUnit: s.grams, total: s.grams * s.qty });
    }
  }
  return m;
}

export function pendingByType(orders: Order[], catalog: Product[], state: FilamentState): Record<string, number> {
  const m: Record<string, number> = {};
  for (const o of orders) {
    if (o.status !== '대기' && o.status !== '제작중') continue;
    for (const [k, g] of Object.entries(orderUseByType(o, catalog, state, true))) m[k] = (m[k] || 0) + g;
  }
  return m;
}

/* ---------- stock ---------- */

export function stockByType(state: FilamentState, orders: Order[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const t of state.types) m[t.id] = 0;
  for (const e of state.entries) {
    const k = e.typeId || DEFAULT_TYPE_ID;
    m[k] = (m[k] || 0) + e.grams;
  }
  for (const o of orders) for (const [k, g] of Object.entries(deductedUse(o))) m[k] = (m[k] || 0) - g;
  return m;
}

export function consumedTotal(orders: Order[]): number {
  return orders.reduce((s, o) => s + (o.filamentG || 0), 0);
}

export function currentStock(state: FilamentState, orders: Order[]): number {
  return state.entries.reduce((s, e) => s + e.grams, 0) - consumedTotal(orders);
}

const DAY = 86400000;

/** 종류별 최근 30일 일평균 사용량 (g/일) */
export function avgDailyByType(orders: Order[], now = Date.now()): Record<string, number> {
  const since = now - 30 * DAY;
  const m: Record<string, number> = {};
  for (const o of orders) {
    if (!o.filamentAt || o.filamentAt < since) continue;
    for (const [k, g] of Object.entries(deductedUse(o))) m[k] = (m[k] || 0) + g / 30;
  }
  return m;
}

export function avgDailyUsage(orders: Order[], now = Date.now()): number {
  return Object.values(avgDailyByType(orders, now)).reduce((s, v) => s + v, 0);
}

export function typeHasHistory(state: FilamentState, orders: Order[], id: string): boolean {
  return (
    state.entries.some((e) => (e.typeId || DEFAULT_TYPE_ID) === id) ||
    orders.some((o) => deductedUse(o)[id] !== undefined)
  );
}

export function newEntryId(): string {
  return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function newTypeId(): string {
  return `ft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
