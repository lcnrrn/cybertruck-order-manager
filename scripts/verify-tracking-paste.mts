// npx tsx scripts/verify-tracking-paste.mts — 접수내역 붙여넣기 매칭 테스트
import { matchTrackingRows, parseTrackingReceipt } from '../src/parseTrackingReceipt';
import type { Order } from '../src/types';
const fixture = `접수내역
받는분
오종진
등기번호
6892015240450 (https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=6892015240450)
주소
서울특별시 송파구 올림픽로 300
내용물
생활용품
예상금액
4,000원
- 재신청
받는분
김영기
등기번호
6892015240451
주소
경기도 화성시 동탄대로 100
예상금액
4,000원
- 재신청
받는분
김동건
등기번호
6892015240452 (https://service.epost.go.kr/x)
주소
부산광역시 해운대구 센텀중앙로 55
예상금액
4,000원
- 재신청
받는분
유형곤
등기번호
6892015240453
주소
대구광역시 수성구 달구벌대로 2400
예상금액
4,000원
- 재신청
받는분
홍길동
등기번호
6892015240457
주소
강원도 정선군 서동로 1240
예상금액
4,000원
- 재신청`;
const reg = (id: string) => [{ id, no: 1, items: { a: 1 }, postStatus: 'registered' as const, requestedAt: 1, updatedAt: 1 }];
const mk = (id: string, name: string, address: string, sh = true): Order => ({ id, name, items: '', address, phone: '', status: '제작중', priority: false, createdAt: 1, updatedAt: 1, shipments: sh ? reg('s' + id) : undefined });
const orders = [
  mk('1', '오종진 아원', '서울 송파구 올림픽로 300'),
  mk('2', '김영기', '경기 화성시 동탄대로 100'),
  mk('3', '김동건 6', '부산 해운대구 센텀중앙로 55'),
  mk('3b', '김동건', '서울 강남구', false),
  mk('4', '유형곤  제이제이', '대구 수성구 달구벌대로 2400'),
  mk('5', '김승겸', '강원도 정선군 서동로 1240'),
  mk('6', '김승겸 2', '강원도 정선군 서동로 1240'),
];
const rows = parseTrackingReceipt(fixture);
const m = matchTrackingRows(rows, orders);
const got = m.map((x) => `${x.recipientHint}:${x.kind}:${x.selectedOrderId ?? x.candidates.map((c) => c.id).join('|')}`);
console.log(got.join('\n'));
const expect = ['오종진:matched:1', '김영기:matched:2', '김동건:matched:3', '유형곤:matched:4', '홍길동:ambiguous:5|6'];
if (JSON.stringify(got) !== JSON.stringify(expect)) { console.error('FAIL', expect); process.exit(1); }
const old = matchTrackingRows(parseTrackingReceipt('6892013747044  4,000  44429  임*욱\n소포 3000g/80cm 생활용품'), [mk('9', '임동욱', '')]);
if (old[0].kind !== 'matched' || old[0].trackingNumber !== '6892013747044') { console.error('FAIL masked', old); process.exit(1); }
console.log('tracking paste OK');
