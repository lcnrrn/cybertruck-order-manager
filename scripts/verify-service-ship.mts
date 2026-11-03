import assert from 'node:assert/strict';
import { DEFAULT_SVC_SHIP_FEE, isServiceShipping, reconcileSvcFee, svcShipFeeOf, wantsSvcFee } from '../src/serviceShip.ts';
import { estimateBalance } from '../src/balance.ts';
import { expenseLines, mergeExpenseStates, normalizeExpenses } from '../src/expenses.ts';
import type { Order } from '../src/types.ts';

const base: Order = { id: 'o1', name: '홍길동', items: '휴대폰 마운트 거치대 / 우체국 택배', address: '', phone: '', status: '제작중', priority: false, createdAt: 1, updatedAt: 1, prices: { '휴대폰 마운트 거치대': 10000 } };
const svc: Order = { ...base, prices: { ...base.prices, '우체국 택배': 0 } };
const FEE = 4500;
const empty = normalizeExpenses(null);

assert.equal(svcShipFeeOf({}), DEFAULT_SVC_SHIP_FEE);
assert.equal(DEFAULT_SVC_SHIP_FEE, 4500);
assert.equal(svcShipFeeOf({ svcShipFee: 5000 }), 5000);
assert.equal(svcShipFeeOf({ svcShipFee: 0 }), 0);
assert.equal(isServiceShipping(base), false);
assert.equal(isServiceShipping(svc), true);
// 다른 품목 서비스(0원)는 무료배송 아님
assert.equal(isServiceShipping({ ...base, prices: { '휴대폰 마운트 거치대': 0 } }), false);
// 택배 줄이 없으면 아님
assert.equal(isServiceShipping({ items: '휴대폰 마운트 거치대', prices: { '우체국 택배': 0 } }), false);

// 켬 → 4,500 지출 1건
const on = reconcileSvcFee(base, svc, empty, FEE, 100)!;
const live = on.items.filter((x) => !x.deleted);
assert.equal(live.length, 1);
assert.equal(live[0].id, 'svc-o1');
assert.equal(live[0].amount, 4500);
assert.equal(live[0].category, '택배비');
// 다시 저장해도(이미 켜져 있음) 중복 안 생김
assert.equal(reconcileSvcFee(svc, { ...svc, name: '홍길동2' }, on, FEE, 200), null);
assert.equal(on.items.length, 1);
// 두 기기에서 동시에 켜도 id 고정 → 합쳐도 1건
const devA = reconcileSvcFee(base, svc, empty, FEE, 100)!;
const devB = reconcileSvcFee(base, svc, empty, FEE, 150)!;
const merged = mergeExpenseStates(devA, devB, true);
assert.equal(merged.items.length, 1);
assert.equal(expenseLines(merged, null).reduce((s, l) => s + l.amount, 0), 4500);
// 끔 → 삭제 표시, 합계 0
const off = reconcileSvcFee(svc, base, on, FEE, 300)!;
assert.equal(expenseLines(off, null).length, 0);
assert.equal(off.items[0].deleted, true);
// 다시 켬 → 되살아남(같은 id, 1건)
const on2 = reconcileSvcFee(base, svc, off, FEE, 400)!;
assert.equal(on2.items.length, 1);
assert.equal(on2.items[0].deleted, undefined);
assert.equal(on2.items[0].amount, 4500);
// 이미 서비스였던 예전 주문(지출 없음)은 다른 수정으로 소급되지 않음
assert.equal(reconcileSvcFee(svc, { ...svc, status: '완료' }, empty, FEE, 500), null);
// 금액 설정 바뀌어도 이미 잡힌 건 그대로
assert.equal(reconcileSvcFee(svc, svc, on, 9999, 600), null);
// 새 금액은 새로 켜는 주문부터
const o2: Order = { ...svc, id: 'o2' };
assert.equal(reconcileSvcFee({ ...o2, prices: {} }, o2, on, 5000, 700)!.items.find((x) => x.id === 'svc-o2')!.amount, 5000);

// 경동화물: 서비스+경동이면 지출 안 만듦, 이미 있으면 뺌, 경동 취소하면 되살림
const kd: Order = { ...svc, shipments: [{ id: 's1', no: 1, items: {}, postStatus: 'registered', carrier: 'kyungdong', requestedAt: 1, updatedAt: 1 }] };
assert.equal(wantsSvcFee(kd), false);
assert.equal(reconcileSvcFee(base, kd, empty, FEE, 800), null);
const afterKd = reconcileSvcFee(svc, kd, on, FEE, 800)!;
assert.equal(expenseLines(afterKd, null).length, 0);
const kdCancelled: Order = { ...kd, shipments: [{ ...kd.shipments![0], postStatus: 'cancelled' }] };
const back = reconcileSvcFee(kd, kdCancelled, afterKd, FEE, 900)!;
assert.equal(expenseLines(back, null).length, 1);
// 경동 취소해도 예전부터 서비스였고 지출이 없던 주문은 소급 안 됨
assert.equal(reconcileSvcFee(kd, kdCancelled, empty, FEE, 900), null);
// 주문 삭제 → 지출 삭제
assert.equal(expenseLines(reconcileSvcFee(svc, null, on, FEE, 1000)!, null).length, 0);
// 우체국으로 정상 발송(registered, epost) 해도 그대로 1건
const epost: Order = { ...svc, shipments: [{ id: 's2', no: 1, items: {}, postStatus: 'registered', requestedAt: 1, updatedAt: 1, trackingNumber: '1' }] };
assert.equal(reconcileSvcFee(svc, epost, on, FEE, 1100), null);

// 예상 잔고: 켜면 -4,500, 끄면 원복
const bal = { ...empty, balances: [{ id: 'b1', at: 50, amount: 1000000, paidTotal: 0, expTotal: 0, updatedAt: 50 }] };
const e0 = estimateBalance(bal, [], [], null)!.expected;
const eOn = estimateBalance({ ...reconcileSvcFee(base, svc, bal, FEE, 100)! }, [], [], null)!.expected;
assert.equal(e0 - eOn, 4500);
const eOff = estimateBalance(reconcileSvcFee(svc, base, reconcileSvcFee(base, svc, bal, FEE, 100)!, FEE, 200)!, [], [], null)!.expected;
assert.equal(eOff, e0);
// 잔고를 실제로 입력한 뒤에는(그 시점 누적 지출 4,500 포함) 이미 반영된 지출이라 또 빠지지 않음
const afterInput = { ...on, balances: [{ id: 'b2', at: 500, amount: 900000, paidTotal: 0, expTotal: 4500, updatedAt: 500 }] };
assert.equal(estimateBalance(afterInput, [], [], null)!.expected, 900000);
console.log('service-ship OK');
