import type { Order } from './types';
import type { Product } from './products';
import { parseOrderProducts, remainingUnits } from './production';
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
  /** 구매 금액(원) — 있으면 매출 정리의 「필라멘트」 지출로 잡힘 */
  cost?: number;
  /** 수정 시각 (기기 간 동기화 시 최신 수정이 이김) */
  updatedAt?: number;
  /** 삭제 표시(톰스톤) */
  deleted?: boolean;
}

/** 삭제되지 않은 기록만 */
export function liveEntries(state: Pick<FilamentState, 'entries'>): FilamentEntry[] {
  return state.entries.filter((e) => !e.deleted);
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
  /** 1개당 g (직접 지정 시 = 지정 총량 ÷ 주문 수량) */
  grams: number;
  /** 제품 관리 기본값(1개당 g), 없으면 0 */
  catalogGrams: number;
  /** 이 주문에서 직접 지정한 줄 총량(g) */
  overrideTotal?: number;
  /** 제품 관리에 없는 추가 줄 */
  extra: boolean;
  /** 주문 전체 수량 */
  fullQty: number;
  defaultTypeId: string;
  typeId: string;
}

/** 이 주문에서 제품별로 직접 추가한 줄 순번들 */
function overrideIdxs(order: Pick<Order, 'filamentGrams'>, product: string): number[] {
  const out: number[] = [];
  for (const k of Object.keys(order.filamentGrams || {})) {
    const i = k.lastIndexOf('#');
    if (i > 0 && k.slice(0, i) === product) {
      const n = Number(k.slice(i + 1));
      if (Number.isInteger(n) && n >= 0) out.push(n);
    }
  }
  return out;
}

/**
 * 주문의 필라멘트 줄 목록.
 * forEdit=true 면 필라멘트 설정이 없는 제품(예: 기타)도 0g 줄을 하나 보여줌(입력용).
 */
export function orderSlots(
  order: Pick<Order, 'items' | 'filamentPick' | 'doneMap' | 'filamentGrams'>,
  catalog: Product[],
  state: FilamentState,
  remainingOnly = false,
  forEdit = false,
): OrderSlot[] {
  const r = parseOrderProducts(order.items, catalog.map((c) => c.name));
  const out: OrderSlot[] = [];
  for (const p of r.products) {
    // 줄 순번은 제품 관리 순서 그대로(0g 줄 포함) — 화면/계산에서 같은 키를 쓰도록
    const parts = productParts(catalog.find((c) => c.name === p.name), true);
    const extraIdx = overrideIdxs(order, p.name);
    let count = Math.max(parts.length, extraIdx.length ? Math.max(...extraIdx) + 1 : 0);
    if (forEdit && count === 0) count = 1;
    const qty = remainingOnly ? remainingUnits(order, catalog.find((c) => c.name === p.name), p.qty, 'grams') : p.qty;
    for (let idx = 0; idx < count; idx++) {
      const part = parts[idx];
      const k = pickKey(p.name, idx);
      const ov = order.filamentGrams?.[k];
      const hasOv = typeof ov === 'number' && ov >= 0;
      if (!part && !hasOv && !(forEdit && idx === 0)) continue; // 비어 있는 중간 줄
      if (!forEdit && !hasOv && !(part && part.grams > 0 && Number.isFinite(part.grams))) continue; // 0g 줄은 계산 제외
      const defType = part?.typeId || DEFAULT_TYPE_ID;
      const picked = order.filamentPick?.[k];
      const valid = picked && state.types.some((t) => t.id === picked) ? picked : undefined;
      const catalogGrams = part?.grams || 0;
      out.push({
        product: p.name,
        idx,
        qty,
        grams: hasOv ? ov / Math.max(1, p.qty) : catalogGrams,
        catalogGrams,
        ...(hasOv ? { overrideTotal: ov } : {}),
        extra: !part,
        fullQty: p.qty,
        defaultTypeId: defType,
        typeId: valid || autoPickType(defType, order.items, state),
      });
    }
  }
  return out;
}

export function orderUseByType(
  order: Pick<Order, 'items' | 'filamentPick' | 'doneMap' | 'filamentGrams'>,
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

/** filamentBase 안의 표식 키 (비어 있는 기준점도 저장되도록) */
export const BASE_MARK = '~';

function baseDone(fb: Record<string, number> | undefined): Record<string, number> {
  const d = { ...(fb || {}) };
  delete d[BASE_MARK];
  return d;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function cleanUse(u: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(u)) if (v > 0.005) out[k] = r2(v);
  return out;
}

function sameUse(a: Record<string, number>, b: Record<string, number>): boolean {
  const ks = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of ks) if (Math.abs((a[k] || 0) - (b[k] || 0)) > 0.005) return false;
  return true;
}

/**
 * 이 주문에서 지금 차감돼 있어야 할 필라멘트 (종류별 g).
 * - 진행 중: 기준점 이후 새로 만든 만큼 (색상 선택·g 직접입력·구성품 g×개수 반영)
 * - 완료: 기준점 이후 아직 안 만든 나머지까지 전부 (= 이미 체크로 뺀 것 + 남은 것)
 */
export function filamentTarget(
  o: Pick<Order, 'items' | 'filamentPick' | 'doneMap' | 'filamentGrams' | 'status'>,
  base: Record<string, number>,
  catalog: Product[],
  state: FilamentState,
): Record<string, number> {
  if (o.status === '완료') return cleanUse(orderUseByType({ ...o, doneMap: base }, catalog, state, true));
  const eff: Record<string, number> = {};
  for (const [k, v] of Object.entries(o.doneMap || {})) {
    if (k.endsWith('::%')) continue;
    const e = v - (base[k] || 0);
    if (e > 0) eff[k] = e;
  }
  const full = orderUseByType(o, catalog, state, false);
  const rem = orderUseByType({ ...o, doneMap: eff }, catalog, state, true);
  const made: Record<string, number> = {};
  for (const t of Object.keys(full)) made[t] = Math.max(0, full[t] - (rem[t] || 0));
  return cleanUse(made);
}

/**
 * 주문이 바뀔 때마다 부르면 필라멘트 차감(filamentUse/G/At)을 목표치로 맞춤.
 * 제작 체크 → 즉시 차감, 체크 해제 → 되돌림, 완료 → 남은 것만 추가 차감(중복 없음), 완료 해제 → 되돌림.
 * 관련 변화(체크·상태·품목·색상·g)가 없으면 next 를 그대로 돌려줌. 기준점이 없는 옛 완료 주문은 건드리지 않음.
 */
export function reconcileFilament(prev: Order | null, next: Order, catalog: Product[], state: FilamentState, now = Date.now()): Order {
  const j = (v: unknown) => JSON.stringify(v ?? null);
  const tracked = !!next.filamentBase;
  const changedDone = j(prev?.doneMap) !== j(next.doneMap);
  const statusChanged = (prev?.status === '완료') !== (next.status === '완료');
  const slotsChanged = tracked && !!prev && (prev.items !== next.items || j(prev.filamentPick) !== j(next.filamentPick) || j(prev.filamentGrams) !== j(next.filamentGrams));
  if (!changedDone && !statusChanged && !slotsChanged) return next;
  if (!tracked && prev && prev.status === '완료' && next.status === '완료') return next; // 옛 방식으로 이미 차감된 완료 주문
  let fb = next.filamentBase;
  if (!fb) {
    const legacyFull = !!prev && prev.status === '완료' && Object.keys(deductedUse(prev)).length > 0;
    fb = { ...(legacyFull ? {} : prev?.doneMap || {}), [BASE_MARK]: 1 };
  }
  const target = filamentTarget(next, baseDone(fb), catalog, state);
  const cur = cleanUse(deductedUse(next));
  const out: Order = { ...next, filamentBase: fb };
  if (sameUse(cur, target) && next.filamentBase) return next;
  if (!sameUse(cur, target)) {
    const g = Object.values(target).reduce((a, b) => a + b, 0);
    if (g > 0) {
      out.filamentUse = target;
      out.filamentG = r2(g);
      out.filamentAt = now;
    } else {
      delete out.filamentUse;
      delete out.filamentG;
      delete out.filamentAt;
    }
  }
  return out;
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
  for (const e of liveEntries(state)) {
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
  return liveEntries(state).reduce((s, e) => s + e.grams, 0) - consumedTotal(orders);
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
    liveEntries(state).some((e) => (e.typeId || DEFAULT_TYPE_ID) === id) ||
    orders.some((o) => deductedUse(o)[id] !== undefined)
  );
}

export function newEntryId(): string {
  return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function newTypeId(): string {
  return `ft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
