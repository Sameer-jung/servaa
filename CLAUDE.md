# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build (requires valid Supabase env vars)
npm run lint         # ESLint (next lint)
npm run db:types     # Regenerate src/types/supabase.ts from live Supabase schema
npm run db:migrate   # Apply database/schema.sql to DATABASE_URL (fresh local DB only)
npx tsc --noEmit     # TypeScript check without building
```

No test runner is configured.

## Architecture

Servaa is a multi-tenant SaaS restaurant QR ordering platform built with **Next.js 15 App Router**, **Supabase** (Postgres + Auth + Realtime + RLS), **Tailwind CSS**, and **Zustand** for cart state.

### Key surfaces

| Route | Purpose |
|---|---|
| `/` | Public landing page |
| `/(auth)/login`, `/(auth)/register` | Auth route group |
| `/(dashboard)/dashboard` | Protected staff/owner dashboard |
| `/menu/[restaurantSlug]` | Customer-facing QR menu (`?table=&t=` tokens) |
| `/api/orders` | Create order (POST), cancel item (PATCH) |
| `/api/orders/status` | Staff: advance order status with state-machine enforcement (PATCH) |
| `/api/orders/bill` | Customer: fetch unpaid orders for bill summary (GET) |
| `/api/orders/[orderId]/status` | Customer: poll a single order's status (GET) |
| `/api/orders/session` | Customer: fetch full order session (GET) |
| `/api/qr` | Generate table QR code (POST) |
| `/api/invoices` | Invoice CRUD (GET/POST/PATCH) |
| `/api/invoices/send` | Push invoice to customer table (POST) |
| `/api/invoices/table` | Customer invoice delivery and acknowledgement (GET/PATCH) |
| `/api/inventory` | Staff: inventory item CRUD (GET/POST/PATCH) |
| `/api/inventory/movements` | Staff: stock movement ledger (GET/POST) |
| `/api/expenses` | Owner-only: expense CRUD (GET/POST/PATCH/DELETE) |

`src/middleware.ts` guards `/dashboard` routes via Supabase session check.

### State and data flow

- **Cart state**: lives exclusively in `src/hooks/useCartStore.ts` (Zustand, persisted to `localStorage` under key `qr-order-cart`, scoped to `restaurantId` + `tableId`). Do not create another cart store.
- **Order creation**: canonical path is `POST /api/orders` with `client_request_id` for idempotency. `StickyCart` has an intentional Supabase direct fallback for compatibility — do not remove it.
- **Realtime + polling**: dashboard uses Supabase Realtime subscriptions (`src/hooks/useRealtime.ts`) for `orders`, `order_items`, and `invoices`. Customer invoice delivery uses 5-second polling. Both mechanisms are intentional — do not remove polling just because realtime exists.
- **Audit logging**: `src/utils/audit.ts` writes non-blocking fire-and-forget to the `audit_logs` table. Must never be made synchronous or await-blocking.

### Multi-tenancy and RBAC

- Restaurant isolation is enforced entirely through **Supabase RLS policies** (`database/rls_policies.sql`).
- `restaurants.owner_id` is the owner; `staff_members` table holds `owner`/`staff` roles.
- `src/utils/roles.ts` contains access control helpers. Do not introduce a parallel RBAC system.

### Customer order security

Customers do not have open RLS read access to `orders` or `order_items`. All customer-facing reads are gated through server endpoints that validate a `customerSessionId` or hashed table token:

- `GET /api/orders/[orderId]/status` — order tracking
- `GET /api/orders/bill` — bill summary modal
- `GET /api/orders/session` — full session view

Do not re-add `USING (true)` policies on `orders` or `order_items`.

### QR codes

Generated via `POST /api/qr/route.ts`. Both `qr_code` (text URL) and `qr_code_data_url` (PNG data URL) are stored directly on the `tables` row. Do not move QR storage to Supabase Storage.

### Order lifecycle

`pending → accepted → preparing → ready → completed` (or `→ cancelled`). Completing an order triggers invoice creation. Service requests live in the `service_requests` table; legacy zero-total orders also exist for compatibility — `src/utils/orders.ts` filters them from billable logic.

**Order status transitions**: Staff use `PATCH /api/orders/status` (`{ orderId, restaurantId, status }`). A server-enforced state machine in that route defines valid transitions — never update order status by writing directly to Supabase from client code.

**Order creation is atomic**: `createOrder.ts` calls the `create_order_with_items` Postgres function (`database/006_atomic_order_creation.sql`) via `supabaseAdmin.rpc()` instead of inserting `orders` then `order_items` as two separate calls — both inserts commit or roll back together. Do not revert this to two separate `.insert()` calls with manual cleanup.

**Rate limiting**: `POST /api/orders` (non-staff) and `POST /api/service-requests` are throttled per IP+table via the in-memory fixed-window limiter in `src/lib/rateLimit.ts` (`checkRateLimit`). It's per-instance, not distributed — fine at current scale; swap for Redis/Upstash if traffic grows enough for multi-instance bursts to matter.

**Item-level cancellation**: `order_items` has a `cancelled BOOLEAN NOT NULL DEFAULT false` column. A Postgres trigger (`calculate_order_total`) recalculates `orders.total_amount` automatically on every item update — do not recompute totals manually. If all items in an order are cancelled, the order status is auto-set to `cancelled`. Use `PATCH /api/orders` (`{ orderItemId, restaurantId }`) for staff-initiated item cancellation — this is the only path; do not cancel items by writing directly to Supabase from the client. If an unpaid invoice exists when an item is cancelled, the API recalculates and updates its subtotal/tax/grand_total. The `hasBillableItems` helper in `src/utils/orders.ts` accounts for cancelled items — use it before creating invoices.

**Item name + price snapshots**: `order_items` stores both `price_snapshot` and `item_name_snapshot` at order creation time. This preserves the full line item even if the menu item is later edited or deleted. `menu_item_id` is nullable (`ON DELETE SET NULL`). Display code must prefer `item.item_name_snapshot || item.menu_item?.name` — never rely solely on the joined `menu_item`. Always write `item_name_snapshot` when inserting order items (see `src/lib/orders/createOrder.ts`). Several components define local order item types — add `item_name_snapshot?: string | null` to any new local type.

**Service request filtering**: `isServiceRequestOrder` (in `src/utils/orders.ts`) detects legacy zero-total orders created for waiter/water/bill requests by matching `special_instructions`. Filter these out of any revenue, order-count, or analytics logic.

### Dashboard analytics

`src/components/dashboard/DashboardAnalytics.tsx` renders revenue, order counts, top-5 items, and a category revenue donut. It filters service-request orders and cancelled items from all metrics. Integrated into `DashboardOverview` behind an Orders / Analytics tab toggle. The revenue card uses `orders.total_amount` (DB-maintained); the donut/top-items derive revenue from `price_snapshot × quantity` on items — keep these in sync when changing how order totals are calculated.

### Inventory & expenses (Operations module)

Manual stock tracking and expense logging, added in `004_inventory_expenses.sql`. Lives under the dashboard "Operations" nav group (`/dashboard/inventory`, `/dashboard/expenses`).

- **Tables**: `inventory_items` (stock items), `stock_movements` (append-only ledger), `expenses`. `inventory_items.current_quantity` is a **cached projection maintained by the `update_inventory_quantity` trigger** off `stock_movements` — never write it from app code (same pattern as `orders.total_amount`). `recompute_all_inventory_quantities(restaurant_id)` rebuilds projections from the ledger if they ever drift.
- **Ledger is append-only**: corrections are new `adjustment` movements; stocktakes are `count` movements whose `quantity_delta` is `counted − current_quantity`, computed server-side in `/api/inventory/movements`. Do not add UPDATE paths for stock_movements.
- **Movement signing is server-owned**: clients send a positive magnitude plus `movement_type`; the API signs it (purchase `+`, usage/wastage `−`, adjustment signed, count computed). Do not write movements directly from the client.
- **Purchase → expense bridge**: a `purchase` movement with `createExpense: true` + `unit_cost` also inserts a linked `expenses` row (`source: 'inventory_purchase'`). This is **owner-gated inside the route** because expenses are owner-only — staff purchases still record stock but skip the expense.
- **RBAC**: inventory is staff-level (`is_restaurant_staff`); **expenses are owner-only** (`is_restaurant_owner` in RLS, `isOwner` in the API). The UI hides the Expenses nav item and gates the page for non-owners via `useRole` (`src/hooks/useRole.ts`) — but the server check is authoritative.
- **Money report**: the Expenses page computes Revenue (completed `orders.total_amount`, service-requests filtered) − Expenses = Net for today/week/month, reusing the analytics donut pattern.
- **Decoupled from orders**: inventory does not auto-deplete on order completion in V1 — this is intentional. Recipe links / auto-depletion are explicitly deferred.
- **Custom categories**: item categories are a per-restaurant extensible list — fixed defaults (`DEFAULT_INVENTORY_CATEGORIES` in `src/utils/inventory.ts`) plus custom ones stored in `inventory_categories` (005 migration). Picking "Other" on the Add Item form reveals a text input; the inventory API route (`resolveCategory`) canonicalises the name (case-insensitive against defaults then existing custom) and persists genuinely-new ones on item save. Do not reintroduce a hardcoded category enum in the page.
- **Archived items**: the inventory page has an Active/Archived view toggle. Archiving sets `is_active=false` (PATCH `/api/inventory`); Restore flips it back via the same PATCH. Stat cards / low-stock counts derive from active items only.
- **Page reads are direct client queries**: the Inventory and Expenses pages read their lists by querying Supabase directly from the client (RLS-gated), the same fast pattern as the orders page — NOT through the `/api/inventory` or `/api/expenses` GET routes (those still exist and back any server-side use). All mutations still go through the API routes. Expense row times use `created_at` via `formatTime` (the `expense_date` DATE column has no time-of-day and rendered shifted); expenses are grouped under Today/Yesterday/date headers by local-parsed `expense_date`.

### Database setup (fresh)

Run in order:

1. `database/schema.sql`
2. `database/rls_policies.sql`
3. `database/scalability.sql`
4. `database/add_modifiers.sql`
5. `database/001_order_item_cancellation.sql` (no-op on a fresh `schema.sql`, which already has the `cancelled` column + updated total function — safe to run)
6. `database/002_security_fixes.sql` (must run after `rls_policies.sql` and `add_modifiers.sql` — it rewrites those policies)
7. `database/003_item_name_snapshot.sql`
8. `database/fix_duplicate_invoices.sql` (adds the `UNIQUE(order_id)` constraint on `invoices` that the invoices API relies on for idempotency — **not** present in `schema.sql`)
9. `database/004_inventory_expenses.sql`
10. `database/005_inventory_categories.sql` (per-restaurant custom inventory categories — adds the `inventory_categories` table + case-insensitive unique index + staff RLS)
11. `database/006_atomic_order_creation.sql` (adds the `create_order_with_items` function that `src/lib/orders/createOrder.ts` calls via `.rpc()` so the order + order_items inserts commit/rollback together)

**Skip these for a fresh setup** — they are early migrations already consolidated into `schema.sql` (or unused): `audit_logs_v1.sql`, `safe_refactor_v1.sql`, `currency_defaults_v1.sql`, `add_waiter_request.sql` (the `'waiter'` service request is handled via the legacy order, not the `service_request_type` enum).

Enable Supabase Realtime on tables: `orders`, `order_items`, `invoices`, `service_requests`. (`schema.sql` sets `REPLICA IDENTITY FULL` on these but does not add them to the `supabase_realtime` publication — that is a dashboard/`ALTER PUBLICATION` step.) Do **not** add the inventory/expense tables to the realtime publication — those surfaces refetch on mutation by design.

### Menu caching

`src/lib/menuCache.ts` caches the public menu page's categories/items query (`getCachedMenu`) for 30 seconds, in-memory and per-restaurant — the menu page (`src/app/menu/[restaurantSlug]/page.tsx`) is the highest-traffic route since every table scan hits it. The dashboard menu editor (`src/app/(dashboard)/dashboard/menu/page.tsx`) calls `POST /api/menu/revalidate` (fire-and-forget, via `notifyMenuChanged`) after every category/item/modifier mutation to clear that restaurant's cache entry immediately rather than waiting out the TTL. If you add a new menu mutation path, call `notifyMenuChanged()` after it too.

### Security headers

`next.config.js` sets `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` on all routes via `headers()`. Do not move this logic into `middleware.ts` — middleware short-circuits before `/menu/`, `/api`, and `/` routes, so headers set there would miss the public menu page.

### Path aliases

`tsconfig.json` maps `@/*` → `src/*`, plus `@/components/*`, `@/lib/*`, `@/hooks/*`, `@/types/*`, `@/utils/*`.

## Required environment variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY     # server-only, never expose to browser
NEXT_PUBLIC_APP_URL           # base URL for QR links (Vercel also reads VERCEL_URL)
```

## Patterns to preserve

- Do not duplicate cart state, order creation APIs, or RBAC role models.
- Do not remove polling because realtime exists.
- Do not make audit logging block async operations.
- Do not drop compatibility columns (`notes`, legacy zero-total orders) without a phased migration.
- The `SUPABASE_SERVICE_ROLE_KEY` must never appear in browser-accessible code — use the admin client (`src/lib/supabase/admin.ts`) only in server routes/actions.
- Do not cancel order items by writing directly to Supabase from client code — always go through `PATCH /api/orders`.
- Do not update order status by writing directly to Supabase — always go through `PATCH /api/orders/status` so the state machine is enforced.
- Do not re-add open `USING (true)` RLS policies on `orders` or `order_items` — customer reads are gated through server endpoints.
- Always write `item_name_snapshot` when inserting order items. Display code must prefer the snapshot over the joined menu item name.
- When adding a new local type for order items in a component, always include `item_name_snapshot?: string | null`.
- Do not write `inventory_items.current_quantity` directly — it is maintained by the `stock_movements` trigger. Record a movement instead.
- Do not record stock movements or expenses by writing directly to Supabase from the client — always go through `/api/inventory/movements` and `/api/expenses`. Expenses are owner-only.

## Known debt

- `groupOrdersByTable` and `getTableStatus` are duplicated between `src/components/dashboard/DashboardOverview.tsx` and `src/app/(dashboard)/dashboard/orders/page.tsx` — should be extracted to a shared util.
- The "Total" label in `DashboardAnalytics` orders card counts only completed + cancelled orders, not in-flight ones — label should say "Resolved" to avoid confusion.
- `DashboardAnalytics.tsx`, `OrderNotifications.tsx`, and `CustomerActions.tsx` each define their own local order item types instead of importing `OrderItem` from `@/types` — these should be unified.
