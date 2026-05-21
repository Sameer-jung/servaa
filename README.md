# Servaa

Servaa is a multi-tenant restaurant QR ordering application. Customers scan a table QR code, browse the restaurant menu, place orders, track order status, request service, and receive table invoices. Staff use the dashboard to manage menu items, tables, orders, invoices, payments, and restaurant settings.

This repository is optimized for direct production maintenance. Keep changes small, verify behavior against the active flows, and avoid speculative abstractions.

## Stack

- Next.js 15 App Router
- React 18
- TypeScript
- Tailwind CSS
- Supabase Postgres, Auth, Realtime, RLS
- Zustand for customer cart state
- `qrcode` for QR image generation

## Active Product Surface

- Public landing page: `/`
- Auth routes: `/login`, `/register`
- Protected staff dashboard: `/dashboard`
- Dashboard sections:
  - `/dashboard/orders`
  - `/dashboard/menu`
  - `/dashboard/tables`
  - `/dashboard/billing`
  - `/dashboard/settings`
- Customer menu route: `/menu/[restaurantSlug]?table=[tableNumber]&t=[tableToken]`
- API routes:
  - `POST /api/orders`
  - `POST /api/qr`
  - `GET|POST|PATCH /api/invoices`
  - `POST /api/invoices/send`
  - `GET|PATCH /api/invoices/table`
  - `GET /api/auth/callback`

## Core Systems

### Multi-Tenancy And Access

Restaurant isolation is enforced by Supabase RLS and staff membership.

- `restaurants.owner_id` records the owning Supabase auth user.
- `staff_members` is the dashboard access table.
- Owners are also inserted into `staff_members` with role `owner`.
- Staff access checks in app code should use `src/utils/roles.ts`.
- Dashboard pages resolve the current restaurant through `staff_members`, then fall back to owned restaurants.

Do not add a second RBAC system. Preserve the current `owner` / `staff` model unless the database policies, app checks, and dashboard UX are changed together.

### QR Ordering

Tables are managed in `/dashboard/tables`.

QR generation is handled by:

- `src/app/api/qr/route.ts`
- `src/utils/qr.ts`
- `src/utils/tableSession.ts`
- `src/components/tables/QRCodeDisplay.tsx`

QR codes are stored as data URLs on the `tables` row. The app currently writes both `qr_code` and `qr_code_data_url` for compatibility, plus `qr_url`, `qr_token_hash`, and `qr_token_created_at`.

Do not reintroduce a Supabase Storage bucket for QR codes. The active code does not use one.

### Customer Cart

Customer cart state lives only in `src/hooks/useCartStore.ts`.

- Zustand persists cart data under `qr-order-cart`.
- Cart state is scoped to `restaurantId` and `tableId`.
- Switching restaurant/table clears cart contents.

Do not create another cart store or duplicate cart state in page-level components. Components should call `useCartStore()`.

### Order Creation

Canonical order creation is `POST /api/orders`.

That route:

- validates restaurant/table UUIDs
- validates order items
- optionally validates table token
- checks table activity
- checks menu item availability
- applies `client_request_id` idempotency
- inserts `orders` and `order_items`
- writes audit logs non-blockingly

`src/components/menu/StickyCart.tsx` still has a direct client Supabase fallback for order creation. Keep this fallback until the API path and token rollout are proven reliable in production.

Do not add another order creation path. If order placement changes, update `/api/orders` first and keep the fallback compatible.

### Order Lifecycle

Order status values:

```text
pending -> accepted -> preparing -> ready -> completed
pending -> cancelled
```

Staff order management lives in:

- `src/app/(dashboard)/dashboard/orders/page.tsx`
- `src/components/orders/OrderCard.tsx`
- `src/hooks/useRealtime.ts`

Completing an order triggers invoice creation through `POST /api/invoices`.

Do not bypass the status flow in UI code. If a new status is added, update database enum/type definitions, UI badges, order cards, trackers, and invoice rules together.

### Service Requests

Customers can request water or the bill from `src/components/menu/CustomerActions.tsx`.

The active transitional model writes:

- a first-class `service_requests` row
- a legacy zero-total `orders` row with `special_instructions` of `REQUEST: Water` or `REQUEST: Bill`

The legacy order keeps service requests visible in existing order notifications/dashboard flows. Helpers in `src/utils/orders.ts` identify and filter these rows from billable order logic.

Do not remove the legacy request order bridge until the dashboard directly renders and manages `service_requests`.

### Invoices And Billing

Billing UI lives in:

- `src/app/(dashboard)/dashboard/billing/page.tsx`
- `src/components/billing/InvoiceDetail.tsx`

Invoice APIs live in:

- `src/app/api/invoices/route.ts`
- `src/app/api/invoices/send/route.ts`
- `src/app/api/invoices/table/route.ts`

Invoices are generated for billable completed orders. Service request orders are not billable.

Invoice delivery to the table currently uses:

- `sent_to_table_at`
- `acknowledged_by_table_at`
- compatibility values in `invoices.notes`

The timestamp columns are the canonical direction, but the `notes` compatibility values are still read/written. Do not remove the notes fallback until existing invoice data and clients no longer need it.

### Realtime And Polling

Realtime hooks live in `src/hooks/useRealtime.ts`.

Current synchronization behavior:

- Orders dashboard uses restaurant-scoped order realtime and targeted refetches.
- Dashboard overview uses order realtime, an `order_items` realtime refresh, and polling only when realtime is not subscribed.
- Billing uses invoice realtime plus fallback polling.
- Customer order tracker subscribes to a single order.
- Customer table invoice modal polls `/api/invoices/table` every 5 seconds.
- Staff notifications subscribe to order inserts and retry fetching items because `order_items` may arrive after the order row.

Do not blindly remove polling. Polling is an operational fallback, especially for customer invoice delivery and degraded realtime connections.

### Audit Logs

Audit logging lives in:

- `src/utils/audit.ts`
- `audit_logs` table

Audit writes must never block customer or staff operations. `writeAuditLog` intentionally swallows failures.

Do not make audit logging part of the critical transaction path unless the product requirement changes.

## Ownership Boundaries

| Area | Owns | Key Files |
| --- | --- | --- |
| Routing and server rendering | Next App Router | `src/app` |
| Supabase clients | Browser/server/admin client creation | `src/lib/supabase` |
| Auth and dashboard protection | Middleware, auth pages, Supabase Auth | `src/middleware.ts`, `src/app/(auth)` |
| Customer menu | Menu route and menu components | `src/app/menu/[restaurantSlug]`, `src/components/menu` |
| Cart | Zustand store only | `src/hooks/useCartStore.ts` |
| Realtime | Shared order/status hooks | `src/hooks/useRealtime.ts` |
| Restaurant lookup | Dashboard client hook and server fallback | `src/hooks/useRestaurant.ts`, dashboard page |
| API validation | Route-local validation plus shared helpers | `src/utils/validation.ts` |
| RBAC helpers | App-side restaurant access checks | `src/utils/roles.ts` |
| Formatting | Currency/date/slug helpers | `src/utils/format.ts` |
| Database schema and policies | SQL files | `database` |

## Project Structure

```text
src/
  app/
    (auth)/                  login/register routes
    (dashboard)/             protected dashboard routes
    api/                     route handlers
    menu/[restaurantSlug]/   customer-facing menu
  components/
    auth/                    auth forms/buttons
    billing/                 invoice modal/detail UI
    dashboard/               dashboard layout and overview
    menu/                    customer menu/cart/service/invoice UI
    orders/                  order cards
    tables/                  QR display UI
    ui/                      local UI primitives
  hooks/
    useCartStore.ts          Zustand cart store
    useRealtime.ts           realtime subscriptions/debounce
    useRestaurant.ts         client restaurant resolver
  lib/supabase/
    admin.ts                 service-role client for trusted APIs
    client.ts                browser client singleton
    server.ts                server component/route client
  types/
    database.ts              hand-maintained database types
    index.ts                 app-level domain types
  utils/
    audit.ts                 non-blocking audit writes
    format.ts                formatting and slug helpers
    orders.ts                service-request/billable order helpers
    qr.ts                    QR URL/data URL helpers
    roles.ts                 staff/owner access helpers
    tableSession.ts          QR token helpers
    validation.ts            shared input validation
database/
  schema.sql                 fresh schema snapshot
  rls_policies.sql           RLS policies and helper functions
  scalability.sql            active indexes and dashboard stats RPC
  safe_refactor_v1.sql       additive compatibility migration
  audit_logs_v1.sql          additive audit log migration
  currency_defaults_v1.sql   additive currency default migration
```

## Environment Variables

Required by application code:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Used by package scripts:

```env
DATABASE_URL=postgresql://...
SUPABASE_PROJECT_ID=your-project-ref
```

Notes:

- `NEXT_PUBLIC_APP_URL` is used as the fallback base URL for QR links.
- On Vercel, `VERCEL_URL` is also recognized by `src/utils/qr.ts`.
- `.env.local.example` includes `NEXT_PUBLIC_SUPABASE_STORAGE_URL`, but the current app code does not read it.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser code.

## Local Development

Install dependencies:

```bash
npm install
```

Copy environment file:

```bash
cp .env.local.example .env.local
```

Run the dev server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Database Setup

For a fresh Supabase project, run these SQL files in the Supabase SQL editor in this order:

1. `database/schema.sql`
2. `database/rls_policies.sql`
3. `database/scalability.sql`

For an older database that predates the cleanup/refactor migrations, apply additive migrations as needed:

1. `database/safe_refactor_v1.sql`
2. `database/audit_logs_v1.sql`
3. `database/currency_defaults_v1.sql`
4. `database/scalability.sql`

Important:

- `database/schema.sql` is a fresh schema snapshot and is not safe to rerun blindly against production because it uses plain `CREATE TABLE` / `CREATE TYPE`.
- Additive migration files use `IF EXISTS` / `IF NOT EXISTS` patterns where practical.
- Do not drop production columns, tables, policies, triggers, or enum values as cleanup without a phased migration and rollback plan.

The `db:migrate` script exists, but it only runs `database/schema.sql`:

```bash
npm run db:migrate
```

Use it only for fresh local databases where `DATABASE_URL` is set.

## Supabase Realtime

Enable Realtime publication for:

- `orders`
- `order_items`
- `invoices`

`service_requests` also has `REPLICA IDENTITY FULL` in the schema, but the current UI does not directly subscribe to it. Service requests are still surfaced through legacy order rows.

## Commands

```bash
npm run dev       # Start local Next.js dev server
npm run build     # Production build
npm run start     # Start built app
npm run lint      # Runs next lint; prompts until ESLint config exists
npm run db:migrate
npm run db:types
```

Current verification notes:

- `npx tsc --noEmit` is the reliable TypeScript check.
- `npm run lint` is a valid script, but this repo currently has no ESLint config, so Next.js prompts interactively before linting.
- `npm run build` requires valid Supabase environment variables.



------------------------------------------------------------------------------------------------------------------------------------

## Made this if we use AI agents in future

## AI Development Rules

Use this section as the default operating contract for future AI-assisted changes.

### Preserve Active Flows

Do not break:

- QR menu loading
- table-scoped ordering
- cart persistence/scoping
- staff dashboard auth
- restaurant isolation
- menu CRUD
- order lifecycle
- invoice creation and payment updates
- table invoice delivery
- service requests
- audit logging
- realtime dashboard updates

### Preferred Patterns

- Use existing Supabase client factories in `src/lib/supabase`.
- Use `POST /api/orders` as the canonical order creation path.
- Use `src/utils/roles.ts` for staff/restaurant access checks in APIs.
- Use `src/utils/validation.ts` for shared primitive validation.
- Keep customer cart state in `useCartStore`.
- Keep audit writes non-blocking.
- Prefer route-local logic over broad framework abstractions for small API handlers.
- Prefer additive migrations over destructive DB edits.
- Preserve RLS behavior unless the security model is being intentionally redesigned.

### Anti-Patterns

Do not:

- create another cart store
- create another order creation API
- bypass `/api/orders` with a new direct insert path
- remove polling just because realtime exists
- duplicate RBAC role models
- add speculative staff roles beyond `owner` and `staff`
- move QR image storage to Supabase Storage
- make audit logging block operational writes
- drop transitional columns or compatibility writes in the same change that stops reading them
- regenerate the entire database schema as a migration
- rewrite RLS policies broadly for a narrow feature

### Compatibility Logic To Treat Carefully

- `StickyCart` direct Supabase fallback is intentional.
- `service_requests` plus legacy request orders are both intentional.
- Invoice timestamp fields plus `notes` compatibility values are both intentional.
- `qr_code` plus `qr_code_data_url` are both currently written.
- Dashboard fallback polling is intentional.
- Customer table invoice polling is intentional.

When simplifying these systems, first document the current production dependency, then migrate in phases.

## Manual Smoke Test

After changes touching core flows:

1. Register or log in as a restaurant owner.
2. Confirm `/dashboard` loads.
3. Create or edit a menu category/item.
4. Create a table and generate QR.
5. Open the QR menu URL.
6. Place an order.
7. Confirm dashboard notification and order list update.
8. Accept, prepare, ready, and complete the order.
9. Confirm invoice creation.
10. Send invoice to table.
11. Confirm table invoice modal appears and can be acknowledged.
12. Mark invoice paid.
13. Request water and bill from the customer menu.

## Deployment

Typical deployment target is Vercel plus Supabase.

Set these variables in Vercel:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
```

Supabase Auth should have the deployed site URL configured so email confirmation/callback redirects can return to the app.

## License

yeha samma aaiyo vanesi
