import type { Order } from './types';

import { markSettingChanged } from './settingsMeta';

const KEY = 'cybertruck-filament-v1';

export interface FilamentEntry {
  id: string;
  at: number;
  /** +구매 / ±재고 보정 (g) */
  grams: number;
  note: string;
  kind: 'purchase' | 'adjust';
}

export interface FilamentState {
  entries: FilamentEntry[];
  threshold: number;
}

export function loadFilament(): FilamentState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<FilamentState>;
      return {
        entries: Array.isArray(p.entries) ? p.entries.filter((e) => e && typeof e.grams === 'number') : [],
        threshold: typeof p.threshold === 'number' && p.threshold >= 0 ? p.threshold : 1000,
      };
    }
  } catch {
    /* ignore */
  }
  return { entries: [], threshold: 1000 };
}

export function saveFilament(s: FilamentState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    markSettingChanged('filament');
  } catch {
    /* ignore */
  }
}

export function consumedTotal(orders: Order[]): number {
  return orders.reduce((s, o) => s + (o.filamentG || 0), 0);
}

export function currentStock(state: FilamentState, orders: Order[]): number {
  return state.entries.reduce((s, e) => s + e.grams, 0) - consumedTotal(orders);
}

const DAY = 86400000;

/** 최근 30일 일평균 사용량 (g/일) */
export function avgDailyUsage(orders: Order[], now = Date.now()): number {
  const since = now - 30 * DAY;
  const used = orders
    .filter((o) => o.filamentG && o.filamentAt && o.filamentAt >= since)
    .reduce((s, o) => s + (o.filamentG || 0), 0);
  return used / 30;
}

export function newEntryId(): string {
  return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
