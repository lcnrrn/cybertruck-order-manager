import { markSettingChanged } from './settingsMeta';
import type { FilamentState, FilamentType } from './filament';

export const EXPENSES_LS_KEY = 'cybertruck-expenses-v1';
export const FILAMENT_CATEGORY = '필라멘트';
export const DEFAULT_EXPENSE_CATEGORIES = ['부속품', '기타'];

export interface Expense {
  id: string;
  /** 지출일 (ms) */
  at: number;
  category: string;
  note: string;
  amount: number;
  updatedAt: number;
  /** 삭제 표시(톰스톤) — 다른 기기에서 되살아나지 않게 */
  deleted?: boolean;
}

export interface ExpenseState {
  items: Expense[];
  categories: string[];
}

/** 화면/합계용 지출 한 줄 (필라멘트 구매 포함) */
export interface ExpenseLine {
  id: string;
  at: number;
  category: string;
  note: string;
  amount: number;
  /** 필라멘트 구매에서 온 줄이면 entry id */
  filamentEntryId?: string;
}

export function normalizeExpenses(v: unknown): ExpenseState {
  const src = (v && typeof v === 'object' ? v : {}) as Partial<ExpenseState>;
  const items: Expense[] = [];
  for (const x of Array.isArray(src.items) ? src.items : []) {
    if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !x.id) continue;
    items.push({
      id: x.id,
      at: Number(x.at) || 0,
      category: typeof x.category === 'string' && x.category.trim() ? x.category.trim() : '기타',
      note: typeof x.note === 'string' ? x.note : '',
      amount: Number(x.amount) || 0,
      updatedAt: Number(x.updatedAt) || 0,
      ...(x.deleted ? { deleted: true } : {}),
    });
  }
  const cats = Array.isArray(src.categories)
    ? Array.from(new Set(src.categories.filter((c): c is string => typeof c === 'string' && !!c.trim()).map((c) => c.trim())))
    : [];
  return { items, categories: cats.length ? cats.filter((c) => c !== FILAMENT_CATEGORY) : [...DEFAULT_EXPENSE_CATEGORIES] };
}

/** id별로 updatedAt이 큰 쪽 우선 (같으면 a 우선). 삭제 표시도 그대로 전파 */
export function mergeById<T extends { id?: string; updatedAt?: number }>(a: T[], b: T[]): T[] {
  const m = new Map<string, T>();
  for (const e of [...a, ...b]) {
    if (!e || !e.id) continue;
    const ex = m.get(e.id);
    if (!ex || (e.updatedAt || 0) > (ex.updatedAt || 0)) m.set(e.id, e);
  }
  return Array.from(m.values());
}

export function mergeExpenseStates(local: ExpenseState, remote: ExpenseState, localNewer: boolean): ExpenseState {
  const items = mergeById(remote.items, local.items).sort((x, y) => x.at - y.at);
  return { items, categories: localNewer ? local.categories : remote.categories };
}

export function loadExpenses(): ExpenseState {
  try {
    const raw = localStorage.getItem(EXPENSES_LS_KEY);
    if (raw) return normalizeExpenses(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return normalizeExpenses(null);
}

export function saveExpenses(s: ExpenseState): void {
  try {
    localStorage.setItem(EXPENSES_LS_KEY, JSON.stringify(s));
    markSettingChanged('expenses');
  } catch {
    /* ignore */
  }
}

export function newExpenseId(): string {
  return `ex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 수동 지출 + 금액이 입력된 필라멘트 구매 → 지출 목록 (최신순) */
export function expenseLines(exp: ExpenseState, fil: Pick<FilamentState, 'entries' | 'types'> | null): ExpenseLine[] {
  const out: ExpenseLine[] = exp.items
    .filter((x) => !x.deleted && x.amount > 0)
    .map((x) => ({ id: x.id, at: x.at, category: x.category, note: x.note, amount: x.amount }));
  for (const e of fil?.entries || []) {
    if (e.deleted || e.kind !== 'purchase' || !(e.cost && e.cost > 0)) continue;
    const t: FilamentType | undefined = fil?.types.find((x) => x.id === (e.typeId || 'default'));
    const label = t ? `${t.material} ${t.color}`.trim() : '기본 (미지정)';
    out.push({
      id: `fil-${e.id}`,
      at: e.at,
      category: FILAMENT_CATEGORY,
      note: `${label} ${e.grams.toLocaleString('ko-KR')}g${e.note ? ` · ${e.note}` : ''}`,
      amount: e.cost,
      filamentEntryId: e.id,
    });
  }
  return out.sort((a, b) => b.at - a.at);
}

export function inBounds(at: number, bounds: [number, number] | null): boolean {
  return !bounds || (at >= bounds[0] && at <= bounds[1]);
}

export function expenseTotals(lines: ExpenseLine[]): { total: number; byCategory: [string, number][] } {
  const m = new Map<string, number>();
  for (const l of lines) m.set(l.category, (m.get(l.category) || 0) + l.amount);
  const byCategory = [...m.entries()].sort((a, b) => {
    if (a[0] === FILAMENT_CATEGORY) return -1;
    if (b[0] === FILAMENT_CATEGORY) return 1;
    return b[1] - a[1];
  });
  return { total: lines.reduce((s, l) => s + l.amount, 0), byCategory };
}
