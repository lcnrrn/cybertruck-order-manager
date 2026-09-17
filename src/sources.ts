import type { Order } from './types';

/** Preset 주문 경로 labels (stored in Order.group). */
export const SOURCE_PRESETS = [
  '네이버 폼',
  '카페',
  '카카오톡',
  '오너스크럽',
  '기타',
] as const;

export type SourcePreset = (typeof SOURCE_PRESETS)[number];

export type SourceFilter = '전체' | string;

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

/** Build filter chip list: 전체 + presets + extras present in data. */
export function buildSourceFilterOptions(orders: Order[]): string[] {
  const present = new Set<string>();
  for (const o of orders) {
    const g = (o.group || '').trim();
    if (g) present.add(g);
  }
  const extras = [...present]
    .filter((s) => !(SOURCE_PRESETS as readonly string[]).includes(s))
    .sort((a, b) => a.localeCompare(b, 'ko'));
  return ['전체', ...SOURCE_PRESETS, ...extras];
}
