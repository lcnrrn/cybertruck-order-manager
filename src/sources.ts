import type { Order } from './types';

const STORAGE_KEY = 'cybertruck-sources-v1';

/** Built-in default 주문 경로 labels (stored in Order.group). */
export const DEFAULT_SOURCES = ['TKC', '오너스클럽', '기타'] as const;

/** @deprecated Prefer getSources(); kept as alias of defaults for callers. */
export const SOURCE_PRESETS = DEFAULT_SOURCES;

export type SourcePreset = (typeof DEFAULT_SOURCES)[number];

export type SourceFilter = '전체' | string;

export type SourceColor = {
  bg: string;
  border: string;
  text: string;
};

/** Dark-theme friendly built-in colors for the three defaults. */
const BUILTIN_COLORS: Record<string, SourceColor> = {
  TKC: { bg: '#1e3a5f', border: '#3b82f6', text: '#bfdbfe' },
  오너스클럽: { bg: '#3b1f5e', border: '#a855f7', text: '#e9d5ff' },
  기타: { bg: '#1e293b', border: '#64748b', text: '#cbd5e1' },
};

/** Palette for hashed custom sources (dark-theme friendly). */
const HASH_PALETTE: SourceColor[] = [
  { bg: '#14532d', border: '#22c55e', text: '#bbf7d0' },
  { bg: '#7c2d12', border: '#f97316', text: '#fed7aa' },
  { bg: '#831843', border: '#ec4899', text: '#fbcfe8' },
  { bg: '#155e75', border: '#06b6d4', text: '#a5f3fc' },
  { bg: '#713f12', border: '#eab308', text: '#fef08a' },
  { bg: '#312e81', border: '#818cf8', text: '#c7d2fe' },
  { bg: '#881337', border: '#f43f5e', text: '#fecdd3' },
  { bg: '#134e4a', border: '#14b8a6', text: '#99f6e4' },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Stable color for a source name — built-ins first, else hashed palette. */
export function getSourceColor(name: string): SourceColor {
  const key = name.trim();
  if (!key) {
    return { bg: '#1e293b', border: '#475569', text: '#94a3b8' };
  }
  if (BUILTIN_COLORS[key]) return BUILTIN_COLORS[key];
  return HASH_PALETTE[hashString(key) % HASH_PALETTE.length];
}

function normalizeList(list: unknown): string[] | null {
  if (!Array.isArray(list)) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const t = item.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.length > 0 ? out : null;
}

/** Load user source list from localStorage; fall back to defaults if empty. */
export function getSources(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = normalizeList(JSON.parse(raw) as unknown);
      if (parsed) return parsed;
    }
  } catch {
    /* ignore */
  }
  return [...DEFAULT_SOURCES];
}

/** Persist source list. Empty / invalid writes are ignored (keeps defaults). */
export function setSources(list: string[]): void {
  const normalized = normalizeList(list);
  if (!normalized) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    /* ignore */
  }
}

/**
 * Apply chosen 주문 경로 to imported rows.
 * - Always sets `group` to the chosen source.
 * - If parse had put a cafe nickname into `group`, keep it on `name`
 *   as `닉네임 성함` when not already present.
 */
export function applyOrderSource(
  partials: Partial<Order>[],
  source: string,
): Partial<Order>[] {
  const src = source.trim();
  if (!src) return partials;

  return partials.map((o) => {
    const previous = (o.group || '').trim();
    let name = (o.name || '').trim();

    if (previous && previous !== src) {
      const alreadyPrefixed =
        !name ||
        name === previous ||
        name.startsWith(`${previous} `) ||
        name.startsWith(previous);
      if (!alreadyPrefixed) {
        name = `${previous} ${name}`;
      } else if (!name) {
        name = previous;
      }
    }

    return {
      ...o,
      name: name || o.name || '이름없음',
      group: src,
    };
  });
}

/**
 * Build filter chip list: 전체 + current managed sources + extras present in data.
 * Deleted sources that still appear on orders remain as extras (still filterable).
 */
export function buildSourceFilterOptions(
  orders: Order[],
  managedSources: string[] = getSources(),
): string[] {
  const managed = managedSources.map((s) => s.trim()).filter(Boolean);
  const managedSet = new Set(managed);
  const present = new Set<string>();
  for (const o of orders) {
    const g = (o.group || '').trim();
    if (g) present.add(g);
  }
  const extras = [...present]
    .filter((s) => !managedSet.has(s))
    .sort((a, b) => a.localeCompare(b, 'ko'));
  return ['전체', ...managed, ...extras];
}
