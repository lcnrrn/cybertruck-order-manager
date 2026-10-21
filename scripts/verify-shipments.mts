import assert from 'node:assert/strict';
import { addShipment, attachTracking, cancelShipment, isFullyShipped, mergeShipments, shippableItems } from '../src/shipments.ts';
import type { Order } from '../src/types.ts';

const base: Order = { id: 'o1', name: '홍길동', items: 'A x3, B', address: '', phone: '', status: '제작중', priority: false, createdAt: 1, updatedAt: 1 };
const prog = [{ key: 'A', label: 'A', qty: 3, done: 2, matched: true }, { key: 'B', label: 'B', qty: 1, done: 0, matched: true }];
assert.deepEqual(shippableItems(base, prog), { A: 2 });
const o1 = addShipment(base, { A: 5, B: 1 }, prog, 10)!;
assert.deepEqual(o1.shipments![0].items, { A: 2 }); // 만든 만큼만, B 제외
assert.equal(addShipment(o1, { A: 1 }, prog, 11), null); // 중복 방지
const prog2 = prog.map((p) => ({ ...p, done: p.qty }));
const o2 = addShipment(o1, shippableItems(o1, prog2), prog2, 20)!;
assert.equal(o2.shipments![1].no, 2);
assert.deepEqual(o2.shipments![1].items, { A: 1, B: 1 });
// 송장: 가장 오래된 송장 없는 건에
const t1 = attachTracking(o2, '6000 1111', 30);
assert.equal(t1.shipments![0].trackingNumber, '60001111');
assert.equal(t1.shipments![0].postStatus, 'registered');
assert.equal(isFullyShipped(t1, prog2), false);
const t2 = attachTracking(t1, '60002222', 40);
assert.equal(t2.shipments![1].trackingNumber, '60002222');
assert.equal(isFullyShipped(t2, prog2), true);
// 취소: requested 만
assert.equal(cancelShipment(t2, t2.shipments![0].id), null);
const c = cancelShipment(o2, o2.shipments![1].id, 50)!;
assert.deepEqual(shippableItems(c, prog2), { A: 1, B: 1 });
// 병합: registered 는 더 새로운 requested/cancelled 사본에도 안 되돌아감
const newerCancel = { ...o2.shipments![0], postStatus: 'cancelled' as const, updatedAt: 999 };
const m = mergeShipments([newerCancel], [t1.shipments![0]])!;
assert.equal(m[0].postStatus, 'registered');
assert.equal(m[0].trackingNumber, '60001111');
// 취소는 더 새로운 쪽이면 이김 (requested 오래된 사본이 되살리지 못함)
const m2 = mergeShipments([o2.shipments![1]], [c.shipments![1]])!;
assert.equal(m2[0].postStatus, 'cancelled');
console.log('shipments OK');

// 시트 R열 왕복 + 병합 (오래된 사본이 registered 를 못 되돌림)
const g = globalThis as unknown as Record<string, unknown>;
const mem = new Map<string, string>();
g.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) };
g.window = { dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
const sheets = await import('../src/google/sheets.ts');
const back = sheets.rowToOrder(sheets.orderToRow(t2))!;
assert.deepEqual(back.shipments, t2.shipments);
const older = { ...o2, updatedAt: 5 }; // 전송 대기 상태의 옛 사본
const merged1 = sheets.mergeByUpdatedAt([t2], [older])[0];
assert.equal(merged1.shipments![0].postStatus, 'registered');
const newerLocal = { ...o2, updatedAt: 9999 }; // 더 새로운 updatedAt 이지만 shipments 는 requested
const merged2 = sheets.mergeByUpdatedAt([newerLocal], [t2])[0];
assert.ok(merged2.shipments!.every((s) => s.postStatus === 'registered'));
console.log('shipments sheet round-trip OK');
