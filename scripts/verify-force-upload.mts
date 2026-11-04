const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
const { planForceUpload } = await import('../src/google/syncCore.ts');
const ok = (n: string, c: boolean) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) process.exit(1); };
const sh = (id: string, no = 1) => ({ id, no, items: { a: 1 }, postStatus: 'requested', mode: 'visit', requestedAt: 1, updatedAt: 1 });
const base = { items: 'x', address: 'ad', phone: '010', status: '제작중', priority: false, createdAt: 1 } as any;
const remote = [{ ...base, id: 'o1', name: 'A', updatedAt: 500, paid: true, shipments: [sh('s1')] }, { ...base, id: 'o2', name: 'B', updatedAt: 100 }, { ...base, id: 'o4', name: 'P', updatedAt: 1, _partial: true }];
const local = [
  { ...base, id: 'o1', name: 'A', updatedAt: 300, shipments: [sh('s1'), sh('s9', 2)] },
  { ...base, id: 'o2', name: 'B', updatedAt: 900 },
  { ...base, id: 'o3', name: 'NEW', updatedAt: 10, shipments: [sh('s3')] },
  { ...base, id: 'o5', name: 'DEL', updatedAt: 10 },
  { ...base, id: 'o4', name: 'P', updatedAt: 9, shipments: [sh('s4')] },
];
const p = planForceUpload(local, remote, { o5: 1 });
ok('new order added', p.added.join() === 'NEW');
ok('deleted skipped', !p.write.some((o) => o.id === 'o5'));
const o1 = p.write.find((o) => o.id === 'o1')!;
ok('shipment added to existing', o1.shipments!.map((s) => s.id).join() === 's1,s9');
ok('remote fields kept (paid)', o1.paid === true && o1.updatedAt >= 500);
ok('no-extra row untouched', !p.write.some((o) => o.id === 'o2'));
ok('partial row untouched', !p.write.some((o) => o.id === 'o4'));
ok('idempotent', planForceUpload(local, [...remote.filter((r) => r.id !== 'o1'), o1, p.write.find((o) => o.id === 'o3')!], { o5: 1 }).write.length === 0);
