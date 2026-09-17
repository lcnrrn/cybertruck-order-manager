# Deploy notes — product catalog (제품 관리)

## Status
- `npm run build` — passed (2026-09-18 KST)
- Push / deploy: pending (this file updated after push)

## Changes
### Catalog
- Default Korean products (12) with distinct dark-theme colors
- Persist `localStorage` key `cybertruck-products-v1` as `{ name, color }[]`
- Migration: legacy `string[]` → objects with palette colors

### OrderForm
- Multi-select colored chips; join selected with ` / `
- Optional free-text note appended
- Edit: parse `items` by ` / ` or `,` to pre-check catalog names

### Management UI
- 「제품 관리」 sheet (`ProductManager`): add / rename / color / delete / reorder
- Header entry next to 「경로 관리」

### Display
- `ProductBadges` on OrderCard and OrderTable

## Staging
`/workspace/upload-products/`
