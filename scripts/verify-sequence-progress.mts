import assert from 'node:assert/strict';
import { compareOrders, moveSeq, setSeq, compactSeq } from '../src/sequence.ts';
import { buildProductionSummary, orderItemProgress, progressTotals, pendingGrams } from '../src/production.ts';
import { DEFAULT_PRODUCTS } from '../src/products.ts';
import type { Order } from '../src/types.ts';

const mk = (id: string, createdAt: number, extra: Partial<Order> = {}): Order =>
  ({ id, name: id, items: '', address: '', phone: '', status: '대기', priority: false, createdAt, updatedAt: createdAt, ...extra }) as Order;
const ids = (os: Order[]) => [...os].sort(compareOrders).map((o) => o.id);

let os = [mk('a', 1), mk('b', 2), mk('c', 3), mk('d', 4, { priority: true }), mk('e', 5, { status: '완료', seq: 1 })];
assert.deepEqual(ids(os), ['d', 'e', 'c', 'b', 'a']); // 완료 seq 무시 (createdAt 순)
os = setSeq(os, 'a', 1);
assert.deepEqual(ids(os).slice(0, 3), ['d', 'a', 'e']);
os = setSeq(os, 'b', 1);
assert.deepEqual(ids(os).slice(0, 4), ['d', 'b', 'a', 'e']);
assert.equal(os.find((o) => o.id === 'a')!.seq, 2);
os = moveSeq(os, 'c', -1); // c 위로 → b,c,a
assert.deepEqual(ids(os).slice(0, 4), ['d', 'b', 'c', 'a']);
assert.deepEqual(['d', 'b', 'c', 'a'].map((x) => os.find((o) => o.id === x)!.seq), [1, 2, 3, 4]); // 화면 순서대로 번호
assert.equal(moveSeq(os, 'b', -1), os); // ★ 그룹 넘어가지 않음
os = os.map((o) => (o.id === 'c' ? { ...o, status: '완료' as const, seq: undefined } : o));
os = compactSeq(os);
assert.deepEqual(['d', 'b', 'a'].map((x) => os.find((o) => o.id === x)!.seq), [1, 2, 3]);
os = setSeq(os, 'b', null);
assert.equal(os.find((o) => o.id === 'b')!.seq, undefined);
assert.equal(os.find((o) => o.id === 'a')!.seq, 2);

// 남은 수량
const names = DEFAULT_PRODUCTS.map((p) => p.name);
const items = '휴대폰 마운트 거치대 x3 / 견인고리 커버';
const o1 = mk('p', 1, { items, doneMap: { '휴대폰 마운트 거치대': 2 } });
const prog = orderItemProgress(o1, names);
assert.deepEqual(progressTotals(prog), { done: 2, total: 4 });
const sum = buildProductionSummary([o1], DEFAULT_PRODUCTS);
assert.equal(sum.rows.find((r) => r.name === '휴대폰 마운트 거치대')!.total, 1);
assert.equal(sum.total, 2);
const done = mk('q', 1, { items, doneMap: { '휴대폰 마운트 거치대': 3, '견인고리 커버': 1 } });
assert.equal(buildProductionSummary([done], DEFAULT_PRODUCTS).orderCount, 0);
const cat = DEFAULT_PRODUCTS.map((p) => ({ ...p, grams: 10, filaments: undefined }));
assert.equal(pendingGrams([o1], cat), 20);
console.log('sequence + progress OK');

// 추가 메모는 제작 체크·만들 제품에 나오면 안 됨
const withMemo = mk('m', 1, { items: '휴대폰 마운트 거치대 x2 / 블랙으로 부탁해요\n빨리 보내주세요', doneMap: { '휴대폰 마운트 거치대': 1 } });
const pm = orderItemProgress(withMemo, names);
assert.deepEqual(pm.map((x) => x.key), ['휴대폰 마운트 거치대']);
assert.deepEqual(progressTotals(pm), { done: 1, total: 2 });
const sm = buildProductionSummary([withMemo], DEFAULT_PRODUCTS);
assert.equal(sm.others.length, 0);
assert.equal(sm.total, 1);
console.log('memo exclusion OK');
