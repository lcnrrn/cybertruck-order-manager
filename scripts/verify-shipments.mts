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

// ── 경동화물(수동 송장, carrier) ──
{
  const { addCourierShipment, cancelCourierShipment, smsTrackingOf, parseShipments } = await import('../src/shipments.ts');
  const { trackUrl, kyungdongTrackUrl, carrierOf } = await import('../src/carrier.ts');
  const { buildShippingSmsBody } = await import('../src/sms.ts');
  const mat: Order = { id: 'm1', name: 'MAT주문', items: 'MAT', address: '', phone: '', status: '제작중', priority: false, createdAt: 1, updatedAt: 1 };
  const mp = [{ key: 'MAT', label: 'MAT', qty: 1, done: 1, matched: true }];
  assert.equal(addCourierShipment(mat, { MAT: 1 }, mp, '   ', {}, 5), null); // 송장 없으면 안 만듦
  assert.equal(addCourierShipment(mat, { MAT: 1 }, [{ ...mp[0], done: 0 }], '123', {}, 5), null); // 안 만든 건 못 보냄
  const k1 = addCourierShipment(mat, { MAT: 1 }, mp, '3202-1134 41986', { fee: 35000, feeExpenseId: 'ex-1' }, 100)!;
  const ks = k1.shipments![0];
  assert.equal(ks.carrier, 'kyungdong');
  assert.equal(ks.postStatus, 'registered'); // 우체국 접수 대기(requested) 안 거침
  assert.equal(ks.trackingNumber, '32021134 41986'.replace(' ', ''));
  assert.equal(ks.fee, 35000);
  assert.equal(ks.prepaid, true);
  assert.equal(k1.trackingNumber, undefined); // 주문 대표 송장(K열, 우체국 루틴이 봄)은 안 건드림
  assert.equal(isFullyShipped(k1, mp), true); // → 앱이 자동 완료 처리
  assert.equal(pendingShipmentCountOf(k1), 0); // 우체국 전송 대기 0
  assert.equal(addCourierShipment(k1, { MAT: 1 }, mp, '3202113441986', {}, 101), null); // 같은 송장/수량 중복 방지
  // 우체국 송장 붙이기(attachTracking)는 경동 건을 건드리지 않음
  assert.equal(attachTracking(k1, '6892013747030', 110).shipments![0].trackingNumber, ks.trackingNumber);
  // 링크
  assert.equal(kyungdongTrackUrl('3202113441986'), 'https://kdexp.com/service/delivery/etc/delivery.do?barcode=3202113441986');
  assert.equal(trackUrl(carrierOf(ks), ks.trackingNumber!), kyungdongTrackUrl('3202113441986'));
  assert.match(trackUrl('epost', '6892013747030'), /epost\.go\.kr/);
  assert.equal(carrierOf({}), 'epost'); // 옛 데이터(carrier 없음) = 우체국
  // 문자
  const kt = smsTrackingOf(k1);
  assert.equal(kt.carrier, 'kyungdong');
  const kd = buildShippingSmsBody(kt.trackingNumber, kt.carrier);
  assert.match(kd, /경동화물 송장번호는 3202113441986 입니다/);
  assert.match(kd, /kdexp\.com\/service\/delivery\/etc\/delivery\.do\?barcode=3202113441986/);
  assert.ok(!kd.includes('우체국'));
  const ep = buildShippingSmsBody('6892013747030');
  assert.match(ep, /우체국 등기번호는 6892013747030 입니다/); // 기존 문구 그대로
  assert.ok(!ep.includes('kdexp'));
  assert.equal(smsTrackingOf({ shipments: undefined, trackingNumber: '6892013747030' }).carrier, 'epost');
  // 시트 R열 왕복: carrier 보존, 옛 JSON(carrier 없음)은 그대로
  const back2 = sheets.rowToOrder(sheets.orderToRow(k1))!;
  assert.equal(back2.shipments![0].carrier, 'kyungdong');
  assert.equal(back2.shipments![0].feeExpenseId, 'ex-1');
  assert.deepEqual(back2.shipments, k1.shipments);
  assert.equal(parseShipments([{ id: 'a', no: 1, items: { X: 1 }, postStatus: 'registered', trackingNumber: '6892013747030', requestedAt: 1, updatedAt: 1 }])![0].carrier, undefined);
  // 병합: 경동 건 취소가 더 최신이면 되살아나지 않음, 옛 사본이 송장을 덮지 않음
  const canc = cancelCourierShipment(k1, ks.id, 200)!;
  assert.equal(mergeShipments(k1.shipments, canc.shipments)![0].postStatus, 'cancelled');
  assert.equal(mergeShipments(canc.shipments, k1.shipments)![0].postStatus, 'cancelled');
  assert.equal(cancelCourierShipment(o2, o2.shipments![0].id, 1), null); // 우체국 건은 이 경로로 못 지움
  // 전체 합본: 경동 + 우체국 같이 있는 주문
  const mixed = addShipment(k1, {}, mp, 1);
  assert.equal(mixed, null);
  console.log('shipments courier(kyungdong) OK');
}
function pendingShipmentCountOf(o: Order): number { return (o.shipments || []).filter((s) => s.postStatus === 'requested').length; }
