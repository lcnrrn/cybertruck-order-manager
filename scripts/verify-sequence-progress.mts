import assert from 'node:assert/strict';
import { compareOrdersBySeq as compareOrders, compareOrders as byDate, compareOrdersNewest, moveSeq, setSeq, compactSeq } from '../src/sequence.ts';
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
// 새 정렬: ★ → 접수일 오래된 순 (seq 무시), 완료 탭은 최신순
{
  const list = [mk('n', 30, { seq: 1 }), mk('o', 10), mk('m', 20), mk('s', 40, { priority: true }), mk('t', 20)];
  assert.deepEqual([...list].sort(byDate).map((o) => o.id), ['s', 'o', 'm', 't', 'n']);
  assert.deepEqual([...list].sort(compareOrdersNewest).map((o) => o.id), ['s', 'n', 'm', 't', 'o']);
}
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

// 제품별 수량
{
  const { parseItemsAgainstCatalog, joinItems } = await import('../src/products.ts');
  const { autoOrderAmount } = await import('../src/production.ts');
  const n0 = names[0];
  const items3 = joinItems([n0, '견인고리 커버'], '메모입니다', { [n0]: 3 });
  assert.equal(items3, `${n0} x3 / 견인고리 커버 / 메모입니다`);
  const back = parseItemsAgainstCatalog(items3, DEFAULT_PRODUCTS);
  assert.equal(back.qty[n0], 3);
  assert.equal(back.qty['견인고리 커버'], 1);
  assert.equal(back.note, '메모입니다');
  // 3세트 / 3셋트 / 3개 / ×3
  for (const t of ['휴대폰 마운트 거치대 3세트', '휴대폰 마운트 거치대 3셋트', '휴대폰 마운트 거치대 3개', '휴대폰 마운트 거치대 ×3']) {
    assert.equal(parseItemsAgainstCatalog(t, DEFAULT_PRODUCTS).qty['휴대폰 마운트 거치대'], 3, t);
    assert.equal(orderItemProgress({ items: t }, names)[0].qty, 3, t);
  }
  // 이름 속 개수는 수량 아님
  assert.equal(parseItemsAgainstCatalog('안전벨트 클립 (풀셋 5개)', DEFAULT_PRODUCTS).qty['안전벨트 클립 (풀셋 5개)'], 1);
  assert.equal(parseItemsAgainstCatalog('안전벨트 클립 (풀셋 5개) x2', DEFAULT_PRODUCTS).qty['안전벨트 클립 (풀셋 5개)'], 2);
  assert.equal(orderItemProgress({ items: '안전벨트 클립 (풀셋 5개) x2' }, names)[0].qty, 2);
  // 9.5*10 은 수량 아님
  assert.ok(Object.values(parseItemsAgainstCatalog('일론머스크사진 판 9.5*10', DEFAULT_PRODUCTS).qty).every((q) => q === 1));
  const priced = DEFAULT_PRODUCTS.map((p) => ({ ...p, price: 1000 }));
  assert.equal(autoOrderAmount(mk('z', 1, { items: '휴대폰 마운트 거치대 x3' }), priced), 3000);
  console.log('qty OK');
}

// 버그: 이름에 '3개'가 든 제품을 x3 주문하면 수량 1로 계산되던 문제
{
  const { orderSlots, normalizeFilament } = await import('../src/filament.ts');
  const { orderGrams, parseOrderProducts } = await import('../src/production.ts');
  const { parseItemsAgainstCatalog, joinItems } = await import('../src/products.ts');
  const P = '안전벨트 클립 (뒷자석 3개)';
  assert.ok(names.includes(P));
  const cat = DEFAULT_PRODUCTS.map((p) => p.name === P
    ? { ...p, filaments: [{ typeId: 'r', grams: 8.15 }, { typeId: 'w', grams: 0.8 }] }
    : { ...p, filaments: undefined, grams: 0 });
  const st = normalizeFilament({ types: [{ id: 'r', material: 'PETG', color: 'RED' }, { id: 'w', material: 'PETG', color: 'WHITE' }] });
  for (const q of [1, 2, 3, 4]) {
    const items = joinItems([P, '우체국 택배'], '3셋트 요청', { [P]: q });
    assert.equal(parseItemsAgainstCatalog(items, cat).qty[P], q, `form qty ${q}`);
    assert.deepEqual(parseOrderProducts(items, names).products, [{ name: P, qty: q }], `parse ${q}`);
    const o = mk('f' + q, 1, { items });
    assert.ok(Math.abs(orderGrams(o, cat) - 8.95 * q) < 1e-9, `grams ${q}`);
    const slots = orderSlots(o, cat, st);
    assert.equal(slots.length, 2);
    assert.ok(slots.every((s) => s.qty === q));
    assert.equal(orderItemProgress(o, names)[0].qty, q);
  }
  // 이름 속 개수만 있을 땐 여전히 1개
  assert.equal(parseOrderProducts(P, names).products[0].qty, 1);
  console.log('name-digit qty OK');
}

// 삭제한 주문이 동기화로 되살아나지 않음
{
  const { dropDeleted, mergeDeleted } = await import('../src/deletedOrders.ts');
  const { mergeOrdersForSync } = await import('../src/google/sheets.ts');
  const a = mk('keep', 1, { updatedAt: 100 } as never);
  const b = mk('gone', 2, { seq: 5, updatedAt: 100 } as never);
  const local = [a];
  const remote = [a, b];
  const del = { gone: 200 };
  assert.deepEqual(mergeOrdersForSync(local, remote, del).map((o) => o.id), ['keep']);
  assert.deepEqual(mergeOrdersForSync(local, remote, {}).map((o) => o.id).sort(), ['gone', 'keep']); // 예전 동작(되살아남)
  assert.equal(dropDeleted([{ ...b, updatedAt: 300 }], del).length, 1); // 삭제 후 복원·수정된 건 유지
  assert.deepEqual(mergeDeleted({ x: 1 }, { x: 5, y: 2 }), { x: 5, y: 2 });
  console.log('delete tombstone OK');
}

// 품목별 단가 · 서비스
{
  const { autoOrderAmount, orderAmount, orderGrams, unitPrice, isServiceItem } = await import('../src/production.ts');
  const P1 = '휴대폰 마운트 거치대', P2 = '견인고리 커버';
  const cat = DEFAULT_PRODUCTS.map((p) => ({ ...p, price: p.name === P1 ? 15000 : p.name === P2 ? 5000 : 0, grams: 10, filaments: undefined }));
  const items = `${P1} x2 / ${P2}`;
  const base = mk('pr', 1, { items });
  assert.equal(autoOrderAmount(base, cat), 35000);
  const svc = { ...base, prices: { [P2]: 0 } };
  assert.equal(autoOrderAmount(svc, cat), 30000);
  assert.ok(isServiceItem(svc, P2) && !isServiceItem(svc, P1));
  const disc = { ...base, prices: { [P1]: 12000 } };
  assert.equal(unitPrice(disc, P1, cat), 12000);
  assert.equal(orderAmount(disc, cat), 29000);
  // 직접 입력 금액(L)이 있으면 그 값 우선 (기존 동작)
  assert.equal(orderAmount({ ...svc, amount: 1000 }, cat), 1000);
  // 서비스 품목도 제작·필라멘트에는 그대로
  assert.equal(orderGrams(svc, cat), 30);
  assert.equal(buildProductionSummary([svc], cat).total, 3);
  console.log('item prices OK');
}

// 주문별 필라멘트 g 직접 지정 (기타 등)
{
  const { orderSlots, orderUseByType, pendingByType, normalizeFilament } = await import('../src/filament.ts');
  const { orderGrams, pendingGrams } = await import('../src/production.ts');
  const cat = [
    { name: '기타', color: DEFAULT_PRODUCTS[0].color },
    { name: 'A', color: DEFAULT_PRODUCTS[0].color, filaments: [{ typeId: 'r', grams: 10 }, { typeId: 'w', grams: 2 }] },
  ] as never[];
  const st = normalizeFilament({ types: [{ id: 'r', material: 'PETG', color: 'RED' }, { id: 'w', material: 'PETG', color: 'WHITE' }] });
  const base = mk('g1', 1, { items: '기타 / A x2' });
  // 기본: 기타는 0g(계산 제외), 편집 화면엔 입력용 줄
  assert.equal(orderGrams(base, cat), 24);
  assert.equal(orderSlots(base, cat, st).filter((s) => s.product === '기타').length, 0);
  assert.equal(orderSlots(base, cat, st, false, true).filter((s) => s.product === '기타').length, 1);
  // 기타 35g(빨강) + 추가줄 5g(흰색), A 첫 줄 총 30g으로
  const ov = { ...base, filamentGrams: { '기타#0': 35, '기타#1': 5, 'A#0': 30 }, filamentPick: { '기타#0': 'r', '기타#1': 'w' } };
  assert.equal(orderGrams(ov, cat), 35 + 5 + 30 + 4);
  assert.deepEqual(orderUseByType(ov, cat, st), { r: 65, w: 9 });
  assert.deepEqual(pendingByType([ov], cat, st), { r: 65, w: 9 });
  // 남은 수량 기준: A 1개 제작 완료 → A 줄은 절반
  const half = { ...ov, doneMap: { A: 1 } };
  assert.equal(pendingGrams([half], cat), 35 + 5 + 15 + 2);
  console.log('filament overrides OK');
}
