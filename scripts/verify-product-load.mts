// 「PETG BLACK 필요 87,709g · 1602시간」 재현: 트럭 MAT 이 제품 관리에 1개당 14,000g · 15,000분으로 들어가 있어
// 대기 주문 6건 × 14kg = 84kg. 계산 자체는 1개당 × 수량(한 번만) — 이중 곱셈 없음을 확인하고, 이상값을 경고로 잡는지 확인.
import assert from 'node:assert/strict';
import { orderGrams, pendingGrams, pendingLoadByProduct, pendingMinutes } from '../src/production.ts';
import { normalizeFilament, pendingByType } from '../src/filament.ts';
import type { Order } from '../src/types.ts';

const catalog = [
  { name: '트럭 MAT', price: 350000, grams: 14000, minutes: 15000, filaments: [{ typeId: 'default', grams: 14000 }] },
  { name: 'TPU 연결 파츠', price: 20000, grams: 110.93, minutes: 125, filaments: [{ typeId: 'ft-tpu', grams: 110.93 }] },
  { name: '휴대폰 마운트 거치대', price: 13000, grams: 58.04, minutes: 63 },
  { name: '안전벨트 클립 (뒷자석 3개)', price: 5000, grams: 8.95, minutes: 38 },
] as never[];
const st = normalizeFilament({ types: [{ id: 'default', material: 'PETG', color: 'BLACK' }, { id: 'ft-tpu', material: 'TPU95A', color: 'BLACK' }] });
const mk = (id: string, items: string, extra: Partial<Order> = {}): Order =>
  ({ id, name: id, items, address: '', phone: '', status: '대기', priority: false, updatedAt: 1, createdAt: 1, ...extra }) as Order;

const orders = [
  mk('a', '트럭 MAT / TPU 연결 파츠'),
  mk('b', '트럭 MAT x2 / 안전벨트 클립 (뒷자석 3개) x3'),
  mk('c', '휴대폰 마운트 거치대', { filamentGrams: { '휴대폰 마운트 거치대#0': 100 } }),
  mk('d', '트럭 MAT', { status: '완료' }),
  mk('e', '트럭 MAT x2', { doneMap: { '트럭 MAT': 1 } }),
];
// 수량은 한 번만 곱함
assert.equal(orderGrams(orders[1], catalog), 14000 * 2 + 8.95 * 3);
assert.equal(orderGrams(orders[4], catalog, true), 14000);
// 직접 지정 g 은 줄 총량
assert.equal(orderGrams(orders[2], catalog), 100);
const need = pendingByType(orders, catalog, st);
assert.ok(Math.abs(need.default - (14000 * 4 + 8.95 * 3 + 100)) < 1e-6); // filaments 없는 제품은 기본(PETG BLACK)
assert.ok(Math.abs(pendingGrams(orders, catalog) - (14000 * 4 + 110.93 + 8.95 * 3 + 100)) < 1e-6);
assert.equal(pendingMinutes(orders, catalog), 15000 * 4 + 125 + 38 * 3 + 63);

const loads = pendingLoadByProduct(orders, catalog);
assert.equal(loads[0].name, '트럭 MAT');
assert.equal(loads[0].qty, 4);
assert.equal(loads[0].grams, 56000);
assert.equal(loads[0].suspicious, true);
assert.ok(loads.filter((l) => l.name !== '트럭 MAT').every((l) => !l.suspicious));
assert.equal(loads.find((l) => l.name === '휴대폰 마운트 거치대')?.grams, 100);
assert.equal(loads.find((l) => l.name === '안전벨트 클립 (뒷자석 3개)')?.qty, 3);
console.log('product load OK');
