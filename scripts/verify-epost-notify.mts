const { notifyEpost } = await import('../src/epostNotify.ts');
const ok = (n: string, c: boolean) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) process.exit(1); };
const seq = (arr: any[]) => { let i = 0; return (async () => ({ json: async () => arr[Math.min(i++, arr.length - 1)] })) as any; };
ok('retries until pending then ok', await notifyEpost('x', { waitMs: 1, f: seq([{ ok: false, error: 'not-pending' }, { ok: false, error: 'not-pending' }, { ok: true }]) }) === 'ok');
ok('not-configured stops', await notifyEpost('x', { waitMs: 1, f: seq([{ ok: false, error: 'not-configured' }]) }) === 'not-configured');
ok('gives up', await notifyEpost('x', { tries: 3, waitMs: 1, f: seq([{ ok: false, error: 'not-pending' }]) }) === 'fail');
ok('webhook error fails', await notifyEpost('x', { waitMs: 1, f: seq([{ ok: false, error: 'webhook-500' }]) }) === 'fail');
