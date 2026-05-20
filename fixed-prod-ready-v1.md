# Servaa Safe Refactor Pipeline - Fixed Prod Ready v1

Date: 2026-05-20

## Changes Made

### Invoice Delivery And Acknowledgement
- Added explicit invoice delivery columns in `database/schema.sql` and `database/safe_refactor_v1.sql`:
  - `invoices.sent_to_table_at`
  - `invoices.acknowledged_by_table_at`
  - `invoices.table_session_token_hash`
- Updated `src/app/api/invoices/send/route.ts` to write `sent_to_table_at` while continuing to write legacy `notes = 'sent_to_table'`.
- Updated `src/app/api/invoices/table/route.ts` to read invoices where either `sent_to_table_at` is present or legacy `notes = 'sent_to_table'`.
- Updated table acknowledgement to write `acknowledged_by_table_at` while continuing to write legacy `notes = 'acknowledged_by_table'`.
- Updated invoice types in `src/types/index.ts` and `src/types/database.ts`.

### Service Request Separation
- Added `service_request_type`, `service_request_status`, and `service_requests` schema support in `database/schema.sql`.
- Added an apply-once migration path in `database/safe_refactor_v1.sql`.
- Added RLS policies for `service_requests` in `database/rls_policies.sql`.
- Updated `src/components/menu/CustomerActions.tsx` to create a `service_requests` row first and keep the legacy zero-total `orders` row during migration so current staff dashboards and notifications continue to work.
- Backfilled the new service request row with `legacy_order_id` when the compatibility order insert succeeds.

### Public API Security And QR Storage Support
- Added additive table QR/session columns:
  - `tables.qr_code_data_url`
  - `tables.qr_url`
  - `tables.qr_token_hash`
  - `tables.qr_token_created_at`
- Added `src/utils/tableSession.ts` for token generation, hashing, and bearer-token parsing.
- Updated `src/utils/qr.ts` and `src/app/api/qr/route.ts` to generate signed QR URLs with a `t` token parameter.
- Kept `tables.qr_code` populated with the QR image data URL for existing dashboard rendering.
- Updated menu routing/components to carry the optional table token through `MenuPage`, `MenuClient`, `StickyCart`, `CustomerActions`, and `TableInvoice`.
- Updated customer invoice table API to validate the token when one is supplied while preserving legacy `tableId`-only fallback.

### Order Creation, Idempotency, And Validation
- Added shared validators in `src/utils/validation.ts`.
- Added `orders.client_request_id` and `orders.customer_session_id`, plus a partial unique index on `(restaurant_id, table_id, client_request_id)`.
- Added backward-compatible `POST /api/orders` in `src/app/api/orders/route.ts`.
- The new endpoint validates restaurant/table IDs, optional table token, menu item availability, quantities, notes, and prices server-side.
- `StickyCart` now tries `POST /api/orders` first and falls back to the existing direct Supabase `orders` plus `order_items` insert path if the API path fails.

### Realtime And Polling Cleanup
- Added `useDebouncedRealtimeRefresh` in `src/hooks/useRealtime.ts`.
- Updated `DashboardOverview` to debounce realtime refreshes and only run polling when the realtime subscription is not healthy.
- Updated billing to debounce invoice realtime refreshes and add a polling fallback only when realtime is not healthy.
- Polling and realtime were preserved; no subscriptions or fallback paths were removed.

### RBAC Expansion
- Expanded staff role values in schema/types to include:
  - `owner`
  - `staff`
  - `manager`
  - `cashier`
  - `kitchen`
- Existing owner/staff behavior is preserved.

## DB Changes

- Fresh schema updated in `database/schema.sql`.
- Production additive migration added at `database/safe_refactor_v1.sql`.
- RLS additions added at `database/rls_policies.sql`.
- No endpoint removals, destructive table drops, or destructive data migrations were added.

## API Changes

- Added `POST /api/orders`.
  - Request: `{ restaurantId, tableId, tableToken?, clientRequestId?, items }`.
  - Response: `{ order }`.
  - Backward-compatible because the UI falls back to direct Supabase inserts on failure.
- Updated `POST /api/qr`.
  - Existing response shape `{ qrCodeUrl, url }` is preserved.
  - Generated URLs now include an optional table token.
- Updated `POST /api/invoices/send`.
  - Existing response shape `{ ok: true }` is preserved.
- Updated `GET /api/invoices/table` and `PATCH /api/invoices/table`.
  - Existing `tableId` flow is preserved.
  - Optional `tableToken` or bearer token is now accepted and validated when present.

## Risks And Follow-Ups

- `POST /api/orders` improves validation and compensates by deleting an order if item insert fails, but it is not a true database transaction. A future RPC should make this fully atomic.
- During migration, service requests are intentionally written to both `service_requests` and legacy zero-total `orders` to preserve staff visibility. A later staff UI update can read `service_requests` directly and then remove the compatibility write.
- Existing QR codes without `qr_token_hash` continue through legacy `tableId` flows. Regenerate QR codes to enable token validation for each table.
- Invoice number race conditions identified in the analyzer were not changed in this pass except by preserving existing idempotent invoice lookup behavior.
- The public RLS policies remain broad for legacy compatibility; token validation was added at API boundaries but legacy direct client flows still exist.

## Migration Strategy

1. Apply `database/safe_refactor_v1.sql` to production.
2. Deploy the application code.
3. Regenerate table QR codes from the dashboard to populate `qr_url`, `qr_token_hash`, and `qr_token_created_at`.
4. Monitor `POST /api/orders` errors and StickyCart fallback frequency.
5. Once staff views support `service_requests` directly and QR token coverage is high, plan a later removal of legacy zero-total service request writes and legacy `tableId`-only access.

## Verification

- `npx tsc --noEmit`: passed.
- `npm run lint`: not completed because `next lint` opened the interactive ESLint setup prompt; no config files were generated.
- `npm run build`: started but was interrupted by the user before completion; lingering build Node processes were stopped.

## Final Production Readiness Status

Status: production candidate after applying `database/safe_refactor_v1.sql` and completing a full build in CI.

The implemented changes are tightly scoped and backward-compatible, but production should not be marked fully ready until the additive DB migration has run and CI confirms the build.
