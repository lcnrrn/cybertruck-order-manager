import assert from 'node:assert/strict';
import { parseDeposits, depositCandidates, sureMatch } from '../src/deposit.ts';
import { orderProfit, costPerGram } from '../src/profit.ts';
import type { Order } from '../src/types.ts';
import type { Product } from '../src/products.ts';

const now = new Date(2026, 9, 28, 12);
const text = `10.27 14:22 이서연 입금 31,000원 잔액 1,250,000원
10.27 13:00 GS25 출금 3,000원
최유진
입금
17,500원
10.26 09:10
김민수 입금 13,000원`;
const deps = parseDeposits(text, now);
assert.equal(deps.length, 3, JSON.stringify(deps));
assert.deepEqual(deps.map((d) => [d.name, d.amount]), [['이서연', 31000], ['최유진', 17500], ['김민수', 13000]]);
assert.ok(!deps.some((d) => d.amount === 3000), '출금은 무시');
assert.ok(!deps.some((d) => d.amount === 1250000), '잔액은 무시');

const catalog: Product[] = [{ name: '클립', price: 10000, grams: 20 } as unknown as Product];
const base = { address: '', phone: '', status: '대기', priority: false, createdAt: +new Date(2026, 9, 20), updatedAt: 0 } as const;
const orders: Order[] = [
  { ...base, id: 'a', name: '김민수', items: '클립 x1', amount: 13000 },
  { ...base, id: 'b', name: '김민수', items: '클립 x2', amount: 20000 },
  { ...base, id: 'c', name: '김민수', items: '클립 x1', amount: 13000, paid: true },
] as Order[];
const kim = depositCandidates(deps[2], orders, catalog);
assert.ok(!kim.some((c) => c.order.id === 'c'), '이미 입금된 주문은 후보 아님');
assert.equal(sureMatch(kim)?.order.id, 'a', '이름+금액 하나면 확실');
assert.equal(sureMatch(depositCandidates(deps[0], orders, catalog)), null, '이름이 다르면 자동 선택 없음');

const p = orderProfit({ ...base, id: 'x', name: 'n', items: '클립 x2', trackingNumber: '123' } as Order, catalog, 20, 4000);
assert.equal(p.revenue, 20000); assert.equal(p.grams, 40); assert.equal(p.material, 800); assert.equal(p.ship, 4000); assert.equal(p.net, 15200);
assert.equal(costPerGram({ costPerGram: 25 } as never, null).value, 25);
assert.equal(costPerGram({} as never, null).source, 'default');
console.log('deposit/profit OK');
