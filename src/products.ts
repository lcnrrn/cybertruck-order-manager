const STORAGE_KEY = 'cybertruck-products-v1';

export type ProductColor = {
  bg: string;
  border: string;
  text: string;
};

export type Product = {
  name: string;
  color: ProductColor;
};

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
    if (typeof item === 'string') {
      name = item.trim();
    } else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      if (typeof o.name === 'string') name = o.name.trim();
      if (isColor(o.color)) color = o.color;
    }
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, color: color ?? colorForName(name, i) });
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
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
 * Split items by ` / ` or `,` and match catalog names (best-effort).
 * Unmatched fragments become the free-text note.
 */
export function parseItemsAgainstCatalog(
  items: string,
  catalog: Product[] | string[],
): { selected: string[]; note: string } {
  const raw = (items || '').trim();
  if (!raw) return { selected: [], note: '' };

  const names = catalog.map((c) => (typeof c === 'string' ? c : c.name));
  const catalogSet = new Set(names);

  const parts = raw
    .split(/\s*\/\s*|\s*,\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  const selectedSet = new Set<string>();
  const extras: string[] = [];

  for (const part of parts) {
    if (catalogSet.has(part)) {
      selectedSet.add(part);
      continue;
    }
    const norm = part.replace(/\s+/g, ' ').toLowerCase();
    const fuzzy = names.find(
      (c) => c.replace(/\s+/g, ' ').toLowerCase() === norm,
    );
    if (fuzzy) {
      selectedSet.add(fuzzy);
      continue;
    }
    extras.push(part);
  }

  return {
    selected: names.filter((n) => selectedSet.has(n)),
    note: extras.join(' / '),
  };
}

/** Join selected catalog items + optional note into items string. */
export function joinItems(selected: string[], note: string): string {
  const parts = selected.map((s) => s.trim()).filter(Boolean);
  const n = note.trim();
  if (n) parts.push(n);
  return parts.join(' / ');
}
