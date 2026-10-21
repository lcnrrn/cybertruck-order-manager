// 브라우저 E2E: 시작 가림막(최신 내용 받기 전 수정 잠금). 실제 구글 대신 가짜 시트 응답 사용.
// 실행: npm run build && npx vite preview --port 4173 & node scripts/e2e-sync-gate.mjs
// (puppeteer-core 와 Chrome 이 없으면 건너뜀)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let puppeteer;
for (const p of ['puppeteer-core', '/tmp/pt/node_modules/puppeteer-core']) {
  try { puppeteer = require(p); break; } catch { /* next */ }
}
if (!puppeteer) { console.log('e2e skipped (no puppeteer-core)'); process.exit(0); }
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const URL = process.env.APP_URL || 'http://localhost:4173/cybertruck-order-manager/';
const H = ['id','name','items','address','phone','group','status','priority','updatedAt','createdAt','trackingNumber','amount','paid','paidAt','filamentG','filamentAt','filamentByType','progress'];
const sheet = { Orders: [H, ['r1','시트주문','휴대폰 마운트 거치대','','010','','대기','false','5000','1000']], '설정': [] };

async function page(browser, { token, delay = 0, offline = false }) {
  const pg = await browser.newPage();
  await pg.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
  await pg.evaluateOnNewDocument((token) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('cybertruck-google-sheet-id', 'FAKE_SHEET');
    localStorage.setItem('cybertruck-google-client-id', 'fake.apps.googleusercontent.com');
    localStorage.setItem('cybertruck-google-signed', '1');
    localStorage.setItem('cybertruck-google-email', 'me@example.com');
    localStorage.setItem('cybertruck-orders-v1', JSON.stringify([{ id: 'l1', name: '로컬주문', items: '휴대폰 마운트 거치대', address: '', phone: '', status: '대기', priority: false, createdAt: 1000, updatedAt: 1000 }]));
    if (token) localStorage.setItem('cybertruck-google-token-v1', JSON.stringify({ token: 'tok', exp: Date.now() + 3600e3 }));
  }, token);
  await pg.setRequestInterception(true);
  pg.on('console', (m) => process.env.DEBUG && console.log('[page]', m.text()));
  pg.on('pageerror', (e) => console.log('[pageerror]', e.message));
  pg.on('request', async (req) => {
    if (process.env.DEBUG) console.log('[req]', req.method(), req.url().slice(0, 140));
    const u = req.url();
    if (u.includes('sheets.googleapis.com')) {
      if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: CORS, body: '' });
      await new Promise((r) => setTimeout(r, delay));
      const d = decodeURIComponent(u);
      if (d.includes('?fields=')) return req.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ sheets: [{ properties: { title: 'Orders' } }, { properties: { title: '설정' } }] }) });
      const tab = d.includes('설정') ? '설정' : 'Orders';
      if (req.method() === 'PUT') { sheet[tab] = JSON.parse(req.postData()).values; return req.respond({ status: 200, headers: CORS, contentType: 'application/json', body: '{}' }); }
      if (req.method() === 'POST') return req.respond({ status: 200, headers: CORS, contentType: 'application/json', body: '{}' });
      return req.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ values: sheet[tab] }) });
    }
    if (/google|gstatic/.test(u)) return req.abort();
    req.continue();
  });
  if (offline) await pg.setOfflineMode(false);
  await pg.goto(URL, { waitUntil: 'domcontentloaded' });
  return pg;
}
const text = (pg) => pg.evaluate(() => document.body.innerText);
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
try {
  // 1) 토큰 유효 + 시트 응답 느림 → 가림막 → 받은 뒤 사라지고 시트 주문이 보임
  let pg = await page(browser, { token: true, delay: 1200 });
  await sleep(500);
  assert.ok(await pg.$('.sync-gate.gate-loading'), '불러오는 중 가림막');
  // 가림막 아래 클릭은 막힘 (가림막이 맨 위)
  const topEl = await pg.evaluate(() => document.elementFromPoint(187, 400)?.closest('.sync-gate') !== null);
  assert.ok(topEl, '가림막이 화면을 덮어야 함');
  await pg.waitForFunction(() => !document.querySelector('.sync-gate'), { timeout: 15000 }).catch(async (e) => { console.log(await pg.evaluate(() => document.querySelector('.sync-gate')?.outerHTML.slice(0, 400))); throw e; });
  assert.ok((await text(pg)).includes('시트주문'), '시트 내용이 합쳐져 보여야 함');
  assert.ok(!(await pg.$('.locked-banner')), '동기화 후 잠금 해제');
  assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth), 375);
  await pg.close();

  // 2) 토큰 없음 → '탭해서 최신 내용 불러오기' + 읽기 전용
  pg = await page(browser, { token: false });
  await pg.waitForSelector('.sync-gate.gate-login', { timeout: 8000 });
  const t2 = await text(pg);
  assert.ok(t2.includes('탭해서 최신 내용 불러오기'));
  assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth), 375);
  await pg.screenshot({ path: process.env.SHOT || '/workspace/gate-375.png' });
  await pg.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('읽기 전용으로 보기')).click());
  await pg.waitForSelector('.locked-banner');
  await sleep(300);
  assert.ok(!(await text(pg)).includes('다시 연결 중'), '읽기 전용을 고르면 로그인 팝업을 띄우지 않음');
  // 잠금 중 수정 시도: 상태/체크 버튼 클릭 → 데이터 그대로
  const before = await pg.evaluate(() => localStorage.getItem('cybertruck-orders-v1'));
  await pg.evaluate(() => { for (const b of document.querySelectorAll('.order-list button, .order-list input')) b.click(); });
  await pg.evaluate(() => document.querySelector('.fab')?.click());
  await sleep(300);
  assert.equal(await pg.evaluate(() => localStorage.getItem('cybertruck-orders-v1')), before, '잠금 중에는 주문이 바뀌면 안 됨');
  assert.ok(!(await pg.$('.sheet .order-form')), '잠금 중 새 주문 폼이 열리면 안 됨');
  await pg.screenshot({ path: '/workspace/gate-readonly-375.png' });
  await pg.close();

  console.log('e2e sync gate OK');
} finally {
  await browser.close();
}
