/**
 * 사이버트럭 액세서리 — 구매자 주문/조회 백엔드 (Google Apps Script 웹 앱)
 *
 * - doPost : 주문 페이지(order.html)에서 온 주문을 Orders 탭 맨 아래에 "추가"만 함 (기존 행은 절대 안 건드림)
 * - doGet  : ?action=lookup&name=..&last4=.. → 이름 + 전화 뒷4자리가 둘 다 맞는 주문의 안전한 값만 돌려줌
 *            ?action=catalog → 제품명·판매가 (설정 탭 products)
 * 주소·전화번호 전체·다른 사람 주문은 절대 돌려주지 않음.
 * 배포 방법: scripts/apps-script/README.md
 */

var SHEET_ID = '18kxOtN0qRsfExLJeYWRDJeO3w4WeloygIkjrJ6orCP0';
var ORDERS = 'Orders';
var SETTINGS = '설정';
var SOURCE = 'TKC';
var SHIPPING = '우체국 택배';
var MAX_QTY = 20;

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function setting_(key) {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SETTINGS);
  if (!sh) return null;
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === key) {
      try { return JSON.parse(String(vals[i][1] || 'null')); } catch (e) { return null; }
    }
  }
  return null;
}

function catalog_() {
  var list = setting_('products') || [];
  return list.filter(function (p) { return p && p.name && p.name !== '기타'; })
    .map(function (p) { return { name: String(p.name), price: Number(p.price) || 0 }; });
}

function digits_(s) { return String(s || '').replace(/\D/g, ''); }
function clip_(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n); }
function normName_(s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); }

function uid_() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.website) return json_({ ok: true }); // 봇용 숨은 칸
    var name = clip_(body.name, 30);
    var nick = clip_(body.nick, 30);
    var payer = clip_(body.payer, 30);
    var phone = digits_(body.phone).slice(0, 11);
    var address = clip_(body.address, 200);
    var memo = clip_(body.memo, 500);
    if (!name || !nick || phone.length < 10 || address.length < 5) return json_({ ok: false, error: '필수 항목을 확인해 주세요' });
    if (!body.agree) return json_({ ok: false, error: '개인정보 수집·이용에 동의해 주세요' });

    var cat = catalog_();
    var names = {};
    cat.forEach(function (p) { names[p.name] = p.price; });
    var items = body.items || {};
    var parts = [];
    var total = 0;
    Object.keys(items).forEach(function (k) {
      var q = Math.floor(Number(items[k]) || 0);
      if (k === SHIPPING || !(k in names) || q < 1) return;
      q = Math.min(q, MAX_QTY);
      parts.push(q > 1 ? k + ' x' + q : k);
      total += names[k] * q;
    });
    if (!parts.length) return json_({ ok: false, error: '제품을 하나 이상 골라 주세요' });
    parts.push(SHIPPING);
    total += names[SHIPPING] || 0;
    var req = ['닉네임 ' + nick];
    if (payer && payer !== name) req.push('입금자명 ' + payer);
    if (memo) req.push(memo.replace(/\//g, '／'));
    parts.push('요청: ' + req.join(' · ').replace(/,/g, '，'));

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(ORDERS);
      var now = Date.now();
      var id = uid_();
      var row = [
        id, name, parts.join(' / '), address, phone, SOURCE, '대기', 'false',
        String(now), String(now), '', '', '', '', '', '', '',
        JSON.stringify({ i: id, v: 2, x: {} }),
      ];
      var r = Math.max(sh.getLastRow(), 1) + 1;
      var rng = sh.getRange(r, 1, 1, row.length);
      rng.setNumberFormat('@'); // 010… 앞자리 0 지키기
      rng.setValues([row]);
    } finally {
      lock.releaseLock();
    }
    return json_({ ok: true, orderNo: id.slice(-4).toUpperCase(), total: total });
  } catch (err) {
    return json_({ ok: false, error: '잠시 후 다시 시도해 주세요' });
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'catalog') return json_({ ok: true, products: catalog_() });
  if (p.action !== 'lookup') return json_({ ok: false, error: 'unknown action' });

  var name = normName_(p.name);
  var last4 = digits_(p.last4);
  if (!name || last4.length !== 4) return json_({ ok: false, error: '이름과 전화번호 뒷 4자리를 넣어 주세요' });

  // 여러 번 틀리는 조회 막기(아주 간단) — 같은 이름으로 1분에 10번 넘게 물으면 잠깐 거절
  var cache = CacheService.getScriptCache();
  var k = 'q:' + name;
  var n = Number(cache.get(k) || 0) + 1;
  cache.put(k, String(n), 60);
  if (n > 10) return json_({ ok: false, error: '잠시 후 다시 시도해 주세요' });

  var deleted = setting_('deletedOrders') || {};
  var prices = {};
  catalog_().forEach(function (c) { prices[c.name] = c.price; });
  var vals = SpreadsheetApp.openById(SHEET_ID).getSheetByName(ORDERS).getRange('A2:R').getValues();
  var out = [];
  vals.forEach(function (r) {
    var id = String(r[0] || '');
    if (!id || deleted[id] || /^sample-/.test(id)) return;
    var nm = normName_(r[1]);
    // 이름이 같거나 '닉네임 성함' 형식이면 끝이 성함
    if (!(nm === name || (nm.length > name.length && nm.slice(-name.length) === name))) return;
    if (digits_(r[4]).slice(-4) !== last4) return;
    var x = {};
    try { x = JSON.parse(String(r[17] || '{}')) || {}; } catch (er) { x = {}; }
    if (x.i && x.i !== id) x = {};
    var items = String(r[2] || '').split(/\s*\/\s*/).filter(function (s) { return s && !/^\s*요청\s*[:：]/.test(s); });
    var amount = r[11] !== '' && r[11] != null ? Number(r[11]) : null;
    out.push({
      no: id.slice(-4).toUpperCase(),
      createdAt: Number(r[9]) || null,
      items: items,
      status: String(r[6] || '대기'),
      paid: String(r[12]) === 'true',
      amount: isNaN(amount) ? null : amount,
      trackingNumber: String(r[10] || '') || null,
      shipments: (x.sh || []).filter(function (s) { return s && s.postStatus !== 'cancelled'; }).map(function (s) {
        return { no: s.no, items: s.items || {}, trackingNumber: s.trackingNumber || null, registered: s.postStatus === 'registered' };
      }),
    });
  });
  out.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  return json_({ ok: true, orders: out, prices: prices });
}
