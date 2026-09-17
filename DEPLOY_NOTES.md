# Deploy notes — product catalog (제품 관리)

## Status
- `npm run build` — passed (2026-09-18 KST)
- Pushed to `lcnrrn/cybertruck-order-manager` **main** via user-GitHub-xai
- Tip commit: `df6c464f4ce6f7714535c3a8d16708b1cf63fbfa`
- Deploy: `deploy-pages.yml` workflow_dispatch run **#20** — **success**
  - https://github.com/lcnrrn/cybertruck-order-manager/actions/runs/35275242463
  - Started ~06:11 KST / finished ~06:12 KST (2026-09-18)
- Push-triggered Pages left disabled

## Changes
### Catalog
- Default Korean products (12) with distinct dark-theme colors (`PRODUCT_COLOR_PALETTE`)
- Persist `localStorage` key `cybertruck-products-v1` as `{ name, color }[]`
- Migration: legacy `string[]` → objects with palette colors
- Exports: `getProducts`, `setProducts`, `DEFAULT_PRODUCTS`, `parseItemsAgainstCatalog`, `joinItems`

### OrderForm
- Multi-select colored chips; join selected with ` / `
- Optional free-text note appended
- Edit: parse `items` by ` / ` or `,` to pre-check catalog names

### Management UI
- 「제품 관리」 sheet (`ProductManager`): add / rename / color / delete / reorder
- Header entry next to 「경로 관리」

### Display
- `ProductBadges` on OrderCard and OrderTable
- Styles in `src/product.css` (imported from `main.tsx`)

## Staging
`/workspace/upload-products/`
