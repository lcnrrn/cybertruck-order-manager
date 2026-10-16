import assert from 'node:assert/strict';
import { parseOrderProducts, orderGrams } from '../src/production.ts';
import { DEFAULT_PRODUCTS } from '../src/products.ts';
import { normalizeFilament, pendingByType, productParts } from '../src/filament.ts';

const names = DEFAULT_PRODUCTS.map((p) => p.name);
const q = (items: string) => parseOrderProducts(items, names).products;

assert.deepEqual(q('안전벨트 클립 (풀셋 5개)'), [{ name: '안전벨트 클립 (풀셋 5개)', qty: 1 }]);
assert.deepEqual(q('안전벨트 클립 (뒷자석 3개) 20,000원'), [{ name: '안전벨트 클립 (뒷자석 3개)', qty: 1 }]);
assert.equal(q('안전벨트 클립 풀셋 5개')[0]?.qty, 1);
assert.equal(q('휴대폰 마운트 거치대 x2')[0]?.qty, 2);
assert.equal(q('견인고리 커버 2개')[0]?.qty, 2);
assert.ok(q('일론머스크사진 판 9.5*10').every((p) => p.qty === 1));

const catalog = DEFAULT_PRODUCTS.map((p) => ({ ...p, filaments: [{ typeId: 'ft-b', grams: 50 }] }));
const st = normalizeFilament({ types: [{ id: 'ft-b', material: 'PETG', color: 'BLACK' }] });
const orders = [
  { id: '1', status: '대기', name: 'a', items: '안전벨트 클립 (풀셋 5개) / 휴대폰 마운트 거치대' },
  { id: '2', status: '완료', name: 'b', items: '휴대폰 마운트 거치대' },
] as never[];
assert.equal(pendingByType(orders, catalog, st)['ft-b'], 100);
assert.equal(orderGrams(orders[0], catalog), 100);
// 0g 행도 편집 화면에선 보여야 함, 계산에선 제외
const p0 = { name: 'x', filaments: [{ typeId: 'ft-b', grams: 0 }] } as never;
assert.equal(productParts(p0, true).length, 1);
assert.equal(productParts(p0).length, 0);
console.log('filament needs OK');
