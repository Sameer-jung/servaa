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

### RBAC Scope
- Staff role values are limited to:
  - `owner`
  - `staff`
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

# ============================================================
# LIVE FIX PASS - INVOICE POPUP, TABLE ERRORS, CURRENCY, SUPER ADMIN ANALYSIS
# ============================================================

Date: 2026-05-20

## Scope

This pass only addressed:
- repeating customer invoice popup after acknowledgement
- duplicate table number user-facing error message
- restaurant currency configurability and dynamic display
- Super Admin feasibility analysis only

## Exact Files Changed

- `database/schema.sql`
- `database/currency_defaults_v1.sql`
- `src/app/api/invoices/table/route.ts`
- `src/components/menu/TableInvoice.tsx`
- `src/app/(dashboard)/dashboard/tables/page.tsx`
- `src/app/(dashboard)/dashboard/settings/page.tsx`
- `src/utils/format.ts`
- `src/app/(dashboard)/dashboard/billing/page.tsx`
- `src/components/billing/InvoiceDetail.tsx`
- `src/components/billing/InvoiceCard.tsx`
- `src/app/menu/[restaurantSlug]/MenuClient.tsx`
- `src/components/menu/MenuItemCard.tsx`
- `src/components/menu/StickyCart.tsx`
- `src/components/orders/OrderCard.tsx`
- `src/app/(dashboard)/dashboard/orders/page.tsx`
- `src/app/(dashboard)/dashboard/menu/page.tsx`
- `src/components/dashboard/DashboardOverview.tsx`
- `src/app/(dashboard)/dashboard/page.tsx`

## Root Cause Analysis

### Repeating Invoice Popup

Root cause: `PATCH /api/invoices/table` acknowledged an invoice by writing `acknowledged_by_table_at`, but `GET /api/invoices/table` still selected any unpaid invoice where `sent_to_table_at` was present or legacy `notes = 'sent_to_table'`. Because acknowledgement does not clear `sent_to_table_at`, polling continued to return the same invoice, reopening the modal.

Fix:
- `GET /api/invoices/table` now excludes rows where `acknowledged_by_table_at` is not null.
- `TableInvoice` now stores acknowledged invoice IDs in `sessionStorage` per table.
- `TableInvoice` also guards against an in-flight acknowledgement race so polling cannot reopen the same invoice before the database update is visible.
- Polling remains in place.
- Billing realtime and polling behavior was not removed.

### Duplicate Table Error

Root cause: the tables page displayed the raw Supabase/PostgreSQL unique constraint error directly.

Fix:
- `src/app/(dashboard)/dashboard/tables/page.tsx` now maps Postgres code `23505` and the `tables_restaurant_id_table_number_key` constraint message to: `Table number already exists for this restaurant.`
- The DB unique constraint remains intact.
- There is no separate table-create API in the current codebase; table creation is still a direct Supabase UI write, so the UI-level handler is the active production path.

### Hard-Coded / Default Currency

Root cause: some invoice/order/menu display paths called `formatCurrency` without passing `restaurant.currency`, causing the formatter default to decide the symbol instead of the restaurant configuration. Settings also did not expose currency editing.

Fix:
- Settings now includes a simple currency selector.
- Settings saves `restaurants.currency`.
- `formatCurrency` defaults safely to `NPR` and falls back to `NPR` if an invalid currency code is supplied.
- Fresh schema default changed from `USD` to `NPR`.
- Existing/missing restaurant currency values are handled by `database/currency_defaults_v1.sql`.
- Billing, invoice detail/card, dashboard overview, orders, order cards, dashboard menu, public menu item cards, and sticky cart now pass restaurant currency where available.

## Migration Details

New migration:
- `database/currency_defaults_v1.sql`

Migration behavior:
- Sets future `restaurants.currency` default to `NPR`.
- Updates only restaurants where `currency IS NULL` or blank.
- Does not overwrite explicit existing currency values.

Apply after prior migrations:
1. `database/safe_refactor_v1.sql`
2. `database/currency_defaults_v1.sql`

## Risks

- A full `npm run build` was started but interrupted by the user twice, so build validation for this pass is not recorded as complete.
- `npx tsc --noEmit` passed after the code changes.
- Existing restaurants with explicit `USD` remain `USD`; the migration only defaults null/blank currencies to `NPR`.
- Browser `sessionStorage` can be unavailable in strict browser modes, but the server-side `acknowledged_by_table_at IS NULL` filter is the primary fix.

## Validation Results

- `npx tsc --noEmit`: passed.
- `npm run build`: not completed because the command was interrupted by the user.
- Manual code-path validation completed for:
  - customer invoice modal -> GET `/api/invoices/table`
  - table acknowledgement -> PATCH `/api/invoices/table`
  - repeated polling fallback after acknowledgement
  - table creation duplicate error handling
  - restaurant currency settings save path
  - currency display call sites touched in this pass

## Super Admin Feasibility Analysis Only

No Super Admin implementation was added.

Can platform-level Super Admin exist cleanly?
- Yes, but not cleanly with only the current `restaurants.owner_id` and `staff_members` tenant model. A platform-level role should be separate from restaurant staff roles so tenant permissions and platform permissions do not blur.

Current architecture:
- `restaurants.owner_id` identifies the restaurant owner.
- `staff_members` grants restaurant-scoped access using `restaurant_id`, `user_id`, and role values.
- RLS helper functions such as `is_restaurant_staff` and `is_restaurant_owner` are tenant-scoped.
- Most dashboard reads depend on finding one restaurant for the current user.

Needed future changes:
- Add a separate platform-level admin table, for example `platform_admins(user_id, role, is_active, created_at)`.
- Add RLS helper functions such as `is_platform_admin()`.
- Update RLS policies table-by-table to allow platform admins where appropriate.
- Add admin-only APIs or dashboard routes for cross-tenant views.
- Update dashboard restaurant resolution so platform admins can choose a tenant instead of implicitly loading one restaurant.
- Add audit logging for platform admin actions.

Would current RLS support it?
- Not directly. Current RLS is restaurant-scoped and does not include platform-level bypass checks. Super Admin would require additive RLS helper functions and policy changes.

Future risks:
- Cross-tenant data exposure if platform role checks are mixed into existing staff logic too casually.
- Owner/staff UX confusion if Super Admin users also appear as restaurant staff.
- Dangerous write access without audit logs.
- Support workflows may need read-only impersonation rather than direct mutation.

Tables/permissions likely needing future changes:
- `restaurants`
- `staff_members`
- `tables`
- `menu_categories`
- `menu_items`
- `orders`
- `order_items`
- `invoices`
- `service_requests`
- any future billing/subscription/platform settings tables

Recommended future approach:
- Keep Super Admin separate from `staff_members`.
- Start with read-only cross-tenant access.
- Add audited write actions only where there is a clear operational need.

# ============================================================
# LIVE FIX PASS - OWNER/STAFF RBAC AND LIGHTWEIGHT AUDIT LOGGING
# ============================================================

Date: 2026-05-20

## Scope

This pass only addressed:
- keeping staff roles limited to `owner` and `staff`
- adding a small reusable owner/staff helper
- adding minimal audit logs for critical business actions
- preserving existing auth, RLS, ordering, billing, and dashboard behavior

## Exact Files Changed

- `database/schema.sql`
- `database/rls_policies.sql`
- `database/safe_refactor_v1.sql`
- `database/audit_logs_v1.sql`
- `src/types/database.ts`
- `src/types/index.ts`
- `src/utils/roles.ts`
- `src/utils/audit.ts`
- `src/app/api/orders/route.ts`
- `src/app/api/invoices/route.ts`
- `src/app/api/invoices/send/route.ts`
- `src/app/(dashboard)/dashboard/orders/page.tsx`
- `src/app/(dashboard)/dashboard/menu/page.tsx`
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/components/auth/RegisterForm.tsx`
- `src/components/menu/StickyCart.tsx`

## Role Control

- `StaffRole` is now only `owner | staff`.
- `database/schema.sql` and `database/safe_refactor_v1.sql` now keep `staff_members.role` constrained to `owner` and `staff`.
- `database/audit_logs_v1.sql` normalizes null or previously-expanded role values to `staff` before applying the owner/staff-only check constraint.
- No dashboard access flow or RLS helper was rewritten.

## Shared Role Helper

Added `src/utils/roles.ts` with:
- `getUserRole`
- `isOwner`
- `isStaff`
- `hasRestaurantAccess`

The helper treats active non-owner staff rows as `staff`, so unexpected/null-like values do not create new permission tiers.

## Audit Logging

Added `audit_logs` support with:
- `id`
- `restaurant_id`
- `actor_user_id`
- `action`
- `entity_type`
- `entity_id`
- `metadata`
- `created_at`

New migration:
- `database/audit_logs_v1.sql`

Logged actions:
- `invoice.created`
- `invoice.sent_to_table`
- `invoice.marked_paid`
- `order.created`
- `order.status_changed`
- `menu_item.created`
- `menu_item.updated`
- `menu_item.deleted`
- `staff.added`

No staff removal UI exists in the current codebase, so no staff removal call site was added.

## Audit Safety

- Audit writes use `writeAuditLog` in `src/utils/audit.ts`.
- Logging failures are caught and ignored.
- Audit writes do not change API response shapes.
- No external service or analytics system was added.
- Public ordering through `POST /api/orders` logs with `actor_user_id = null`.
- Legacy cart fallback attempts a silent audit write; if RLS rejects it, ordering still succeeds.

## Migration Details

Apply:
1. `database/safe_refactor_v1.sql` if not already applied
2. `database/audit_logs_v1.sql`

`database/audit_logs_v1.sql` is additive for audit logs and safely narrows staff roles back to owner/staff by converting null or unsupported role values to `staff`.

## Validation Results

- `npx tsc --noEmit`: passed.
- `npm run build`: not run in this pass.

## Risks

- Audit logging is best-effort. If RLS rejects a client-side audit write, the business action still completes.
- Existing data with unsupported role strings will be treated as `staff` by the migration, matching the requested owner/staff-only model.
