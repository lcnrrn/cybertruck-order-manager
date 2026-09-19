import assert from 'node:assert/strict';
import { parseReminderLine } from '../src/parseImport.ts';
import {
  DEFAULT_PRODUCTS,
  joinItems,
  parseItemsAgainstCatalog,
} from '../src/products.ts';

const line =
  '꽃방 박성훈 - 냉장고 버튼 커버 및 고정 핀 / DC콤보 / 태블릿거치대 / 일론머스크사진 판 9.5*10 /  부산시 동래구 사직로80 쌍용예가아파트 115동 1403호 01098874397';

const parsed = parseReminderLine(line);
assert.ok(parsed, 'should parse');
assert.equal(parsed!.name, '꽃방 박성훈');
assert.equal(parsed!.phone, '01098874397');
assert.equal(
  parsed!.address,
  '부산시 동래구 사직로80 쌍용예가아파트 115동 1403호',
);
assert.equal(
  parsed!.items,
  '냉장고 버튼 커버 및 고정 핀 / DC콤보 / 태블릿거치대 / 일론머스크사진 판 9.5*10',
);

const { selected, note } = parseItemsAgainstCatalog(
  parsed!.items!,
  DEFAULT_PRODUCTS,
);
const aligned = joinItems(selected, note);

console.log('parsed:', parsed);
console.log('selected chips:', selected);
console.log('note:', note);
console.log('aligned items:', aligned);

assert.ok(
  selected.some((s) => s.includes('냉장고')),
  'should match 냉장고 버튼 커버',
);
assert.ok(
  selected.some((s) => s.includes('DC콤보')),
  'should match DC콤보',
);
assert.ok(
  selected.some((s) => s.includes('태블릿')),
  'should match 태블릿',
);
assert.match(note, /일론머스크/);

// slash-only legacy
const legacy = parseReminderLine(
  '김민수 / 사이드미러 / 서울시 강남구 역삼동 123-45 010-1234-5678',
);
assert.equal(legacy!.name, '김민수');
assert.equal(legacy!.items, '사이드미러');
assert.equal(legacy!.address, '서울시 강남구 역삼동 123-45');
assert.equal(legacy!.phone, '01012345678');

// name + items + address with en-dash
const dash = parseReminderLine(
  '홍길동 – 트럭 MAT / 우체국 택배 / 경기도 성남시 분당구 판교로 123 01099998888',
);
assert.equal(dash!.name, '홍길동');
assert.equal(dash!.phone, '01099998888');
assert.match(dash!.address!, /성남시 분당구/);
assert.match(dash!.items!, /트럭 MAT/);

console.log('OK: all reminder parse asserts passed');
