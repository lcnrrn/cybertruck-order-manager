import assert from 'node:assert/strict';
import { expenseLines, expenseTotals, mergeById, mergeExpenseStates, normalizeExpenses, inBounds } from '../src/expenses.ts';
import { normalizeFilament, stockByType } from '../src/filament.ts';

const fil = normalizeFilament({
  types: [{ id: 'ft-b', material: 'PETG', color: 'BLACK' }],
  entries: [
    { id: 'e1', at: 1000, grams: 1000, note: '쿠팡', kind: 'purchase', typeId: 'ft-b', cost: 25000 },
    { id: 'e2', at: 2000, grams: 1000, note: '', kind: 'purchase', typeId: 'ft-b' }, // 금액 없음
    { id: 'e3', at: 3000, grams: 1000, note: '', kind: 'purchase', typeId: 'ft-b', cost: 9999, deleted: true },
    { id: 'e4', at: 3500, grams: -200, note: '', kind: 'adjust', typeId: 'ft-b' },
  ] as never,
});
const exp = normalizeExpenses({
  items: [
    { id: 'x1', at: 1500, category: '부속품', note: '자석', amount: 8000, updatedAt: 1 },
    { id: 'x2', at: 4000, category: '기타', note: '택배박스', amount: 3000, updatedAt: 1 },
    { id: 'x3', at: 4000, category: '기타', note: '삭제됨', amount: 5000, updatedAt: 2, deleted: true },
  ],
});
assert.deepEqual(exp.categories, ['부속품', '기타']);
const lines = expenseLines(exp, fil);
assert.deepEqual(lines.map((l) => l.id), ['x2', 'x1', 'fil-e1']);
const t = expenseTotals(lines);
assert.equal(t.total, 36000);
assert.deepEqual(t.byCategory, [['필라멘트', 25000], ['부속품', 8000], ['기타', 3000]]);
// 기간 필터
assert.equal(expenseTotals(lines.filter((l) => inBounds(l.at, [0, 2000]))).total, 33000);
// 삭제된 구매는 재고에서도 빠짐
assert.equal(stockByType(fil, [])['ft-b'], 1800);

// 병합: 수정은 updatedAt 큰 쪽, 삭제(톰스톤)는 되살아나지 않음, 양쪽 추가분 모두 유지
const local = normalizeExpenses({ items: [
  { id: 'a', at: 1, category: '기타', note: '수정됨', amount: 2000, updatedAt: 20 },
  { id: 'b', at: 1, category: '기타', note: '', amount: 1000, updatedAt: 30, deleted: true },
  { id: 'l', at: 1, category: '기타', note: '', amount: 1, updatedAt: 5 },
] });
const remote = normalizeExpenses({ items: [
  { id: 'a', at: 1, category: '기타', note: '원래', amount: 1000, updatedAt: 10 },
  { id: 'b', at: 1, category: '기타', note: '', amount: 1000, updatedAt: 10 },
  { id: 'r', at: 1, category: '기타', note: '', amount: 1, updatedAt: 5 },
] });
const m = mergeExpenseStates(local, remote, false);
const by = Object.fromEntries(m.items.map((x) => [x.id, x]));
assert.equal(by.a.amount, 2000);
assert.equal(by.b.deleted, true);
assert.ok(by.l && by.r);
// 필라멘트 기록 금액 수정 전파 (구버전 기록은 updatedAt 없음 → 수정본이 이김)
const fe = mergeById([{ id: 'e1', grams: 1000 }] as { id: string; updatedAt?: number; cost?: number }[], [{ id: 'e1', updatedAt: 9, cost: 30000 }]);
assert.equal(fe[0].cost, 30000);
console.log('expenses OK');
