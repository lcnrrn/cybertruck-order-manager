// 세트 제품(구성품) 제작 진행 · 옛 완료 체크 호환 · 남은 g/분 · 시트 R 열 왕복
import assert from 'node:assert/strict';
import { normalizeProducts, partsTotals, withPartTotals, type Product } from '../src/products.ts';
import {
  applyPartCount, orderGrams, orderItemProgress, orderMinutes, orderPartProgress, partKey, pctKey,
  pendingLoadByProduct, remainingUnits,
} from '../src/production.ts';
import { orderToRow, rowToOrder } from '../src/google/sheets.ts';
import type { Order } from '../src/types.ts';

const MAT = '트럭 MAT';
const raw = [{ name: MAT, color: { bg: '#155e75', border: '#06b6d4', text: '#a5f3fc' }, price: 350000, grams: 14000, minutes: 15000,
  filaments: [{ typeId: 'default', grams: 14000 }],
  parts: [{ name: 'MAT 조각', qty: 48, grams: 290, minutes: 300 }, { name: '블로커', qty: 6, grams: 100, minutes: 0 }, { name: '자투리 MAT', qty: 6, grams: 133, minutes: 0 }] },
  { name: '클립', color: { bg: '#000', border: '#111', text: '#fff' }, price: 5000, grams: 10, minutes: 30 }];
const catalog = normalizeProducts(raw)!.map(withPartTotals);
const mat = catalog[0];
// 1) 저장 형식 · 합계
assert.equal(mat.parts!.length, 3);
const t = partsTotals(mat.parts);
assert.equal(t.grams, 15318); assert.equal(t.minutes, 14400); assert.deepEqual(t.missingTime, ['블로커', '자투리 MAT']);
assert.equal(mat.grams, 15318); assert.equal(mat.minutes, 14400); assert.equal(mat.filaments![0].grams, 15318);
// 구성품 없는 제품은 그대로
assert.equal(catalog[1].grams, 10); assert.equal(catalog[1].parts, undefined);
// 옛 형식(구성품 없음)도 그대로 읽힘
assert.equal(normalizeProducts([{ name: 'x', grams: 5 }])![0].parts, undefined);

const names = catalog.map((p) => p.name);
const base: Order = { id: 'o1', name: '김', items: `${MAT} / 클립 x2`, address: '', phone: '', status: '대기', priority: false, createdAt: 1, updatedAt: 1 };

// 2) MAT 조각 12개 → 세트 미완성, 옛 키 없음, 진행률 키
let d = applyPartCount(undefined, mat, 1, 'MAT 조각', 12);
assert.equal(d[partKey(MAT, 'MAT 조각')], 12);
assert.equal(d[MAT], undefined);
assert.ok(d[pctKey(MAT)] > 0 && d[pctKey(MAT)] < 100);
assert.equal(orderItemProgress({ ...base, doneMap: d }, names).find((x) => x.key === MAT)!.done, 0);
// 남은 g/분
const o12 = { ...base, doneMap: d };
assert.equal(Math.round(remainingUnits(o12, mat, 1, 'grams') * 15318), 15318 - 12 * 290);
assert.equal(Math.round(orderMinutes(o12, catalog, true)), 14400 - 12 * 300 + 2 * 30);
assert.equal(Math.round(orderGrams(o12, catalog, true)), 15318 - 12 * 290 + 20);
assert.equal(Math.round(orderGrams(o12, catalog)), 15318 + 20); // 원가 계산용 전체 g = 구성품 합계

// 3) 모든 구성품 완료 → 옛 완료 체크(「트럭 MAT」=1) 자동, 진행률 키 제거
d = applyPartCount(d, mat, 1, 'MAT 조각', 48);
d = applyPartCount(d, mat, 1, '블로커', 6);
assert.equal(d[MAT], undefined);
d = applyPartCount(d, mat, 1, '자투리 MAT', 99); // 상한
assert.equal(d[partKey(MAT, '자투리 MAT')], 6);
assert.equal(d[MAT], 1);
assert.equal(d[pctKey(MAT)], undefined);
assert.equal(orderItemProgress({ ...base, doneMap: d }, names).find((x) => x.key === MAT)!.done, 1);
assert.equal(remainingUnits({ ...base, doneMap: d }, mat, 1, 'grams'), 0);

// 4) 하나라도 빼면 완료 해제
const d2 = applyPartCount(d, mat, 1, '블로커', 5);
assert.equal(d2[MAT], undefined);
assert.ok(d2[pctKey(MAT)] >= 99 - 1);

// 5) 옛 기기에서 체크만 한 주문(구성품 키 없음) → 구성품 전부 완료로 보임
const legacy = orderPartProgress({ doneMap: { [MAT]: 1 } }, mat, 1);
assert.ok(legacy.every((x) => x.done === x.need));
// 거기서 MAT 조각 하나 빼면 나머지는 유지
const d3 = applyPartCount({ [MAT]: 1 }, mat, 1, 'MAT 조각', 47);
assert.equal(d3[partKey(MAT, '블로커')], 6); assert.equal(d3[MAT], undefined);

// 6) 2세트 주문: 1세트분 다 하면 「트럭 MAT」=1
let e = applyPartCount(undefined, mat, 2, null, 1);
assert.equal(e[MAT], 1); assert.equal(e[partKey(MAT, 'MAT 조각')], 48);
e = applyPartCount(e, mat, 2, 'MAT 조각', 96);
assert.equal(e[MAT], 1);
// 발송된 세트 아래로는 못 내림
const f = applyPartCount({ [MAT]: 1 }, mat, 1, 'MAT 조각', 0, 1);
assert.equal(f[MAT], 1); assert.equal(f[partKey(MAT, 'MAT 조각')], 48);

// 7) 출력 큐: MAT 이상값 경고 없음, 남은 구성품
const loads = pendingLoadByProduct([o12], catalog);
const ml = loads.find((l) => l.name === MAT)!;
assert.equal(ml.suspicious, false);
assert.deepEqual(ml.parts!.map((p) => [p.name, p.left, p.noTime]), [['MAT 조각', 36, false], ['블로커', 6, true], ['자투리 MAT', 6, true]]);
assert.equal(Math.round(ml.grams), 15318 - 12 * 290);
assert.equal(ml.minutes, 36 * 300);
// 구성품 없는 큰 값은 여전히 경고
const big: Product[] = [{ name: 'B', color: catalog[1].color, grams: 9000, minutes: 10 }];
assert.equal(pendingLoadByProduct([{ ...base, items: 'B' }], big)[0].suspicious, true);

// 8) 시트 R 열 왕복 — 새 키가 그대로 저장/복원, 옛 키도 유지
const row = orderToRow({ ...base, status: '제작중', doneMap: d2 });
const back = rowToOrder(row)!;
assert.deepEqual(back.doneMap, d2);
const R = JSON.parse(row[17]);
assert.equal(R.d[partKey(MAT, 'MAT 조각')], 48);
// 조회 페이지(Apps Script 는 R.d 를 그대로 done 으로 넘김) → 진행률 키로 부분 진행 표시 가능
assert.equal(typeof R.d[pctKey(MAT)], 'number');
console.log('components OK');
