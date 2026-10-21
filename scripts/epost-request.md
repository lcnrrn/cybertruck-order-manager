# 우체국 접수 요청 (설정 탭 `epostRequest`)

앱의 「📮 우체국 접수」 화면 → 「접수 요청」이 구글 시트 **`설정` 탭**에 한 행을 씀. 봇은 이 행을 읽고 상태를 바꿈.

## 위치
- 탭 `설정`, 열 A:C = `key | json | updatedAt`
- **A열 값이 `epostRequest` 인 행** (행 번호는 고정 아님. 앱이 저장할 때마다 탭 전체를 다시 씀: 헤더, products, sources, sms, filament, production, expenses, deletedOrders, epostRequest, itemStamps 순서. 행은 항상 A열로 찾을 것)
- B열 = 요청 JSON 문자열, C열 = 마지막 수정 시각(ms, 숫자 문자열)

## JSON
```json
{
  "id": "ep-mgz3k1-ab12",
  "requestedAt": 1761010000000,
  "shipmentIds": ["sh-mvhf9d43-bl769", "..."],
  "status": "pending",
  "updatedAt": 1761010000000,
  "startedAt": 1761010100000,
  "finishedAt": 1761010400000,
  "receiptNo": "2026-10-21-64440362",
  "count": 7,
  "amount": 28000,
  "message": "우체국 로그인 필요"
}
```
| status | 쓰는 쪽 | 추가 필드 | 앱 표시 |
|---|---|---|---|
| pending | 앱 | — | 접수 대기 중 (15분 안에 처리) |
| running | 봇 | startedAt | 접수 중 |
| done | 봇 | finishedAt, receiptNo, count, amount(원) | 접수 완료 · 접수번호 · N건 · 예상 금액 |
| error | 봇 | finishedAt, message | message + 「다시 요청」 버튼 |

pending/running 동안 앱의 「접수 요청」 버튼은 비활성. done/error 뒤에 새 요청은 같은 행을 새 id로 덮어씀.

## 병합 규칙 (봇 쓰기가 이기게)
- `epostRequest` 는 **행 단위 최신 우선(LWW)**: C열 `updatedAt` 이 큰 쪽이 이김, 같으면 시트 쪽이 이김.
- **itemStamps 행은 건드리지 않음** (itemStamps 는 products/sources/sms/production 전용. epostRequest 는 그 대상이 아님).
- 봇이 쓸 때마다: B열 JSON의 `status`·`updatedAt` 을 바꾸고 **C열에 `Date.now()` (ms, 지금 시각)** 을 씀. 앱 로컬 값은 사용자가 요청한 시각에서 멈춰 있으므로 항상 봇 값이 더 커서, 앱은 다음 pull(시작 시 + 주기 폴링)에 봇 값을 받아들이고 시트를 덮지 않음.
- 쓰기는 그 행의 `설정!B{n}:C{n}` 만 수정(values.update RAW). 탭 전체를 지우지 말 것.
- 경쟁 주의: 앱 저장은 "pull → merge → 탭 전체 다시 쓰기" 라서 아주 드물게 봇 쓰기 직전에 pull한 앱이 그 직후 덮을 수 있음. 봇은 쓰고 몇 초 뒤 다시 읽어 확인하고, 다르면 다시 쓸 것.

## 봇 처리 순서
1. `설정` A:C 읽기 → `epostRequest` 행, status `pending` 이면 시작.
2. status `running`, startedAt 기록 (C열 = now).
3. `주문` 탭 R열 JSON `.sh[]` 에서 `shipmentIds` 중 postStatus `requested` 인 것만 접수 (cancelled/registered 는 건너뜀). 기존 흐름: `npx tsx scripts/epost-queue.mts <values.json>`.
4. 성공: 각 발송건 `postStatus:"registered"`, `registeredAt`, `receiptNo`, `updatedAt` = 같은 ms, 그 주문 `I{row}` 에도 같은 ms. 그 다음 epostRequest 를 `done` + receiptNo/count/amount (C열 = now).
5. 실패: `error` + message (예: `우체국 로그인 필요`, `카드 확인 필요`), C열 = now. 발송건은 requested 그대로.
