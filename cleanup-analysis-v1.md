# Servaa Cleanup Analysis v1

Date: 2026-05-21

Scope: safe cleanup and architecture stabilization pass for the current Next.js 15, Supabase, Zustand, Tailwind codebase. This analysis favors current production behavior over speculative cleanup.

## Executive Summary

Servaa is compact and production-shaped, but several systems are carrying compatibility logic from recent refactors. The riskiest areas are not dead files; they are duplicated synchronization paths, invoice delivery state split between real columns and legacy notes values, and service requests represented both as first-class `service_requests` rows and legacy zero-total `orders`.

The safe code deletion surface is small. Most cleanup should be phased behind verification because the active product still depends on transitional flows for dashboard visibility, customer invoice delivery, and backwards-compatible QR/order behavior.

## Dead Code Inventory

| Item | Classification | Evidence | Action |
| --- | --- | --- | --- |
| `src/components/billing/InvoiceCard.tsx` | SAFE REMOVE | No imports in `src`; billing page uses inline `BillingTableGroup` plus `InvoiceDetail`. | Removed in this pass. |
| `src/hooks/useAuth.ts` | SAFE REMOVE | No imports in `src`; auth pages use server redirects plus form-level Supabase auth. | Removed in this pass. |
| Commented legacy format helpers in `src/utils/format.ts` | SAFE REMOVE | Entire commented duplicate implementations above active helpers. | Removed in this pass. |
| `MenuCategoryWithItems`, `StaffMember`, `AuditLog`, `DashboardStats`, `ApiResponse`, `RealtimeOrderUpdate` in `src/types/index.ts` | REVIEW REQUIRED | Exported but not imported in current source; may still be useful public app types. | Leave until type exports are intentionally pruned. |
| `isOwner` in `src/utils/roles.ts` | REVIEW REQUIRED | Exported but not used; `isStaff` is used by `hasRestaurantAccess`. | Leave unless route access helpers are consolidated. |
| `CardHeader`, `CardTitle`, `CardFooter` in `src/components/ui/Card.tsx` | REVIEW REQUIRED | Not imported today, but part of a UI primitive export surface. | Leave unless UI primitives are intentionally reduced. |
| `get_user_restaurant_ids()` SQL helper | REVIEW REQUIRED | Not referenced by app code or policies in this repo. | Candidate phased DB deprecation only after production DB inspection. |
| Loading route files under dashboard | ACTIVE | Used automatically by App Router route segments. | Keep. |
| API routes under `src/app/api` | ACTIVE | Orders, invoices, table invoice polling, invoice send, QR generation are active flows. | Keep. |

## Duplicate Systems Map

| Area | Current Systems | Canonical Direction | Fallback / Removal Candidate |
| --- | --- | --- | --- |
| Order creation | `/api/orders` validates table/menu/idempotency using `supabaseAdmin`; `StickyCart` falls back to direct client inserts. | `/api/orders` should be canonical. | Keep direct Supabase fallback temporarily; remove only after API reliability and RLS/token rollout are verified. |
| Invoice number generation | API has `generateInvoiceNumber`; DB trigger `set_invoice_number` also generates invoice numbers. | DB trigger is the stronger single writer if present everywhere. | Later remove API counting, but only after confirming all DBs have the trigger. |
| Invoice table delivery state | Columns `sent_to_table_at` / `acknowledged_by_table_at`; `notes` still stores `sent_to_table` / `acknowledged_by_table`. | Timestamp columns should be canonical. | Keep `notes` compatibility until old table clients/data no longer need it. |
| Service requests | First-class `service_requests`; legacy zero-total orders with `REQUEST: Water/Bill`; order helper filters these from billing. | `service_requests` should become canonical. | Keep legacy order rows until dashboard/notification UX consumes `service_requests` directly. |
| Dashboard sync | `useRealtimeOrders`, broad `order_items` realtime refresh, 15s fallback interval. | Order-level realtime with debounced refresh should be canonical. | Review removal of broad `order_items` subscription after confirming order total trigger emits order updates. |
| Billing sync | Invoice realtime plus 30s fallback polling plus manual refresh after actions. | Invoice realtime plus action refresh. | Keep fallback polling for operational reliability; consider increasing interval later. |
| Customer invoice sync | `TableInvoice` polls `/api/invoices/table` every 5s. | Polling is currently canonical for table invoice delivery. | Realtime for customers is optional later; do not remove polling now. |
| Restaurant resolution | `useRestaurant`, dashboard page server lookup, `OrderNotifications` client lookup. | Shared restaurant resolution helper or server-provided context. | Consolidate only when dashboard layout can own restaurant context cleanly. |
| Order table grouping | Similar grouping logic in dashboard overview and orders page. | A shared pure utility can be useful. | Defer; extraction is low value until behavior is stabilized. |
| Validation/error handling | Orders route uses `validation.ts`; invoices and QR use local checks. | Keep route-local behavior but standardize tiny auth/error helpers later. | Avoid broad API framework abstraction. |

## Transitional Systems

| System | Status | Keep Temporarily? | Migration Direction |
| --- | --- | --- | --- |
| Legacy service request orders via `special_instructions = REQUEST:*` | ACTIVE compatibility | Yes | Add dashboard/service request UI and notifications from `service_requests`, then stop creating legacy order rows. |
| `legacy_order_id` on `service_requests` | ACTIVE bridge | Yes | Drop only after no active service request references legacy orders. |
| Invoice `notes` state encoding | ACTIVE compatibility | Yes | Backfill timestamps, stop writing notes values, then remove notes-based query branch. |
| `qr_code` and `qr_code_data_url` both storing QR image data | ACTIVE compatibility | Yes | Move reads to `qr_code_data_url`, backfill, then deprecate `qr_code`. |
| Optional QR token enforcement | ACTIVE backward compatibility | Yes | Once all tables have tokenized QR URLs, require token on customer order/invoice APIs. |
| Direct client order fallback in `StickyCart` | ACTIVE fallback | Yes | Remove after `/api/orders` has production confidence and client token validation is mandatory. |
| `table_session_token_hash` on invoices | REVIEW REQUIRED | No active write/read path found. | Either wire it to invoice delivery or deprecate in a phased DB cleanup. |

## Database Cleanup Findings

Active structures to keep:

- `audit_logs`, `service_requests`, `staff_members`, `orders`, `order_items`, `invoices`, `tables`, menu tables, restaurants.
- Idempotency field `orders.client_request_id` and unique partial index.
- QR token fields on `tables`.
- Invoice lifecycle fields `sent_to_table_at`, `acknowledged_by_table_at`, `paid_at`.
- Realtime `REPLICA IDENTITY FULL` on orders, order_items, invoices, service_requests.

Review-required DB items:

- `invoices.table_session_token_hash` exists but is not used by app code.
- `orders.customer_name` and `orders.customer_phone` exist but no current UI/API writes them.
- `get_user_restaurant_ids()` is not referenced in policies or app code.
- Base indexes in `schema.sql` overlap with richer composite indexes in `scalability.sql`; do not drop without production `pg_stat_user_indexes`.
- `generate_invoice_number()` DB trigger duplicates API invoice number generation.
- Public select policies on `tables`, `menu_categories`, `menu_items`, `orders`, and `order_items` are intentionally permissive for QR/customer flows but broaden read surface. Tightening requires a separate RLS design, not cleanup.

No destructive DB changes were made in this pass.

## Realtime And Polling Architecture

Active sync paths:

- Dashboard overview:
  - Fetches `get_dashboard_stats` and recent orders.
  - Subscribes to `orders` for restaurant-scoped changes through `useRealtimeOrders`.
  - Subscribes broadly to `order_items` and refreshes.
  - Polls every 15s only when realtime is not subscribed.
- Orders page:
  - Fetches paginated orders by tab.
  - Subscribes to restaurant-scoped `orders`.
  - Fetches changed order by id on INSERT/UPDATE.
  - Optimistically updates status from staff actions.
- Billing page:
  - Fetches unpaid and paid invoices through `/api/invoices`.
  - Subscribes to restaurant-scoped `invoices`.
  - Polls every 30s only when realtime is not subscribed.
- Customer menu:
  - `OrderTracker` subscribes to one order id.
  - `TableInvoice` polls every 5s.
- Notifications:
  - Subscribes to restaurant-scoped order INSERT and retries fetching order items.

Recommended canonical paths:

- Orders dashboard: restaurant-scoped `orders` realtime plus targeted fetch by id.
- Billing: invoice realtime plus explicit refresh after billing actions.
- Customer invoice: keep polling until customer realtime auth/token design is explicit.
- Dashboard overview: prefer order realtime once order total trigger behavior is confirmed; broad `order_items` subscription is the main cleanup candidate.

## RBAC And Auth Findings

Active behavior:

- Middleware protects `/dashboard`.
- Auth pages use server redirects.
- API invoice routes use `createClient()` plus `hasRestaurantAccess()`.
- RLS helpers `is_restaurant_staff()` and `is_restaurant_owner()` remain central to database enforcement.
- Owner membership is inserted into `staff_members` during registration/setup.

Confusion points:

- Restaurant resolution is duplicated in server dashboard page and `useRestaurant`.
- QR route validates logged-in user and uses RLS but does not call `hasRestaurantAccess`; this is acceptable today because RLS controls table access, but pattern differs from invoice APIs.
- Client-side audit writes use anon Supabase and may fail silently under current RLS for unauthenticated customer order fallback. This is acceptable because audit logging is non-blocking, but server-side audit is more reliable.

## API Structure Findings

Active route behavior:

- `/api/orders`: canonical order creation path with menu availability checks, idempotency, optional table token validation, server-side audit.
- `/api/invoices`: invoice list/reconcile/create/payment update.
- `/api/invoices/send`: staff sends invoice to table.
- `/api/invoices/table`: table fetch/acknowledge invoice.
- `/api/qr`: staff QR generation and token storage.

Cleanup opportunities:

- Small shared helper for authenticated restaurant access in staff APIs.
- Shared parse/validate helpers for UUID and enum values in invoice routes.
- Remove app-level invoice number generation after DB trigger presence is guaranteed.
- Keep response shapes unchanged while standardizing.

## Frontend State Complexity

Active state owners:

- Cart: `useCartStore`, persisted and scoped by restaurant/table.
- Restaurant: `useRestaurant` in dashboard client pages and notifications.
- Orders: page-local state with optimistic status changes.
- Dashboard overview: page-local aggregate/order state.
- Billing: page-local paid/unpaid invoice state.
- Customer invoice: local modal state plus sessionStorage acknowledgement list.

Stabilization opportunities:

- Avoid adding global stores beyond cart.
- Consolidate repeated restaurant lookup only when dashboard layout can provide a stable context.
- Keep optimistic status updates local to orders page.
- Keep table invoice sessionStorage acknowledgement because it prevents immediate reappearing modals while API acknowledgement finishes.

## Dependency Mapping

| Feature | Primary Files |
| --- | --- |
| QR menu render | `src/app/menu/[restaurantSlug]/page.tsx`, `MenuClient.tsx`, menu components, `useCartStore` |
| Order creation | `StickyCart.tsx`, `/api/orders`, `validation.ts`, `tableSession.ts`, `orders.ts` |
| Order lifecycle dashboard | `dashboard/orders/page.tsx`, `OrderCard.tsx`, `useRealtime.ts`, `/api/invoices` |
| Dashboard overview | `DashboardOverview.tsx`, `useRealtime.ts`, `database/scalability.sql` |
| Billing | `dashboard/billing/page.tsx`, `InvoiceDetail.tsx`, `/api/invoices`, `/api/invoices/send` |
| Table invoice delivery | `TableInvoice.tsx`, `/api/invoices/table`, invoice lifecycle columns |
| QR generation | `dashboard/tables/page.tsx`, `QRCodeDisplay.tsx`, `/api/qr`, `qr.ts`, `tableSession.ts` |
| Service requests | `CustomerActions.tsx`, `service_requests`, legacy request orders, `orders.ts` |
| Auth/session | middleware, auth pages, auth forms, Supabase clients |
| RBAC/RLS | `roles.ts`, `rls_policies.sql`, `staff_members` |
| Audit logging | `audit.ts`, `audit_logs`, selected route/component writes |

## Risk Classification

Low risk:

- Remove unreferenced files.
- Remove commented duplicate code.
- Fix corrupted display text.
- Reuse existing `generateSlug`.
- Remove unused hook dependency from billing fetch callback.

Medium risk:

- Consolidate duplicated restaurant lookup.
- Extract shared API auth helpers.
- Remove broad dashboard `order_items` realtime subscription.
- Remove direct Supabase order fallback.
- Remove app-level invoice number generator.

High risk:

- Any RLS policy tightening.
- Any production column/index/function drops.
- Removing service request legacy order bridge.
- Requiring QR tokens for all customer table access.
- Changing invoice delivery from polling to realtime only.
