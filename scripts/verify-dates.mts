import assert from 'node:assert/strict';
import { formatOrderDate, relativeLabel, parseSubmittedAt, toYmd, withYmd, daysAgo } from '../src/dates.ts';
import { parseNaverFormRows } from '../src/parseImport.ts';

const now = new Date(2026, 9, 19, 2, 0).getTime();
assert.equal(formatOrderDate(new Date(2026, 9, 19, 1).getTime(), now), '10/19(월)');
assert.equal(formatOrderDate(new Date(2025, 9, 19).getTime(), now), '2025/10/19(일)');
assert.equal(relativeLabel(new Date(2026, 9, 16, 23).getTime(), now), '3일 전');
assert.equal(relativeLabel(new Date(2026, 9, 18, 23).getTime(), now), '어제');
assert.equal(daysAgo(new Date(2026, 9, 19, 0, 1).getTime(), now), 0);
const t = new Date(2026, 9, 10, 15, 30).getTime();
const moved = withYmd(t, '2026-10-05');
assert.equal(toYmd(moved), '2026-10-05');
assert.equal(new Date(moved).getHours(), 15);
assert.equal(parseSubmittedAt('2026.10.12 14:05'), new Date(2026, 9, 12, 14, 5).getTime());
assert.equal(parseSubmittedAt('2026-10-12 오후 2:05:09'), new Date(2026, 9, 12, 14, 5, 9).getTime());
assert.equal(parseSubmittedAt('2026. 10. 12.'), new Date(2026, 9, 12).getTime());
assert.equal(toYmd(parseSubmittedAt(46307.5)!), '2026-10-12');
assert.equal(parseSubmittedAt('없음'), undefined);
const rows = [
  ['제출일시', '성함', '연락처', '주소'],
  ['2026.10.12 14:05', '홍길동', '010-1234-5678', '서울시 어딘가'],
  ['', '김철수', '010-1111-2222', '부산'],
];
const out = parseNaverFormRows(rows);
assert.equal(out[0].createdAt, new Date(2026, 9, 12, 14, 5).getTime());
assert.equal(out[1].createdAt, undefined);
console.log('dates OK');
