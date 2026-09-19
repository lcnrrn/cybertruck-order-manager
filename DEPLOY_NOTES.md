# Deploy notes — work queue UX

## Status
- `npm run build` — passed (2026-09-19 KST)
- Features: work-queue default (작업중), search across fields, month/period filter, SMS templates, Sheets sync wipe safeguards

## UX (2026-09-19)
1. Status tabs: **작업중** (대기+제작중) | 대기 | 제작중 | 완료 | 전체 — default 작업중, persisted in localStorage
2. Toolbar search: name, phone, address, trackingNumber, items, group + clear button
3. Period filter: 이번 달 / 지난 달 / 전체 기간 / 직접 선택 (createdAt, fallback updatedAt)
4. Result count + contextual empty states

## Prior notes
- Gate auto-push until initial pull+merge; never push empty/sample over non-empty remote
- Editable SMS templates in localStorage (`cybertruck-sms-templates-v1`)
