# 송장 자동 등록 · 배달완료 확인 (봇 루틴용)

앱이 따로 "가져오기 행"을 읽지 않음. **봇이 `Orders` 탭의 해당 주문 행 R열 JSON `.sh[]` 발송건을 직접 고치고 I열 시각을 올리면**
앱(맥북·아이폰)은 다음 동기화에서 발송건 단위로 병합해서 받음 (`mergeShipments`: 같은 id 발송건은 송장·접수번호·요금·배달완료를 지우지 않고 보존).
→ 「송장 등록」 화면으로 붙여넣은 것과 똑같이 표시됨 (주문 카드 `✅ 접수 완료 · 송장 …`, 조회 페이지 `📦 N차 발송 · 우체국 … 배송조회`).
설정 탭 행을 하나 더 두는 방식(앱이 적용)은 쓰지 않음: 설정 탭은 앱이 통째로 다시 쓰므로 봇 쓰기가 덮일 위험이 더 큼.

## 행 / 열
- 탭 `Orders`, 1행 헤더: `A id | B name | C items | D address | E phone | F group(안 씀) | G status | H priority | I updatedAt(ms) | J createdAt | K trackingNumber | L amount | M paid | N paidAt | … | R progress(JSON)`
- R열 JSON 예: `{"i":"<주문id>","v":2,"d":{…},"sh":[{"id":"sh-…","no":1,"items":{"제품":1},"postStatus":"registered","mode":"visit","requestedAt":…,"registeredAt":…,"receiptNo":"2026102628385601","prepaid":true,"updatedAt":…}],"x":{…}}`
- **`i` 가 A열 id 와 같은지 꼭 확인** (다르면 그 행은 밀린 행 → 건드리지 말 것). `v`, `d`, `x`, 다른 발송건, 모르는 필드는 그대로 둠.

## 1) 송장 자동 등록 (예약조회 → 등기번호)
인터넷우체국 로그인 → 예약조회(창구: 사전접수 조회 / 방문: 방문접수 예약조회)에서 접수번호(receiptNo)별로 받는 분 이름 + 등기번호(13자리) + 요금을 읽음.

매칭 규칙 (위에서부터):
1. 발송건 `receiptNo` 가 예약조회 접수번호와 같고 (`-` 무시하고 숫자만 비교), `postStatus` 가 `requested` 또는 `registered`, `trackingNumber` 없음.
2. 그 주문의 B열 이름이 받는 분 이름과 같음 (공백 무시. B열이 `닉네임 성함` 이면 끝부분이 성함과 같으면 OK). 마스킹(`고*영`)이면 첫 글자·끝 글자·길이로 비교.
3. 같은 접수번호 + 같은 이름이 여러 개면(한 사람 여러 박스) 아직 송장 없는 발송건 중 `no` 작은 것부터 순서대로. 그래도 애매하면 쓰지 말고 보고.
4. 이미 같은 등기번호가 어떤 발송건에 있으면 건너뜀 (중복 금지).

쓰기 (그 발송건만):
```
trackingNumber: "6892013747030"   // 숫자만 13자리
postStatus: "registered"
registeredAt: (없으면) now
fee: 4000                         // 알면 그 소포 요금(원, 사전결제 할인 반영 금액). 모르면 생략
updatedAt: now
```
그리고 같은 행 **`I` = now (ms)**. K열(주문 대표 송장)이 비어 있으면 첫 송장 번호를 넣어도 됨(선택).
G열 status 는 **봇이 바꾸지 말 것**: 앱이 동기화 후 "모든 품목이 송장 있는 발송건에 들어감"을 보고 자동으로 「완료」 처리(필라멘트 차감 포함, 주문당 한 번).

## 2) 배달완료 확인
- 조회 URL (로그인 불필요): `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=<등기번호>`
  - **WebFetch 로는 정상 조회됨** (2026-10-27 확인: 6892013747030 → 기본정보 표 `배달결과 = 배달완료`, 상세 `2026.09.19 19:41 … 배달완료`).
  - **박스에서 curl 은 안 됨** (TLS 핸드셰이크에서 끊김 — 해외 IP 차단 추정). 루틴은 WebFetch(또는 브라우저)로 조회.
- 대상: `postStatus:"registered"`, `trackingNumber` 있음, `delivered` 아님인 발송건 (취소건 제외). 접수 후 1년 지나면 조회 불가.
- 판정: 기본정보 표 `배달결과` 칸이 `배달완료` (또는 상세 마지막 줄 처리현황이 `배달완료`).
- 쓰기: 그 발송건 `delivered: true`, `deliveredAt: <배달완료 날짜·시각 ms (KST)>`, `updatedAt: now` + 행 `I` = now.
  `delivered` 는 한 번 true 면 앱 병합에서 유지됨 (false 로 되돌리지 말 것).
- 앱: 카드에 `🏠 배달완료 M/D`, 주문의 모든 품목이 발송되고 송장 있는 발송건이 전부 배달완료면 자동 「완료」.
- 조회 페이지: 발송건마다 `🏠 배달완료`, 전부 배달완료면 상태 배지 `배달완료`
  (**Apps Script 를 새 버전으로 다시 배포해야 표시됨** — scripts/apps-script/Code.gs 가 delivered 를 내려주도록 바뀜).

## 3) 앱이 쓰는 필드 (봇은 건드리지 않음)
- `smsSent`, `smsSentAt`: 「💬 발송 문자 보내기」 화면에서 사용자가 「보냄」 체크.

## 쓰기 방법 / 안전
- 행 하나씩 `Orders!I{n}` 과 `Orders!R{n}` (필요하면 `K{n}`) 만 values.update RAW. 시트 전체 다시 쓰기·정렬·행 삭제 금지.
- 쓰기 직전에 그 행을 다시 읽어서(앱이 방금 바꿨을 수 있음) 최신 R 에 병합해서 씀. 쓰고 몇 초 뒤 다시 읽어 확인.
- 시각은 모두 ms 숫자 (`Date.now()`).
