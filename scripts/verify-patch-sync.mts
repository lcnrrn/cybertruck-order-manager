// npx tsx scripts/verify-patch-sync.mts — 두 기기 시뮬레이션: 행 단위 쓰기(patch) 동기화
import assert from 'node:assert/strict';
class Mem { m = new Map<string, string>(); getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; } setItem(k: string, v: string) { this.m.set(k, String(v)); } removeItem(k: string) { this.m.delete(k); } clear() { this.m.clear(); } key(i: number) { return [...this.m.keys()][i] ?? null; } get length() { return this.m.size; } }
const g = globalThis as unknown as Record<string, unknown>;
g.window = { dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
g.CustomEvent = class { constructor(public type: string) {} };
const dev: Record<string, Mem> = { A: new Mem(), B: new Mem(), C: new Mem() };
const use = (d: string) => { g.localStorage = dev[d]; };
const tabs = new Map<string, string[][]>();
let writes: string[] = []; // 쓴 범위 기록
const json = (b: unknown, status = 200) => ({ ok: status < 300, status, json: async () => b, text: async () => JSON.stringify(b) });
const colN = (c: string) => c.charCodeAt(0) - 64;
function setCells(tab: string, range: string, values: string[][]) {
  const t = tabs.get(tab) || []; tabs.set(tab, t);
  const m = range.match(/^([A-Z])(\d+)/)!; const c0 = colN(m[1]) - 1; const r0 = +m[2] - 1;
  values.forEach((row, i) => { const r = (t[r0 + i] ||= []); row.forEach((v, j) => { while (r.length < c0 + j) r.push(''); r[c0 + j] = String(v ?? ''); }); });
  writes.push(`${tab}!${range}`);
}
g.fetch = async (url: string, init?: { method?: string; body?: string }) => {
  const u = decodeURIComponent(url.replace(/^https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets\/[^/?:]+/, ''));
  const method = init?.method || 'GET';
  const body = init?.body ? JSON.parse(init.body) : {};
  if (u.startsWith('?fields=')) return json({ sheets: [...tabs.keys()].map((t) => ({ properties: { title: t } })) });
  if (u.startsWith(':batchUpdate')) { tabs.set(body.requests[0].addSheet.properties.title, []); return json({}); }
  if (u.startsWith('/values:batchUpdate')) { for (const d of body.data) { const [tab, rg] = d.range.split('!'); setCells(tab, rg, d.values); } return json({}); }
  if (u.startsWith('/values:batchClear')) throw new Error('clear must not be used');
  if (u.startsWith('/values:batchGet?')) {
    const read = (r: string) => { const [tab, rg] = r.split('!'); const t = tabs.get(tab) || []; return rg === 'A:A' ? t.map((x) => [x[0] ?? '']) : rg === 'A:C' ? t.map((x) => x.slice(0, 3)) : t.map((x) => x.slice(0, 18)); };
    return json({ valueRanges: u.slice('/values:batchGet?'.length).split('&').map((kv) => ({ values: read(kv.replace(/^ranges=/, '')) })) });
  }
  const m = u.match(/^\/values\/([^!]+)!([A-Z0-9:]+?)(:append|:clear)?(\?|$)/);
  if (!m) throw new Error('unexpected ' + u);
  const [, tab, rg, op] = m;
  if (op === ':clear') throw new Error('clear must not be used: ' + u);
  if (op === ':append') { const t = tabs.get(tab) || []; tabs.set(tab, t); for (const r of body.values) { t.push(r.map(String)); writes.push(`${tab}!append`); } return json({}); }
  if (method === 'PUT') { setCells(tab, rg, body.values); return json({}); }
  const t = tabs.get(tab) || [];
  if (rg === 'A:A') return json({ values: t.map((r) => [r[0] ?? '']) });
  if (rg === 'A:C') return json({ values: t.map((r) => r.slice(0, 3)) });
  return json({ values: t.map((r) => r.slice(0, 18)) });
};
for (const d of Object.keys(dev)) { use(d); localStorage.setItem('cybertruck-google-sheet-id', 'SHEET'); }
const { pullMergePush } = await import('../src/google/syncCore.ts');
type O = import('../src/types.ts').Order;
const T = 'tok';
const mk = (id: string, name: string, at: number, extra: Partial<O> = {}): O => ({ id, name, items: '휴대폰 마운트 거치대', address: '', phone: '', status: '대기', priority: false, createdAt: 1000, updatedAt: at, ...extra }) as O;
const sync = async (d: string, list: O[]) => { use(d); writes = []; const r = await pullMergePush(T, list); return { list: r.merged, writes: writes.filter((w) => w.startsWith('Orders') && !w.endsWith('S1')) }; };
const get = (l: O[], id: string) => l.find((o) => o.id === id)!;

// 0) A 가 주문 3건 만들어 올림 (paid·체크 포함)
let A = (await sync('A', [mk('o1', '김일', 1000, { paid: true, paidAt: 5 }), mk('o2', '이이', 1000, { doneMap: { x: 1 } }), mk('o3', '박삼', 1000)])).list;
assert.equal(tabs.get('Orders')!.length, 4);

// 1) 빈 기기 B (새 아이콘): 받기만 하고 아무것도 안 씀
let r = await sync('B', []);
let B = r.list;
assert.equal(B.length, 3); assert.deepEqual(r.writes, [], 'empty device must not write');
assert.equal(get(B, 'o1').paid, true); assert.deepEqual(get(B, 'o2').doneMap, { x: 1 });
// 빈 기기가 샘플 주문만 가진 경우도 마찬가지
r = await sync('C', [mk('sample-1', '샘플', 9e12)]);
assert.deepEqual(r.writes, []); assert.ok(!r.list.some((o) => o.id === 'sample-1'));

// 2) 서로 다른 주문 동시 수정: A 는 o1, B 는 o2 → 각자 자기 행만 씀, 둘 다 살아남음
A = A.map((o) => (o.id === 'o1' ? { ...o, status: '제작중' as const, updatedAt: 2000 } : o));
B = B.map((o) => (o.id === 'o2' ? { ...o, doneMap: { x: 1, y: 1 }, updatedAt: 2001 } : o));
r = await sync('A', A); A = r.list; assert.deepEqual(r.writes, ['Orders!A2:R2']);
r = await sync('B', B); B = r.list; assert.deepEqual(r.writes, ['Orders!A3:R3']);
assert.equal(get(B, 'o1').status, '제작중'); assert.deepEqual(get(B, 'o2').doneMap, { x: 1, y: 1 });
r = await sync('A', A); A = r.list; assert.deepEqual(r.writes, []);
assert.deepEqual(get(A, 'o2').doneMap, { x: 1, y: 1 });

// 3) 옛것/빈 데이터 기기(stale): C 는 예전에 o1 을 paid 없이 갖고 있었음(지문 기록 있음) → 시트를 못 덮고 시트 것을 받음
use('C'); const staleC = [mk('o1', '김일', 1000), mk('o2', '이이', 1000), mk('o3', '박삼', 1000)];
// C 가 그 옛 상태를 '시트와 맞춘 것'으로 기억 (예: 어제 망가진 상태를 받아 둠)
const { orderHash } = await import('../src/google/syncCore.ts');
localStorage.setItem('cybertruck-sync-base-v2', JSON.stringify(Object.fromEntries(staleC.map((o) => [o.id, orderHash(o)]))));
r = await sync('C', staleC);
assert.deepEqual(r.writes, [], 'stale device must not write'); assert.equal(get(r.list, 'o1').paid, true); assert.equal(get(r.list, 'o1').status, '제작중');
// 지문 기록 없는 옛 기기(업데이트 직후)도: 시각이 같거나 옛것이면 안 씀
const D = new Mem(); dev.D = D; use('D'); localStorage.setItem('cybertruck-google-sheet-id', 'SHEET');
r = await sync('D', staleC); assert.deepEqual(r.writes, []); assert.equal(get(r.list, 'o1').paid, true);

// 4) 같은 주문을 두 기기가 수정: 나중에 고친 쪽이 이기고 결국 같아짐
A = A.map((o) => (o.id === 'o3' ? { ...o, name: '박삼(A)', updatedAt: 3000 } : o));
B = B.map((o) => (o.id === 'o3' ? { ...o, name: '박삼(B)', updatedAt: 3005 } : o));
r = await sync('A', A); A = r.list; assert.deepEqual(r.writes, ['Orders!A4:R4']);
r = await sync('B', B); B = r.list; assert.deepEqual(r.writes, ['Orders!A4:R4']);
r = await sync('A', A); A = r.list; assert.equal(get(A, 'o3').name, '박삼(B)'); assert.deepEqual(r.writes, []);
// 반대 순서(옛 수정이 나중에 도착): 시트가 더 새것이면 시트 것
B = B.map((o) => (o.id === 'o3' ? { ...o, name: '박삼(B2)', updatedAt: 3100 } : o));
A = A.map((o) => (o.id === 'o3' ? { ...o, name: '박삼(A2)', updatedAt: 3050 } : o));
r = await sync('B', B); B = r.list;
r = await sync('A', A); A = r.list; assert.equal(get(A, 'o3').name, '박삼(B2)'); assert.deepEqual(r.writes, []);

// 5) 새 주문 추가 → 맨 아래에 append, 다른 행은 안 건드림
A = [...A, mk('o4', '최사', 4000)];
r = await sync('A', A); A = r.list; assert.deepEqual(r.writes, ['Orders!append']);
r = await sync('B', B); B = r.list; assert.ok(get(B, 'o4'));

// 6) iOS 가 저장소를 지움 → 다시 받아오기만, 손실 없음
dev.B.clear(); dev.B.setItem('cybertruck-google-sheet-id', 'SHEET');
r = await sync('B', []); assert.deepEqual(r.writes, []); assert.equal(r.list.length, 4); assert.equal(get(r.list, 'o1').paid, true);

// 7) 행 순서가 바뀌어도(다른 프로그램이 정렬) id 로 정확한 행에 씀
const t = tabs.get('Orders')!; const [h, ...rest] = t; tabs.set('Orders', [h, ...rest.reverse()]);
A = A.map((o) => (o.id === 'o1' ? { ...o, phone: '010', updatedAt: 5000 } : o));
r = await sync('A', A); A = r.list;
const row = tabs.get('Orders')!.find((x) => x[0] === 'o1')!; assert.equal(row[4], '010');
assert.equal(tabs.get('Orders')!.find((x) => x[0] === 'o2')![1], '이이');

// 8) 설정: 바뀐 키만 그 행에 씀 (탭 전체 안 지움)
const { markSettingChanged, initSettingSnapshots, SETTING_LS_KEYS } = await import('../src/settingsMeta.ts');
use('A'); initSettingSnapshots();
localStorage.setItem(SETTING_LS_KEYS.sms, JSON.stringify({ 접수: 'hi' })); markSettingChanged('sms');
writes = []; await pullMergePush(T, A);
assert.ok(writes.every((w) => !w.startsWith('설정!A1:C') || w === '설정!A1:C1'), 'settings rows only: ' + writes.join(','));
use('B'); initSettingSnapshots(); await pullMergePush(T, []);
assert.equal(JSON.parse(localStorage.getItem(SETTING_LS_KEYS.sms)!).접수, 'hi');
console.log('patch sync OK');
