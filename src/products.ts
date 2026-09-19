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
function scoreCatalogMatch(part: string, catalogName: string): number {
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
export function parseItemsAgainstCatalog(
  items: string,
  catalog: Product[] | string[],
): { selected: string[]; note: string } {
  const raw = stripItemPrices(items || '').trim();
  if (!raw) return { selected: [], note: '' };

  const names = catalog.map((c) => (typeof c === 'string' ? c : c.name));

  const parts = raw
    .split(/\s*\/\s*|\s*,\s*/)
    .map((p) => stripItemPrices(p).trim())
    .filter(Boolean);

  const selectedSet = new Set<string>();
  const extras: string[] = [];
  const used = new Set<string>();

  for (const part of parts) {
    if (isRequestPart(part)) {
      extras.push(part);
      continue;
    }

    let best: string | null = null;
    let bestScore = 0;
    for (const name of names) {
      if (used.has(name)) continue;
      const score = scoreCatalogMatch(part, name);
      if (score > bestScore) {
        bestScore = score;
        best = name;
      }
    }

    // Prefer longer catalog names on ties (already handled by first max;
    // bump specificity: if equal scores, prefer longer name)
    if (best && bestScore >= 60) {
      // Re-scan for equal score longer name
      let chosen = best;
      for (const name of names) {
        if (used.has(name)) continue;
        const score = scoreCatalogMatch(part, name);
        if (
          score === bestScore &&
          name.length > chosen.length
        ) {
          chosen = name;
        }
      }
      selectedSet.add(chosen);
      used.add(chosen);
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
