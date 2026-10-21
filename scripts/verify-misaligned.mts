// npx tsx scripts/verify-misaligned.mts — 옛 앱이 A~K 만 다른 순서로 써서 L~R 이 밀린 시트에서도 세부값 유지 + 지움 방지
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const s = await import('../src/google/sheets.ts');
const c = await import('../src/google/syncCore.ts');
const mk = (id: string, name: string, paid: boolean, d?: Record<string, number>) => ({ id, name, items: '', address: '', phone: '', status: '제작중' as const, priority: false, createdAt: 1, updatedAt: 100, paid: paid || undefined, paidAt: paid ? 5 : undefined, doneMap: d });
const orders = [mk('a', '가', true, { x: 1 }), mk('b', '나', true), mk('c', '다', false, { y: 2 })];
const rows = orders.map(s.orderToRow);
// 옛 앱: A~K 를 역순으로 다시 씀, L~R 은 그대로 → 밀림
const shifted = rows.map((r, i) => [...rows[rows.length - 1 - i].slice(0, 11), ...r.slice(11)]);
const back = s.realignRows(shifted).map((r) => s.rowToOrder(r)!);
const ok = back.every((o) => { const e = orders.find((x) => x.id === o.id)!; return !o._partial && !!o.paid === !!e.paid && JSON.stringify(o.doneMap) === JSON.stringify(e.doneMap); });
if (!ok) { console.error('FAIL realign', back); process.exit(1); }
// 지움 방지: 같은 시각인데 세부값이 사라지면 저장 금지
const remote = back;
const blank = remote.map((o) => ({ ...o, paid: undefined, paidAt: undefined, doneMap: undefined }));
const loss = c.detailLoss(remote, blank);
if (loss.unjustified !== 3) { console.error('FAIL guard', loss); process.exit(1); }
// 정상 수정(더 새 시각으로 체크 해제)은 허용
const edit = remote.map((o) => (o.id === 'a' ? { ...o, doneMap: undefined, updatedAt: 200 } : o));
if (c.detailLoss(remote, edit).unjustified !== 0) { console.error('FAIL legit'); process.exit(1); }
console.log('misaligned + guard OK');
