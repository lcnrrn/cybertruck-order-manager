import type { PeriodPreset, PeriodRange } from './types';

export function defaultPeriod(): PeriodRange {
  return { preset: 'all' };
}

export function startOfLocalDay(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

export function endOfLocalDay(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

/** Returns [fromMs, toMs] inclusive, or null when all-time / invalid custom. */
export function resolvePeriodBounds(period: PeriodRange): [number, number] | null {
  const now = new Date();
  if (period.preset === 'all') return null;

  if (period.preset === 'this_month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    return [from, to];
  }

  if (period.preset === 'last_month') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0).getTime();
    const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime();
    return [from, to];
  }

  // custom
  if (!period.from && !period.to) return null;
  const from = period.from ? startOfLocalDay(period.from) : Number.NEGATIVE_INFINITY;
  const to = period.to ? endOfLocalDay(period.to) : Number.POSITIVE_INFINITY;
  if (from > to) return null;
  return [from, to];
}

export function orderTimestamp(createdAt?: number, updatedAt?: number): number {
  if (typeof createdAt === 'number' && createdAt > 0) return createdAt;
  if (typeof updatedAt === 'number' && updatedAt > 0) return updatedAt;
  return 0;
}

export function formatPeriodLabel(period: PeriodRange): string {
  if (period.preset === 'this_month') return '이번 달';
  if (period.preset === 'last_month') return '지난 달';
  if (period.preset === 'all') return '전체 기간';
  const from = period.from || '…';
  const to = period.to || '…';
  return `${from} ~ ${to}`;
}

export const PERIOD_PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: 'this_month', label: '이번 달' },
  { id: 'last_month', label: '지난 달' },
  { id: 'all', label: '전체 기간' },
  { id: 'custom', label: '직접 선택' },
];
