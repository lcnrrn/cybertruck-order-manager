// 환불 · 블랙리스트 검증: npx tsx scripts/verify-refund-blacklist.mts
import assert from 'node:assert/strict';
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).window = globalThis;
const B = await import('../src/blacklist.ts');
const R = await import('../src/refunds.ts');
const P = await import('../src/production.ts');
const Bal = await import('../src/balance.ts');
const S = await import('../src/google/sheets.ts');
const F = await import('../src/filament.ts');
const Pr = await import('../src/profit.ts');
let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; console.log('PASS', m); };

// ── 블랙리스트 ──
ok(B.normalizePhone('010-3012-4803') === '01030124803', '전화번호 숫자만');
ok(B.normalizePhone('+82 10-3012-4803') === '01030124803', '+82 → 0');
const e = (phone: string, address: string): any => ({ id: 'x', phone, address, at: 1 });
ok(B.matchBlacklist('01030124803', '', [e('010 3012 4803', '')])?.by === 'phone', '번호 일치(형식 달라도)');
ok(!B.matchBlacklist('01030124804', '', [e('01030124803', '')]), '번호 한 자리 다르면 불일치');
ok(!B.matchBlacklist('', '', [e('', '')]), '빈 값은 일치 안 함');
const addr = '대구광역시 달서구 조암남로32길40. 110-2601';
ok(B.matchBlacklist('', '대구 달서구 조암남로 32길 40, 110동 2601호', [e('', addr)])?.by === 'address', '주소: 공백·기호·동호수 표기 달라도 일치');
ok(B.matchBlacklist('', '대구광역시 달서구 조암남로32길40 (용산동) 110-2601', [e('', addr)])?.by === 'address', '주소: 괄호 동 이름 무시');
ok(!B.matchBlacklist('', '대구광역시 달서구 조암남로32길40. 110-2602', [e('', addr)]), '같은 건물 다른 호수는 불일치');
ok(!B.matchBlacklist('', '대구광역시 달서구 조암남로32길41. 110-2601', [e('', addr)]), '건물번호 다르면 불일치');
ok(!B.matchBlacklist('', '대구광역시 달서구 조암남로32길4. 110-2601', [e('', '대구광역시 달서구 조암남로32길40. 110-2601')]), '4 vs 40 접두 오탐 없음');
ok(B.matchBlacklist('', '대구 달서구 조암남로32길40 상가 1층', [e('', '대구광역시 달서구 조암남로32길40')])?.by === 'address', '블랙리스트에 동호수가 없으면 건물 단위로 일치');
ok(!B.matchBlacklist('', '서울 강남구 테헤란로 12', [e('', '부산 해운대구 테헤란로 12')]), '구가 다르면 같은 도로명이어도 불일치');
ok(B.matchBlacklist('', '경기도 성남시 분당구 판교역로 235 3층', [e('', '경기 성남시 분당구 판교역로 235')])?.by === 'address', '시/구 있는 주소');
ok(B.matchBlacklist('', '대구 달서구 상인동 123-4 101호', [e('', '대구 달서구 상인동 123-4 101호')])?.by === 'address', '지번 주소는 전체 일치');
ok(!B.matchBlacklist('', '대구 달서구 상인동 123-4 101호', [e('', '대구 달서구 상인동 123-5 101호')]), '지번 주소 다르면 불일치');
ok(Object.keys(B.normalizeBlacklist({ a: { phone: '010', address: '' }, b: 5, c: { phone: '', address: '' } })).length === 1, '정규화: 값 없는 항목 제외');

// ── 환불 ──
const cat: any[] = [{ name: 'DC콤보+J1772 거치대', price: 25000 }, { name: '우체국 택배', price: 4500 }];
const mk = (o: Partial<any> = {}): any => ({ id: 'o1', name: '박재현', items: 'DC콤보+J1772 거치대 / 우체국 택배', address: '', phone: '', status: '완료', priority: false, paid: true, paidAt: 1000, createdAt: 1, updatedAt: 1, ...o });
const o = mk();
ok(P.orderAmount(o, cat) === 29500, '금액 29,500');
const part = R.applyRefund(o, cat, { at: 5000, amount: 25000, memo: '부분' }, true);
ok(part.status === '완료' && R.refundTotal(part) === 25000, '부분 환불: 상태 유지');
ok(R.orderNet(part, cat) === 4500, '순매출 = 금액 − 환불');
ok(Pr.orderProfit(part, cat, 0, 0).revenue === 4500, '순이익 계산은 순매출');
const full = R.applyRefund(part, cat, { at: 6000, amount: 4500 }, true);
ok(full.status === '환불' && full.refunds![1].prev === '완료', '전액 환불: 상태 환불 + 이전 상태 기억');
ok(R.orderNet(full, cat) === 0, '전액 환불 순매출 0');
ok(!P.isUnpaid(mk({ paid: false, status: '환불' }), cat), '환불 주문은 미입금 아님');
ok(P.isUnpaid(mk({ paid: false, status: '완료' }), cat), '일반 미입금은 그대로');
const back = R.removeRefund(full, full.refunds![1].id);
ok(back.status === '완료' && back.refunds!.length === 1, '환불 삭제 → 이전 상태 복구');
ok(R.removeRefund(part, part.refunds![0].id).refunds === undefined, '마지막 환불 삭제 → 목록 비움');
ok(!R.parseRefunds([{ id: 'a', at: 1, amount: 0 }, { id: '', at: 1, amount: 5 }]), '잘못된 환불 항목 무시');
// 시트 왕복
const row = S.orderToRow(full);
const re = S.rowToOrder(row)!;
ok(re.status === '환불' && R.refundTotal(re) === 29500 && re.refunds![0].memo === '부분', '시트 왕복(상태·환불 내역)');
// 필라멘트: 환불 상태로 바뀌어도 이미 차감된 것은 그대로
const st: any = F.normalizeFilament ? F.normalizeFilament({}) : {};
const withFil = mk({ filamentG: 216.35, filamentAt: 5, filamentUse: { default: 216.35 }, filamentBase: { '~': 1 }, doneMap: { 'DC콤보+J1772 거치대': 1 } });
const fr = F.reconcileFilament(withFil, { ...withFil, status: '환불' }, cat, st);
ok(fr.filamentG === 216.35 && JSON.stringify(fr.filamentUse) === JSON.stringify({ default: 216.35 }), '환불로 바꿔도 필라멘트 차감 유지');
// 예상 잔고
const exp: any = { items: [], categories: [], balances: [{ id: 'b', at: 2000, amount: 1000000, paidTotal: 0, expTotal: 0, updatedAt: 1 }] };
const est = Bal.estimateBalance(exp, [mk({ paid: true, paidAt: 3000, refunds: [{ id: 'r', at: 5000, amount: 25000 }] }), mk({ id: 'o2', paid: true, paidAt: 1000, refunds: [{ id: 'r2', at: 1500, amount: 9999 }] })], cat, null)!;
ok(est.refundSum === 25000 && est.refunds.length === 1, '잔고 기준 시각 뒤 환불만 반영');
ok(est.expected === 1000000 + 29500 - 25000, `예상 잔고 = 기준 + 입금 − 환불 (${est.expected})`);
console.log(`ALL PASS (${n})`);
