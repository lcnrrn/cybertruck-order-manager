// 두 기기 동기화 시뮬레이션: 가짜 구글 시트 + 기기별 localStorage 로 실제 동기화 코드(pullMergePush, syncSettings)를 돌림.
import assert from 'node:assert/strict';

/* ---- 가짜 브라우저 환경 ---- */
class Mem {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}
const g = globalThis as unknown as Record<string, unknown>;
g.window = { dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
g.CustomEvent = class { constructor(public type: string, public init?: unknown) {} };
const devices = { A: new Mem(), B: new Mem() };
function use(d: keyof typeof devices) { g.localStorage = devices[d]; }

/* ---- 가짜 시트 (탭별 2차원 배열) ---- */
const tabs = new Map<string, string[][]>();
const json = (b: unknown, status = 200) => ({ ok: status < 300, status, json: async () => b, text: async () => JSON.stringify(b) });
g.fetch = async (url: string, init?: { method?: string; body?: string }) => {
  const u = decodeURIComponent(url.replace(/^https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets\/[^/?:]+/, ''));
  const method = init?.method || 'GET';
  if (u.startsWith('?fields=')) return json({ sheets: [...tabs.keys()].map((t) => ({ properties: { title: t } })) });
  if (u.startsWith(':batchUpdate')) {
    const t = JSON.parse(init!.body!).requests[0].addSheet.properties.title;
    tabs.set(t, []);
    return json({});
  }
  const m = u.match(/^\/values\/([^!]+)!([A-Z0-9:]+)(:clear)?/);
  if (!m) throw new Error('unexpected ' + u);
  const tab = m[1];
  if (m[3]) { tabs.set(tab, []); return json({}); }
  if (method === 'PUT') { tabs.set(tab, JSON.parse(init!.body!).values.map((r: unknown[]) => r.map((c) => String(c ?? '')))); return json({}); }
  return json({ values: tabs.get(tab) || [] });
};

const { pullMergePush } = await import('../src/google/syncCore.ts');
const { markSettingChanged, initSettingSnapshots, SETTING_LS_KEYS } = await import('../src/settingsMeta.ts');
type O = import('../src/types.ts').Order;

for (const d of ['A', 'B'] as const) { use(d); localStorage.setItem('cybertruck-google-sheet-id', 'SHEET'); }
const T = 'tok';
const mk = (id: string, name: string, at: number, extra: Partial<O> = {}): O =>
  ({ id, name, items: '휴대폰 마운트 거치대', address: '', phone: '', status: '대기', priority: false, createdAt: 1000, updatedAt: at, ...extra }) as O;

/* 1) 초기: A 가 주문 3건 올림, B 가 받아감 */
use('A');
let A: O[] = [mk('o1', '김일', 1000), mk('o2', '이이', 1000), mk('o3', '박삼', 1000)];
const prodsV1 = [{ name: '휴대폰 마운트 거치대', price: 13000 }, { name: '태블릿 거치대', price: 18000 }];
localStorage.setItem(SETTING_LS_KEYS.products, JSON.stringify(prodsV1));
initSettingSnapshots();
markSettingChanged('products');
A = (await pullMergePush(T, A)).merged;
use('B');
initSettingSnapshots();
let B: O[] = (await pullMergePush(T, [])).merged;
assert.equal(B.length, 3);
assert.deepEqual(JSON.parse(localStorage.getItem(SETTING_LS_KEYS.products)!).map((p: { name: string }) => p.name), ['휴대폰 마운트 거치대', '태블릿 거치대']);

/* 2) B 는 앱을 닫아둠. A(맥북) 가 밤새 수정 */
use('A');
A = A.map((o) => (o.id === 'o1' ? { ...o, status: '제작중', updatedAt: 5000 } : o));
A.push(mk('o4', '최사(새 주문)', 5100));
let p = JSON.parse(localStorage.getItem(SETTING_LS_KEYS.products)!);
p[0].price = 15000; // 휴대폰 거치대 가격 수정
localStorage.setItem(SETTING_LS_KEYS.products, JSON.stringify(p));
markSettingChanged('products');
A = (await pullMergePush(T, A)).merged;

/* 3) B(아이폰) 가 옛 로컬 그대로 앱을 열면서 오프라인 중 다른 주문/다른 제품을 고쳐둔 상태 */
use('B');
B = B.map((o) => (o.id === 'o2' ? { ...o, paid: true, paidAt: 6000, updatedAt: 6000 } : o));
p = JSON.parse(localStorage.getItem(SETTING_LS_KEYS.products)!);
p[1].price = 20000; // 태블릿 가격 수정 (다른 제품)
p.push({ name: '견인고리 커버', price: 8000 });
localStorage.setItem(SETTING_LS_KEYS.products, JSON.stringify(p));
markSettingChanged('products');
B = (await pullMergePush(T, B)).merged;
const byId = (l: O[]) => Object.fromEntries(l.map((o) => [o.id, o]));
assert.equal(byId(B).o1.status, '제작중', 'B 가 A 의 상태 변경을 받아야 함');
assert.ok(byId(B).o4, 'B 가 A 의 새 주문을 받아야 함');
assert.equal(byId(B).o2.paid, true, 'B 자신의 수정 유지');
let bp = Object.fromEntries(JSON.parse(localStorage.getItem(SETTING_LS_KEYS.products)!).map((x: { name: string; price: number }) => [x.name, x.price]));
assert.equal(bp['휴대폰 마운트 거치대'], 15000, 'A 의 제품 가격 수정이 B 의 나중 저장에 덮이면 안 됨');
assert.equal(bp['태블릿 거치대'], 20000);
assert.equal(bp['견인고리 커버'], 8000);

/* 4) A 가 다시 열면 B 의 수정도 받고, A 의 수정은 그대로 */
use('A');
A = (await pullMergePush(T, A)).merged;
assert.equal(byId(A).o2.paid, true);
assert.equal(byId(A).o1.status, '제작중');
assert.equal(A.length, 4);
const ap = Object.fromEntries(JSON.parse(localStorage.getItem(SETTING_LS_KEYS.products)!).map((x: { name: string; price: number }) => [x.name, x.price]));
assert.deepEqual(ap, bp);

/* 5) 옛 로컬(B 가 4)을 받기 전 복사본)이 다시 올려도 새 데이터가 지워지지 않음 */
const staleB = [mk('o1', '김일', 1000), mk('o2', '이이', 1000), mk('o3', '박삼', 1000)];
use('B');
B = (await pullMergePush(T, staleB)).merged;
assert.equal(byId(B).o1.status, '제작중', '옛 데이터가 새 데이터를 덮으면 안 됨');
assert.equal(byId(B).o2.paid, true);
assert.ok(byId(B).o4);

/* 6) 제품 삭제도 전파 (A 가 지움 → B 에서도 사라짐, 다시 살아나지 않음) */
use('A');
p = JSON.parse(localStorage.getItem(SETTING_LS_KEYS.products)!).filter((x: { name: string }) => x.name !== '견인고리 커버');
localStorage.setItem(SETTING_LS_KEYS.products, JSON.stringify(p));
markSettingChanged('products');
await pullMergePush(T, A);
use('B');
await pullMergePush(T, B);
bp = Object.fromEntries(JSON.parse(localStorage.getItem(SETTING_LS_KEYS.products)!).map((x: { name: string; price: number }) => [x.name, x.price]));
assert.equal(bp['견인고리 커버'], undefined, '삭제한 제품이 되살아나면 안 됨');
use('A');
await pullMergePush(T, A);
assert.ok(!JSON.parse(localStorage.getItem(SETTING_LS_KEYS.products)!).some((x: { name: string }) => x.name === '견인고리 커버'));

console.log('two-device sync OK');
