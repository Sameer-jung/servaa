# Servaa Cleanup Plan v1

Date: 2026-05-21

## Goals

- Keep current ordering, billing, QR, realtime, auth, RLS, menu, invoice, service request, and dashboard behavior working.
- Prefer deletion where usage is proven absent.
- Leave transitional production flows in place until their replacements are fully wired and verified.
- Use incremental DB migrations only; no destructive DB rewrites.

## Phase 1: Analysis Only

Status: Completed for this pass.

Files inspected:

- All `src/app` routes and API handlers.
- All hooks under `src/hooks`.
- All utilities under `src/utils`.
- All components under `src/components`.
- Type files under `src/types`.
- SQL files under `database`.
- Package scripts and Next/TypeScript config.

Outputs:

- `cleanup-analysis-v1.md`
- `cleanup-plan-v1.md`
- `cleanup-execution-v1.md`

## Phase 2: Safe Removals Only

Status: Completed for this pass.

Exact files removed:

- `src/components/billing/InvoiceCard.tsx`
- `src/hooks/useAuth.ts`

Exact files modified:

- `src/utils/format.ts`
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/(dashboard)/dashboard/billing/page.tsx`
- `src/app/(dashboard)/dashboard/orders/page.tsx`
- `src/app/page.tsx`
- `src/components/auth/LoginForm.tsx`
- `src/components/auth/RegisterForm.tsx`
- `src/components/billing/InvoiceDetail.tsx`
- `src/components/orders/OrderCard.tsx`
- `src/components/tables/QRCodeDisplay.tsx`

DB impact:

- None.

Rollback difficulty:

- Low. Deleted files were unreferenced; restore from git if needed.

Verification checklist:

- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- Import search for removed symbols.
- Manual route smoke checks when a Supabase-backed environment is available.

## Phase 3: Duplicate System Reduction

Recommended next batch, not performed in this pass.

Candidate files:

- `src/app/api/invoices/route.ts`
- `src/components/menu/StickyCart.tsx`
- `src/components/menu/CustomerActions.tsx`
- `src/components/dashboard/DashboardOverview.tsx`
- `src/app/(dashboard)/dashboard/orders/page.tsx`
- `src/app/(dashboard)/dashboard/billing/page.tsx`
- `src/hooks/useRestaurant.ts`
- `src/utils/roles.ts`

Plan:

1. Confirm production DB has `set_invoice_number` trigger.
2. If confirmed, remove app-level invoice number counting from `/api/invoices`.
3. Confirm `order_items` changes reliably produce order realtime via `update_order_total_on_item_change`.
4. If confirmed, remove dashboard overview broad `order_items` subscription and keep order realtime plus fallback polling.
5. Keep `StickyCart` direct Supabase fallback until order API health is observable in production.
6. Keep `service_requests` plus legacy request orders until dashboard directly renders service requests.

DB impact:

- None for steps 1-6 unless later migrations are added.

Rollback difficulty:

- Medium for realtime changes; low for pure API helper extraction.

Production risk:

- Medium. Requires staging verification with live Supabase realtime and order item inserts.

## Phase 4: Architecture Clarification

Recommended after Phase 3.

Candidate files:

- `src/hooks/useRestaurant.ts`
- `src/app/(dashboard)/layout.tsx`
- `src/components/dashboard/OrderNotifications.tsx`
- `src/app/(dashboard)/dashboard/page.tsx`
- Invoice and order API route files.

Plan:

1. Introduce a tiny server/client restaurant resolution boundary only if it removes repeated queries without adding global state.
2. Add a small staff API auth helper for invoice/QR routes while preserving exact response behavior.
3. Document canonical sync rules in repo docs:
   - Order pages use order realtime.
   - Billing uses invoice realtime.
   - Customer invoice delivery uses polling.
   - Service requests are transitional until dashboard support is first-class.
4. Add focused comments only where compatibility logic exists.

DB impact:

- None expected.

Rollback difficulty:

- Low to medium depending on helper extraction.

Production risk:

- Low if helper extraction is behavior-preserving and covered by build/type checks.

## Phase 5: Database Deprecation Strategy

Do not execute without production DB metrics and data checks.

Review candidates:

- `invoices.table_session_token_hash`
- `orders.customer_name`
- `orders.customer_phone`
- `get_user_restaurant_ids()`
- overlapping single-column indexes that may be covered by composite indexes
- invoice `notes` values used as delivery state
- `tables.qr_code` after `qr_code_data_url` read migration
- `service_requests.legacy_order_id` after dashboard service request migration

Safe migration style:

- Additive first.
- Backfill second.
- Dual-read/dual-write during transition.
- Stop writes to legacy fields.
- Confirm no reads for one release.
- Remove in a separate migration with `IF EXISTS` and a rollback note.

Production risk:

- High for RLS/policy and column removals.
- Medium for index drops.
- Low for additive columns/backfills when guarded.

## Final Verification Checklist

Automated:

- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `rg "InvoiceCard|useAuth" src` returns no matches.
- `rg "Â|â|·|—|•" src` returns no matches.

Manual or environment-backed:

- Dashboard renders after login.
- Menu page renders by restaurant slug.
- QR table URL still includes table and token.
- Customer can place an order.
- Staff order dashboard receives realtime insert/update.
- Staff can move order through accepted/preparing/ready/completed.
- Completing an order generates or reconciles an invoice.
- Billing can send invoice to table.
- Table invoice modal appears and can be acknowledged.
- Customer water/bill request creates `service_requests` and legacy dashboard-visible order.
- Audit log writes remain non-blocking.

## Production Risk Analysis

This pass intentionally avoids DB and sync behavior changes. The performed code changes are low risk because they remove unreferenced source files, remove comments, fix display text, and simplify one dependency list.

The highest remaining production risks are architectural and should not be handled as blind cleanup:

- Removing polling could hide operational updates when realtime is degraded.
- Removing legacy service request orders could make requests disappear from current staff workflows.
- Tightening public RLS policies could break customer menu/order tracking.
- Removing direct order fallback could strand customers if `/api/orders` is unavailable.
- Dropping DB objects without production usage stats could break older deployments.
