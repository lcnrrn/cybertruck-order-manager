# Deploy notes — SMS templates + order persistence

## Status
- `npm run build` — passed (2026-09-19 KST)
- Features: editable SMS templates; Sheets sync wipe safeguards; legacy localStorage migration; backup hint

## Root cause (orders wiped on update)
1. Debounced Google Sheets write-through could run **before** the first pull+merge finished after silent re-auth, clearing a non-empty sheet with empty/sample local data.
2. `loadOrders()` re-seeded SAMPLE_ORDERS when the saved array was empty, which looked like a wipe after clearing or failed sync.
3. localStorage alone does not survive device/browser storage eviction; Sheets is the cross-update backup.

## Fixes
- Gate auto-push until initial pull+merge succeeds (`initialSyncDoneRef`)
- Never push empty or sample-only local over a known non-empty remote
- Prefer remote when local is empty/sample-only
- Migrate legacy keys → `cybertruck-orders-v1`
- Editable SMS templates in localStorage (`cybertruck-sms-templates-v1`)
