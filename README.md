# Servaa

Servaa is a multi-tenant restaurant QR ordering platform. Customers scan a table QR code, browse the menu, place orders, track status, request service, and receive table invoices — all without an app. Staff use the dashboard to manage menus, tables, orders, invoices, payments, and settings.

## Stack

- **Next.js 15** App Router
- **React 18** + TypeScript
- **Tailwind CSS**
- **Supabase** — Postgres, Auth, Realtime, RLS
- **Zustand** — customer cart state
- **Recharts** — dashboard analytics
- `qrcode` — QR image generation

---

## Local Development

```bash
npm install
cp .env.local.example .env.local   # fill in Supabase credentials
npm run dev
```

Open `http://localhost:3000`.

```bash
npm run build     # production build (requires valid Supabase env vars)
npm run lint      # ESLint via next lint
npm run db:types  # regenerate src/types/supabase.ts from live schema
npm run db:migrate  # apply schema.sql to DATABASE_URL (fresh local DB only)
```

TypeScript check: `npx tsc --noEmit`

---

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-only, never expose to the browser
NEXT_PUBLIC_APP_URL=              # base URL for QR links
```

On Vercel, `VERCEL_URL` is also read by `src/utils/qr.ts` as a fallback.

---

## Database Setup

For a **fresh** Supabase project, run in this order in the SQL Editor:

1. `database/schema.sql`
2. `database/rls_policies.sql`
3. `database/scalability.sql`
4. `database/001_order_item_cancellation.sql`
5. `database/002_security_fixes.sql`
6. `database/003_item_name_snapshot.sql`
7. `database/004_inventory_expenses.sql`
8. `database/005_inventory_categories.sql`
9. `database/006_atomic_order_creation.sql` — adds the `create_order_with_items` function. **Order placement will fail with a 500 until this is applied**, since `src/lib/orders/createOrder.ts` calls it via `.rpc()`.

Then enable **Realtime** on tables: `orders`, `order_items`, `invoices`, `service_requests`.

> `schema.sql` uses plain `CREATE TABLE` — do not rerun it against an existing production database. Numbered migration files use `IF EXISTS` / `IF NOT EXISTS` and are safe to rerun.

For databases that predate the cleanup migrations, apply additive files as needed:

- `database/safe_refactor_v1.sql`
- `database/audit_logs_v1.sql`
- `database/currency_defaults_v1.sql`

---

## Product Surface

| Route | Who | Purpose |
|---|---|---|
| `/` | Public | Landing page |
| `/login`, `/register` | Public | Auth |
| `/dashboard` | Staff/Owner | Overview, analytics |
| `/dashboard/orders` | Staff/Owner | Live order management |
| `/dashboard/menu` | Staff/Owner | Menu categories and items |
| `/dashboard/tables` | Staff/Owner | Table and QR management |
| `/dashboard/billing` | Staff/Owner | Invoices and payments |
| `/dashboard/settings` | Owner | Restaurant profile, tax, currency |
| `/menu/[restaurantSlug]` | Customer | QR menu, cart, order tracking, service requests |

### API Routes

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/orders` | POST | Place an order |
| `/api/orders` | PATCH | Staff: cancel an order item |
| `/api/orders/status` | PATCH | Staff: advance order status (state-machine enforced) |
| `/api/orders/bill` | GET | Customer: fetch unpaid orders for bill summary |
| `/api/orders/[orderId]/status` | GET | Customer: poll a single order's status |
| `/api/orders/session` | GET | Customer: fetch full order session |
| `/api/invoices` | GET/POST/PATCH | Invoice CRUD |
| `/api/invoices/send` | POST | Push invoice to customer table |
| `/api/invoices/table` | GET/PATCH | Customer invoice delivery and acknowledgement |
| `/api/qr` | POST | Generate QR code for a table |
| `/api/auth/callback` | GET | Supabase auth callback |
| `/api/service-requests` | POST | Customer: request water, waiter, or bill |
| `/api/menu/revalidate` | POST | Staff/owner: clear the cached public menu for a restaurant |

---

## Core Systems

### Multi-Tenancy and RBAC

- `restaurants.owner_id` is the owning Supabase auth user.
- `staff_members` controls dashboard access with roles `owner` and `staff`.
- Restaurant isolation is enforced entirely through Supabase RLS (`database/rls_policies.sql`).
- App-side access checks use `src/utils/roles.ts`. Do not introduce a parallel RBAC system.

### Customer Order Security

Customers do not have open RLS read access to `orders` or `order_items`. All customer-facing reads are gated through server endpoints that validate a `customerSessionId` or hashed table token:

- `GET /api/orders/[orderId]/status` — order tracking
- `GET /api/orders/bill` — bill summary modal
- `GET /api/orders/session` — full session view

Do not re-add `USING (true)` policies on `orders` or `order_items`.

### QR Ordering

Tables are managed in `/dashboard/tables`. QR generation: `src/app/api/qr/route.ts`, `src/utils/qr.ts`, `src/utils/tableSession.ts`. QR codes are stored as data URLs directly on the `tables` row (`qr_code`, `qr_code_data_url`, `qr_url`, `qr_token_hash`). Do not move QR storage to Supabase Storage.

### Customer Cart

Cart state lives exclusively in `src/hooks/useCartStore.ts` (Zustand, persisted to `localStorage` as `qr-order-cart`, scoped to `restaurantId` + `tableId`). Do not create another cart store.

### Order Creation

Canonical path: `POST /api/orders` with `client_request_id` for idempotency. The route validates the table, menu items, modifiers, and token before inserting. `StickyCart` has an intentional Supabase direct fallback — do not remove it until the API path is proven reliable in production.

The order + its items are written atomically: `createOrder.ts` calls the `create_order_with_items` Postgres function (`database/006_atomic_order_creation.sql`) via `.rpc()` so both inserts commit or roll back together — there is no manual cleanup path for a partially-created order.

### Rate Limiting

`POST /api/orders` (customer orders) and `POST /api/service-requests` are throttled per IP+table by the in-memory fixed-window limiter in `src/lib/rateLimit.ts`. It's per-instance, not distributed — sufficient at current scale; move to Redis/Upstash if traffic grows enough for multi-instance bursts to matter.

### Security Headers

`next.config.js` sets `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` on every route via `headers()`. This is intentionally in `next.config.js` rather than `middleware.ts`, since middleware short-circuits before `/menu/`, `/api`, and `/` routes.

### Menu Caching

`src/lib/menuCache.ts` caches the public menu page's categories/items query per restaurant for 30 seconds — it's the highest-traffic route since every table scan hits it. The dashboard menu editor calls `POST /api/menu/revalidate` after every save/delete so edits appear immediately instead of waiting out the cache.

### Order Lifecycle

```
pending → accepted → preparing → ready → completed
pending → cancelled (any non-terminal state)
```

Status transitions are enforced server-side in `PATCH /api/orders/status` via an explicit state machine. Do not update order status by writing directly to Supabase from client code or from a route that bypasses the transition check.

### Item Name and Price Snapshots

`order_items` stores both `price_snapshot` and `item_name_snapshot` at order creation time. This preserves the full line item even if the menu item is later edited or deleted. `menu_item_id` is nullable (`ON DELETE SET NULL`) for the same reason. Display code must prefer `item.item_name_snapshot || item.menu_item?.name` — never rely solely on the joined `menu_item`.

### Item-Level Cancellation

`order_items.cancelled` (boolean) marks cancelled items. A Postgres trigger recalculates `orders.total_amount` automatically on every item change — do not recompute totals manually. Use `PATCH /api/orders` (`{ orderItemId, restaurantId }`) for staff-initiated item cancellation — this is the only valid path.

### Service Requests

Customers can request water, a waiter, or the bill from `src/components/menu/CustomerActions.tsx`. Each request writes both a `service_requests` row and a legacy zero-total `orders` row (with `special_instructions: "REQUEST: ..."`) so service requests appear in existing dashboard notification flows. Helpers in `src/utils/orders.ts` filter these from billable logic. Do not remove the legacy order bridge until the dashboard directly manages `service_requests`.

### Invoices and Billing

Invoice generation is triggered when an order is completed. Billing UI: `src/app/(dashboard)/dashboard/billing/page.tsx`, `src/components/billing/InvoiceDetail.tsx`. Invoice APIs: `src/app/api/invoices/`. Invoice delivery uses `sent_to_table_at` / `acknowledged_by_table_at` timestamps plus `notes` compatibility values — do not drop the `notes` fallback until existing clients no longer read it.

### Realtime and Polling

`src/hooks/useRealtime.ts` manages all subscriptions. Both realtime and polling are intentional:

- Dashboard subscribes to `orders`, `order_items`, and `invoices` via Supabase Realtime.
- Polling is the fallback when realtime is degraded.
- Customer table invoice modal polls `/api/invoices/table` every 5 seconds.

Do not remove polling just because realtime exists.

### Audit Logging

`src/utils/audit.ts` writes fire-and-forget to the `audit_logs` table. Must never be made synchronous or awaited in the request path.

---

## Project Structure

```
src/
  app/
    (auth)/                   login / register
    (dashboard)/              protected dashboard layout and pages
    api/                      all route handlers
    menu/[restaurantSlug]/    customer-facing QR menu
  components/
    auth/                     login/register forms
    billing/                  invoice detail UI
    dashboard/                overview, analytics, notifications, sidebar
    menu/                     customer menu, cart, order tracker, service actions, table invoice
    orders/                   order cards (staff view)
    tables/                   QR display
    ui/                       shared primitives (Button, Modal, Badge, etc.)
  hooks/
    useCartStore.ts           Zustand cart (single source of truth)
    useRealtime.ts            realtime subscriptions and debounced refresh
    useRestaurant.ts          client-side restaurant resolver
  lib/supabase/
    admin.ts                  service-role client — server routes only
    client.ts                 browser singleton
    server.ts                 server component / route handler client
  types/
    database.ts               hand-maintained Supabase table types
    index.ts                  app-level domain types (OrderItem, Invoice, etc.)
  utils/
    audit.ts                  non-blocking audit writes
    format.ts                 currency, date, slug helpers
    orders.ts                 billable order helpers, service-request detection
    qr.ts                     QR URL and data URL generation
    roles.ts                  staff / owner access helpers
    tableSession.ts           QR token hashing and validation
    validation.ts             shared input sanitization
database/
  schema.sql                  full schema (fresh installs only)
  rls_policies.sql            RLS policies and helper functions
  scalability.sql             indexes and dashboard stats RPC
  001_order_item_cancellation.sql
  002_security_fixes.sql      RLS tightening: customer reads, insert scoping, modifier policies
  003_item_name_snapshot.sql  item_name_snapshot column + FK cascade fix
  004_inventory_expenses.sql
  005_inventory_categories.sql
  006_atomic_order_creation.sql  create_order_with_items RPC for atomic order writes
```

---

## CI

`.github/workflows/ci.yml` runs `npm run lint` and `npx tsc --noEmit` on every PR and push to `main`. There is no automated test runner configured.

---

## Deployment

Target: **Vercel + Supabase**.

Set in Vercel environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
```

Configure the deployed site URL in Supabase Auth settings so email confirmation and OAuth callbacks redirect correctly.

After deploying new database migrations, run the numbered SQL files in the Supabase SQL Editor in order before or immediately after the deployment.

---

## Manual Smoke Test

After changes touching core flows:

1. Register or log in as a restaurant owner.
2. Confirm `/dashboard` loads.
3. Create or edit a menu category and item.
4. Create a table and generate its QR code.
5. Open the QR menu URL in an incognito window.
6. Add items to cart and place an order.
7. Confirm dashboard notification appears and order list updates.
8. Accept → Preparing → Ready → Complete the order.
9. Confirm invoice is created.
10. Send invoice to table; confirm table invoice modal appears.
11. Mark invoice paid.
12. Request water and bill from the customer menu; confirm service request appears on dashboard.
