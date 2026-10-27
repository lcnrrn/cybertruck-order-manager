import { markSettingChanged } from './settingsMeta';

const STORAGE_KEY = 'cybertruck-products-v1';

export type ProductColor = {
  bg: string;
  border: string;
  text: string;
};

export type Product = {
  name: string;
  color: ProductColor;
  /** 판매가(원) */
  price?: number;
  /** 필라멘트 소모량(g) / 1개 */
  grams?: number;
  /** 출력 시간(분) / 1개 */
  minutes?: number;
  /** 필라멘트 구성 (여러 재질 가능) — 있으면 grams는 합계 */
  filaments?: { typeId: string; grams: number }[];
  /** 구성품(부품) — 있으면 1세트 g·분은 구성품 합계 (grams·minutes·filaments 는 저장할 때 합계로 맞춰 둠) */
  parts?: ProductPart[];
};

/** 세트 제품의 구성품 1종 — qty: 1세트에 들어가는 개수, grams/minutes: 1개당 (minutes 0 = 시간 미입력) */
export interface ProductPart {
  name: string;
  qty: number;
  grams: number;
  minutes: number;
}

function normalizeParts(v: unknown): ProductPart[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0);
  const out: ProductPart[] = [];
  for (const x of v) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!name || out.some((p) => p.name === name)) continue;
    out.push({ name, qty: Math.max(1, Math.round(n(o.qty)) || 1), grams: n(o.grams), minutes: n(o.minutes) });
  }
  return out.length ? out : undefined;
}

/** 구성품 합계 (1세트) */
export function partsTotals(parts: ProductPart[] | undefined): { grams: number; minutes: number; pieces: number; missingTime: string[] } {
  const list = parts || [];
  return {
    grams: list.reduce((s, p) => s + p.qty * p.grams, 0),
    minutes: list.reduce((s, p) => s + p.qty * p.minutes, 0),
    pieces: list.reduce((s, p) => s + p.qty, 0),
    missingTime: list.filter((p) => !(p.minutes > 0)).map((p) => p.name),
  };
}

/** 구성품이 있으면 grams·minutes·filaments(재질 비율 유지)를 구성품 합계로 맞춤 — 옛 버전·필라멘트 차감·원가 계산이 그대로 합계를 씀 */
export function withPartTotals(p: Product): Product {
  if (!p.parts?.length) return p;
  const t = partsTotals(p.parts);
  const next: Product = { ...p, grams: Math.round(t.grams * 100) / 100, minutes: Math.round(t.minutes) };
  const fil = p.filaments || [];
  if (fil.length) {
    const sum = fil.reduce((s, f) => s + (f.grams > 0 ? f.grams : 0), 0);
    next.filaments = fil.map((f, i) => ({
      typeId: f.typeId,
      grams: Math.round((sum > 0 ? ((f.grams > 0 ? f.grams : 0) / sum) * t.grams : i === 0 ? t.grams : 0) * 100) / 100,
    }));
  }
  return next;
}

/** Dark-theme-friendly swatch palette (~12) for product chips. */
export const PRODUCT_COLOR_PALETTE: ProductColor[] = [
  { bg: '#1e3a5f', border: '#3b82f6', text: '#bfdbfe' },
  { bg: '#3b1f5e', border: '#a855f7', text: '#e9d5ff' },
  { bg: '#14532d', border: '#22c55e', text: '#bbf7d0' },
  { bg: '#7c2d12', border: '#f97316', text: '#fed7aa' },
  { bg: '#831843', border: '#ec4899', text: '#fbcfe8' },
  { bg: '#155e75', border: '#06b6d4', text: '#a5f3fc' },
  { bg: '#713f12', border: '#eab308', text: '#fef08a' },
  { bg: '#312e81', border: '#818cf8', text: '#c7d2fe' },
  { bg: '#881337', border: '#f43f5e', text: '#fecdd3' },
  { bg: '#134e4a', border: '#14b8a6', text: '#99f6e4' },
  { bg: '#44403c', border: '#a8a29e', text: '#e7e5e4' },
  { bg: '#1e293b', border: '#64748b', text: '#cbd5e1' },
];

const DEFAULT_NAMES = [
  '휴대폰 마운트 거치대',
  '태블릿 마그네틱 거치대',
  'DC콤보+J1772 거치대',
  '안전벨트 클립 (뒷자석 3개)',
  '안전벨트 클립 (풀셋 5개)',
  '트럭 MAT',
  '손잡이 커버',
  '견인고리 커버',
  '전면 번호판 로고',
  '비스트 앰블럼',
  '냉장고 버튼 커버 및 고정핀',
  '우체국 택배',
] as const;

/** Built-in default catalog with distinct colors. */
export const DEFAULT_PRODUCTS: Product[] = DEFAULT_NAMES.map((name, i) => ({
  name,
  color: PRODUCT_COLOR_PALETTE[i % PRODUCT_COLOR_PALETTE.length],
}));

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function isColor(v: unknown): v is ProductColor {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.bg === 'string' &&
    typeof c.border === 'string' &&
    typeof c.text === 'string'
  );
}

function colorForName(name: string, index: number): ProductColor {
  return PRODUCT_COLOR_PALETTE[index % PRODUCT_COLOR_PALETTE.length] ??
    PRODUCT_COLOR_PALETTE[hashString(name) % PRODUCT_COLOR_PALETTE.length];
}

/** Normalize raw localStorage value (string[] or Product[]) → Product[]. */
export function normalizeProducts(list: unknown): Product[] | null {
  if (!Array.isArray(list)) return null;
  const out: Product[] = [];
  const seen = new Set<string>();
  let i = 0;
  for (const item of list) {
    let name = '';
    let color: ProductColor | null = null;
    let price: number | undefined;
    let grams: number | undefined;
    let minutes: number | undefined;
    let filaments: { typeId: string; grams: number }[] | undefined;
    let parts: ProductPart[] | undefined;
    if (typeof item === 'string') {
      name = item.trim();
    } else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      if (typeof o.name === 'string') name = o.name.trim();
      if (isColor(o.color)) color = o.color;
      if (typeof o.price === 'number' && Number.isFinite(o.price) && o.price >= 0) price = o.price;
      if (typeof o.grams === 'number' && Number.isFinite(o.grams) && o.grams >= 0) grams = o.grams;
      if (typeof o.minutes === 'number' && Number.isFinite(o.minutes) && o.minutes >= 0) minutes = o.minutes;
      parts = normalizeParts(o.parts);
      if (Array.isArray(o.filaments)) {
        filaments = (o.filaments as unknown[])
          .filter((f): f is { typeId: string; grams: number } =>
            !!f && typeof (f as { typeId?: unknown }).typeId === 'string' && typeof (f as { grams?: unknown }).grams === 'number')
          .map((f) => ({ typeId: f.typeId, grams: f.grams }));
      }
    }
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const p: Product = { name, color: color ?? colorForName(name, i) };
    if (price !== undefined) p.price = price;
    if (grams !== undefined) p.grams = grams;
    if (minutes !== undefined) p.minutes = minutes;
    if (filaments && filaments.length) p.filaments = filaments;
    if (parts) p.parts = parts;
    out.push(p);
    i += 1;
  }
  return out.length > 0 ? out : null;
}

/** Load product catalog; migrate string[] → {name,color} and persist. */
export function getProducts(): Product[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      const normalized = normalizeProducts(parsed);
      if (normalized) {
        // Persist migration if old string[] (or missing colors) was stored
        const needsRewrite =
          Array.isArray(parsed) &&
          (parsed.some((x) => typeof x === 'string') ||
            parsed.some(
              (x) =>
                x &&
                typeof x === 'object' &&
                !isColor((x as Record<string, unknown>).color),
            ));
        if (needsRewrite) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
          } catch {
            /* ignore */
          }
        }
        return normalized;
      }
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_PRODUCTS.map((p) => ({ ...p, color: { ...p.color } }));
}

/** Persist product list. Empty / invalid writes are ignored. */
export function setProducts(list: Product[]): void {
  const normalized = normalizeProducts(list);
  if (!normalized) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized.map(withPartTotals)));
    markSettingChanged('products');
  } catch {
    /* ignore */
  }
}

export function getProductNames(products: Product[] = getProducts()): string[] {
  return products.map((p) => p.name);
}

export function getProductColor(
  name: string,
  products: Product[] = getProducts(),
): ProductColor {
  const found = products.find((p) => p.name === name);
  if (found) return found.color;
  return colorForName(name, hashString(name));
}

/**
 * Strip Korean price tokens like `13,000원` / `4500원` from item text.
 * Quantities such as `3개` are preserved.
 */
export function stripItemPrices(text: string): string {
  return text
    .replace(/\s*[\d,]+(?:\.\d+)?\s*원/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function normalizeMatchKey(s: string): string {
  return stripItemPrices(s)
    .replace(/[()[\]{}]/g, ' ')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const prev = new Array<number>(cols);
  const cur = new Array<number>(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;
  for (let i = 1; i < rows; i++) {
    cur[0] = i;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j < cols; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

function isRequestPart(part: string): boolean {
  return /^\s*요청\s*[:：]/.test(part);
}

/** Score how well an items fragment matches a catalog product name (0 = none). */
export function scoreCatalogMatch(part: string, catalogName: string): number {
  const cleaned = stripItemPrices(part).trim();
  if (!cleaned || isRequestPart(cleaned)) return 0;

  if (cleaned === catalogName) return 100;

  const p = normalizeMatchKey(cleaned);
  const c = normalizeMatchKey(catalogName);
  if (!p || !c) return 0;
  if (p === c) return 98;

  // Containment (e.g. "우체국 택배" in longer text, or option text inside catalog name)
  if (p.length >= 4 && c.includes(p)) return 85 + Math.min(p.length, 10);
  if (c.length >= 4 && p.includes(c)) return 85 + Math.min(c.length, 10);

  // Near-equal whole string (마운틴 ↔ 마운트)
  const maxLen = Math.max(p.length, c.length);
  const dist = levenshtein(p, c);
  const allowed = maxLen <= 8 ? 1 : 2;
  if (dist <= allowed) return 90 - dist;

  // Parenthetical option of catalog vs fragment (뒷자석 3개)
  const paren = catalogName.match(/\(([^)]+)\)/);
  if (paren) {
    const pn = normalizeMatchKey(paren[1]);
    if (pn && p) {
      if (pn === p) return 88;
      if (pn.length >= 3 && (pn.includes(p) || p.includes(pn))) return 80;
      const pd = levenshtein(pn, p);
      if (pd <= 1 && Math.min(pn.length, p.length) >= 3) return 82;
    }
  }

  // Token overlap with light fuzzy (좌석 ↔ 자석)
  const partTokens = cleaned
    .replace(/[()[\]{}]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  const nameTokens = catalogName
    .replace(/[()[\]{}]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  if (partTokens.length === 0 || nameTokens.length === 0) return 0;

  let hits = 0;
  for (const pt of partTokens) {
    const pk = normalizeMatchKey(pt);
    const matched = nameTokens.some((nt) => {
      const nk = normalizeMatchKey(nt);
      if (!pk || !nk) return false;
      if (pk === nk || nk.includes(pk) || pk.includes(nk)) return true;
      return (
        Math.min(pk.length, nk.length) >= 3 &&
        levenshtein(pk, nk) <= 1
      );
    });
    if (matched) hits += 1;
  }
  const ratio = hits / partTokens.length;
  if (ratio >= 0.75 && hits >= 1) return 60 + Math.round(ratio * 20);
  return 0;
}

/**
 * Split items by ` / ` or `,` and match catalog names (best-effort).
 * Strips price tokens first. Unmatched fragments become the free-text note.
 */
const ITEM_QTY_RE = /\s*(?:[xX×]\s*(\d{1,3})|(\d{1,3})\s*(?:개|ea|EA|세트|셋트|set|SET|pcs))\s*$/;

/** 조각 끝의 수량 표기(x3, ×3, 3개, 3세트) 분리 */
export function splitItemQty(part: string): { text: string; qty: number; explicit?: boolean } {
  const m = part.match(ITEM_QTY_RE);
  if (m && m.index !== undefined && m.index > 0) {
    const qty = Number(m[1] || m[2]) || 1;
    return { text: part.slice(0, m.index).trim(), qty: Math.max(1, qty), explicit: Boolean(m[1]) };
  }
  return { text: part.trim(), qty: 1 };
}

export function parseItemsAgainstCatalog(
  items: string,
  catalog: Product[] | string[],
): { selected: string[]; note: string; qty: Record<string, number> } {
  const raw = stripItemPrices(items || '').trim();
  if (!raw) return { selected: [], note: '', qty: {} };

  const names = catalog.map((c) => (typeof c === 'string' ? c : c.name));

  const parts = raw
    .split(/\s*\/\s*|\s*,\s*/)
    .map((p) => stripItemPrices(p).trim())
    .filter(Boolean);

  const qty: Record<string, number> = {};
  const extras: string[] = [];

  // 이미 고른 제품은 뒤로 (같은 점수일 때 다른 제품 우선 — 기존 동작 유지), 없으면 같은 제품 수량 합산
  const bestName = (text: string): string | null => bestOf(text, true) ?? bestOf(text, false);
  const bestOf = (text: string, skipUsed: boolean): string | null => {
    let best: string | null = null;
    let bestScore = 0;
    for (const name of names) {
      if (skipUsed && qty[name]) continue;
      const score = scoreCatalogMatch(text, name);
      // 같은 점수면 더 긴(구체적인) 이름 우선
      if (score > bestScore || (score > 0 && score === bestScore && best && name.length > best.length)) {
        bestScore = score;
        best = name;
      }
    }
    return best && bestScore >= 60 ? best : null;
  };

  for (const part of parts) {
    if (isRequestPart(part)) {
      extras.push(part);
      continue;
    }
    const sp = splitItemQty(part);
    const whole = bestName(part);
    let name = whole;
    let n = 1;
    if (sp.qty > 1) {
      const stripped = bestName(sp.text);
      const countsInWhole = whole ? Array.from(whole.matchAll(/(\d{1,3})\s*(?:개|ea|세트|셋트|set|pcs)/gi)).map((m) => Number(m[1])) : [];
      // 제품명 자체에 들어 있는 개수(예: '(풀셋 5개)')는 수량이 아님
      if (!sp.explicit && whole && countsInWhole.includes(sp.qty) && (!stripped || stripped === whole)) {
        name = whole;
      } else if (stripped) {
        name = stripped;
        n = sp.qty;
      }
    }
    if (name) {
      qty[name] = (qty[name] || 0) + n;
      continue;
    }
    extras.push(part);
  }

  return {
    selected: names.filter((n) => qty[n]),
    note: extras.join(' / '),
    qty,
  };
}

/** Join selected catalog items + optional note into items string. */
export function joinItems(selected: string[], note: string, qty?: Record<string, number>): string {
  const parts = selected
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (qty && (qty[s] || 1) > 1 ? `${s} x${qty[s]}` : s));
  const n = note.trim();
  if (n) parts.push(n);
  return parts.join(' / ');
}

