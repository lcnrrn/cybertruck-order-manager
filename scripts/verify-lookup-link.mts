import assert from 'node:assert/strict';

// localStorage 없이도 기본 템플릿으로 동작해야 함
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
const { buildLookupLink, buildLookupSmsBody, buildReceiptSmsBody, buildShippingSmsBody, setSmsTemplates, DEFAULT_SMS_BODIES, LOOKUP_PAGE_URL } = await import('../src/sms.ts');

const buyer = { name: '홍길동', phone: '010-1234-5678', items: '휴대폰 마운트 거치대' };
const link = buildLookupLink(buyer);
assert.equal(link, `${LOOKUP_PAGE_URL}?n=${encodeURIComponent('홍길동')}&k=5678`);
assert.ok(new URL(link).searchParams.get('n') === '홍길동');
// 이름만 / 번호 부족 → 일반 조회 페이지
assert.equal(buildLookupLink({ name: '홍길동', phone: '' }), LOOKUP_PAGE_URL);
assert.equal(buildLookupLink({ name: '', phone: '01012345678' }), LOOKUP_PAGE_URL);
assert.equal(buildLookupLink({ name: '홍길동', phone: '123' }), LOOKUP_PAGE_URL);
assert.equal(buildLookupLink(), LOOKUP_PAGE_URL);
// 닉네임 성함 → 끝 단어
assert.equal(new URL(buildLookupLink({ name: '길동이 홍길동', phone: '01012345678' })).searchParams.get('n'), '홍길동');
// 링크에 전체 번호/주소는 안 들어감
assert.ok(!link.includes('1234'));

// 접수문자: 템플릿에 {{조회링크}} 없으면 끝에 자동
const r1 = buildReceiptSmsBody(buyer, '13,000원');
assert.ok(r1.startsWith('안녕하세요 홍길동님'));
assert.ok(r1.endsWith(`\n제작 진행 상황 확인: ${link}`));
assert.equal(r1.split(link).length, 2);
// 템플릿에 {{조회링크}} 있으면 그 자리에, 중복 추가 없음
setSmsTemplates({ ...DEFAULT_SMS_BODIES, 접수: '{{이름}}님 접수\n진행: {{조회링크}}\n감사합니다' });
const r2 = buildReceiptSmsBody(buyer, '1원');
assert.equal(r2, `홍길동님 접수\n진행: ${link}\n감사합니다`);
// 전화번호 없는 주문 → 일반 링크
setSmsTemplates(DEFAULT_SMS_BODIES);
assert.ok(buildReceiptSmsBody({ name: '홍', items: 'a' }, '1원').endsWith(LOOKUP_PAGE_URL));

// 발송안내: buyer 없으면 기존과 동일, 있으면 끝에 조회 줄
const plain = buildShippingSmsBody('6892015783117');
assert.ok(!plain.includes('lookup.html'));
const sh = buildShippingSmsBody('6892015783117', 'epost', buyer);
assert.ok(sh.startsWith(plain));
assert.ok(sh.endsWith(`\n주문 조회: ${link}`));
const kd = buildShippingSmsBody('123456789', 'kyungdong', buyer);
assert.ok(kd.includes('배송조회: https://kdexp.com') && kd.endsWith(link));

// 🔗 조회 링크 버튼 문자
const lb = buildLookupSmsBody(buyer);
assert.ok(lb.includes('홍길동님') && lb.endsWith(`\n${link}`));
assert.ok(lb.length < 200);
console.log('verify-lookup-link OK');
