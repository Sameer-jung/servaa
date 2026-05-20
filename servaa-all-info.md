# Servaa Full Codebase Analysis

## 1. Tech Stack Overview

### Core Platform
- **Framework:** Next.js 15 (App Router) (`package.json`, `src/app/**`)
- **Language:** TypeScript (`tsconfig.json`)
- **Frontend:** React 18 + Tailwind CSS (`package.json`, `tailwind.config.ts`)
- **Backend API:** Next.js Route Handlers (`src/app/api/**/route.ts`)
- **Database/Auth/Realtime:** Supabase (PostgreSQL + Auth + Realtime) (`src/lib/supabase/*`, SQL in `database/*`)
- **State management:** Local React state + Zustand persisted cart store (`src/hooks/useCartStore.ts`)

### Major Libraries
- `@supabase/ssr`, `@supabase/supabase-js` for auth/session + DB access
- `zustand` for persisted client cart state
- `react-hot-toast` for dashboard notifications
- `qrcode` for server-side QR generation
- `clsx` + `tailwind-merge` for utility styling composition

### Runtime Configuration
Environment variables used (`.env.local.example`, `src/lib/supabase/*`, `src/utils/qr.ts`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- fallback `VERCEL_URL` for base URL generation

## 2. System Architecture

### High-Level Architecture
- **Single Next.js monorepo-style app** with App Router.
- **Server Components** fetch initial data on protected/public pages.
- **Client Components** handle dashboard interactions, CRUD, and real-time updates.
- **Route Handlers** provide controlled backend operations for QR generation and billing/invoice workflows.
- **Supabase** is both persistence and auth/session backend.

### Module Communication
- UI pages call Supabase directly (via browser client) for most CRUD.
- Sensitive billing logic uses API routes + `supabaseAdmin` service role (server only).
- Client pages subscribe to Supabase `postgres_changes` channels for live updates.
- Customer table invoice modal uses polling endpoint (`/api/invoices/table`) every 5 seconds.

### Directory Structure (functional)
- `src/app/(auth)` → login/register
- `src/app/(dashboard)` → admin/operator dashboard modules
- `src/app/menu/[restaurantSlug]` → customer menu/order experience
- `src/app/api` → auth callback, QR, invoice endpoints
- `src/components` → domain UI (dashboard/orders/menu/billing/auth)
- `src/hooks` → auth, restaurant context, realtime, cart store
- `database` → schema, RLS policies, scalability indexes/RPC

## 3. Admin Features

Admin-side means authenticated owner/staff flows under `/dashboard`:

### Dashboard Overview
- **What it does:** Shows active orders/tables, pending count, today sales, recent table summaries.
- **Pages/components:** `src/app/(dashboard)/dashboard/page.tsx`, `src/components/dashboard/DashboardOverview.tsx`
- **APIs/DB:** Supabase RPC `get_dashboard_stats` + `orders`, `order_items`, `tables`
- **Important logic:** Excludes service-request-only orders (`isServiceRequestOrder`) from food history; paginated recent/table history.

### Order Management
- **What it does:** View grouped table orders; accept/reject/progress status; auto-generate invoice on completion.
- **Pages/components:** `src/app/(dashboard)/dashboard/orders/page.tsx`, `src/components/orders/OrderCard.tsx`
- **APIs:** Direct `orders` updates + `POST /api/invoices` on `completed`
- **DB:** `orders`, `order_items`, `menu_items`, `tables`, `invoices`
- **Important logic:** Optimistic status updates with fallback refetch; realtime subscription keeps list synced.

### Menu Management
- **What it does:** CRUD categories and menu items, toggle availability, assign category, image URL.
- **Pages/components:** `src/app/(dashboard)/dashboard/menu/page.tsx`
- **DB:** `menu_categories`, `menu_items`
- **Important logic:** Category deletion leaves items uncategorized via DB FK `ON DELETE SET NULL`.

### Table Management + QR
- **What it does:** Create/delete tables, generate/store QR as data URL, download/print QR card.
- **Pages/components:** `src/app/(dashboard)/dashboard/tables/page.tsx`, `src/components/tables/QRCodeDisplay.tsx`
- **APIs:** `POST /api/qr`
- **DB:** `tables`, `restaurants`
- **Important logic:** QR URL = `/menu/{slug}?table={tableNumber}`; stored in `tables.qr_code` text column.

### Billing & Invoice Operations
- **What it does:** View unpaid/paid invoice groups by table; mark paid; send invoice to table modal.
- **Pages/components:** `src/app/(dashboard)/dashboard/billing/page.tsx`, `InvoiceDetail`
- **APIs:** `GET/POST/PATCH /api/invoices`, `POST /api/invoices/send`
- **DB:** `invoices`, `orders`, `order_items`, `restaurants`, `tables`
- **Important logic:**
  - `GET /api/invoices` reconciles missing invoices for completed orders before returning data.
  - Payment update sets `paid_at` when paid.
  - “Send to table” uses invoice `notes='sent_to_table'` flag.

### Restaurant Settings
- **What it does:** Update restaurant name/address/phone/tax rate and display shareable menu URL.
- **Pages/components:** `src/app/(dashboard)/dashboard/settings/page.tsx`
- **DB:** `restaurants`

### Real-time Admin Notification Center
- **What it does:** Toast popups + sound on incoming orders/service requests.
- **Component:** `src/components/dashboard/OrderNotifications.tsx`
- **DB/Realtime:** `orders` insert events, then fetch enriched order data (`table`, `items`, `menu_item`)

## 4. Client Features

Client-side means public customer flow in `/menu/[restaurantSlug]`:

### Menu Browsing
- Load active restaurant by slug and optional table by `?table=` query.
- Display categories and menu items; filter by active category.
- Files: `src/app/menu/[restaurantSlug]/page.tsx`, `MenuClient.tsx`, `MenuItemCard.tsx`, `CategoryTabs.tsx`

### Cart & Ordering
- Persistent cart via Zustand (`qr-order-cart`) keyed to restaurant+table context.
- Add/remove items, quantity adjustment, item notes, computed totals.
- Place order inserts into `orders`, then `order_items`.
- Files: `src/hooks/useCartStore.ts`, `StickyCart.tsx`

### Live Order Tracking
- If active order exists, status tracker subscribes to order row updates.
- Step-based status UI (pending → accepted → preparing → ready → completed).
- Files: `OrderTracker.tsx`, `useOrderStatus` in `useRealtime.ts`

### Customer Service Actions
- Request water/bill by inserting zero-amount `orders` rows with `special_instructions='REQUEST: ...'`.
- Bill request is blocked if table has no prior food orders.
- File: `CustomerActions.tsx`

### Table Invoice Handling
- Polls `/api/invoices/table` every 5s to detect sent unpaid invoice.
- Displays invoice modal; “Got it” marks invoice note as `acknowledged_by_table`.
- File/API: `TableInvoice.tsx`, `/api/invoices/table`

### Mobile Behavior
- Customer layout is mobile-first: sticky header, bottom fixed cart/actions, full-screen invoice modal.

## 5. Database Structure

Source of truth: `database/schema.sql` (+ indexes/RPC additions in `database/scalability.sql`).

### `restaurants`
- **Purpose:** Tenant-like restaurant root entity.
- **Key columns:** `id`, `name`, `slug (unique)`, `owner_id -> auth.users`, `tax_rate`, `currency`, `is_active`, timestamps.
- **Indexes:** `owner_id`, `slug`.
- **Used by:** registration/setup, auth ownership checks, settings, menu public lookup, billing tax lookup.

### `tables`
- **Purpose:** Physical table metadata + QR payload.
- **Key columns:** `restaurant_id -> restaurants`, `table_number`, `qr_code`, `is_active`.
- **Constraints:** unique `(restaurant_id, table_number)`.
- **Indexes:** `restaurant_id`.
- **Used by:** table management, customer table context resolution, order linkage.

### `menu_categories`
- **Purpose:** Restaurant menu grouping.
- **Key columns:** `restaurant_id`, `name`, `sort_order`.
- **Indexes:** `restaurant_id`.
- **Used by:** admin menu management and customer menu navigation.

### `menu_items`
- **Purpose:** Orderable products.
- **Key columns:** `restaurant_id`, `category_id (nullable FK, ON DELETE SET NULL)`, `name`, `description`, `image_url`, `price`, `available`, `sort_order`, timestamps.
- **Indexes:** `restaurant_id`, `category_id`, `available`.
- **Used by:** menu CRUD, customer ordering, order item joins.

### `orders`
- **Purpose:** Order headers and service requests.
- **Key columns:** `restaurant_id`, `table_id`, `status` enum, `total_amount`, `special_instructions`, customer fields, timestamps.
- **Status enum:** `pending | accepted | preparing | ready | completed | cancelled`.
- **Indexes:** basic + composite scalability indexes (restaurant/status/date/table).
- **Used by:** dashboard, kitchen flow, service requests, billing invoice generation.

### `order_items`
- **Purpose:** Order line items with price snapshots.
- **Key columns:** `order_id`, `menu_item_id`, `quantity`, `price_snapshot`, `notes`.
- **Indexes:** `order_id`, plus `(order_id, menu_item_id)` scalability index.
- **Used by:** cart checkout, order display, invoice detail rendering.

### `invoices`
- **Purpose:** Billing records per order.
- **Key columns:** `restaurant_id`, `order_id`, `invoice_number`, `subtotal`, `tax_amount`, `grand_total`, `payment_status` enum, `payment_method`, `notes`, `paid_at`, `created_at`.
- **Payment enum:** `unpaid | paid | refunded`.
- **Constraints:** unique `(restaurant_id, invoice_number)`.
- **Indexes:** base + scalability composites on restaurant/payment/date/order.
- **Used by:** billing dashboard, customer table invoice modal, payment updates.

### `staff_members`
- **Purpose:** Restaurant staff/owner membership for access control.
- **Key columns:** `restaurant_id`, `user_id`, `role` check (`owner|staff`), `is_active`.
- **Constraints:** unique `(restaurant_id, user_id)`.
- **Indexes:** `restaurant_id`, `user_id`.
- **Used by:** restaurant resolution and authorization checks.

### DB Functions/Triggers
- Auto `updated_at` triggers on `restaurants`, `menu_items`, `orders`.
- `calculate_order_total` + trigger updates `orders.total_amount` from `order_items`.
- `generate_invoice_number` trigger exists in schema, but app route also generates invoice number in code.
- `get_dashboard_stats` RPC (in `scalability.sql`) powers dashboard summary counts/sums.

## 6. Authentication & Permissions

### Authentication
- Supabase email/password auth (`LoginForm`, `RegisterForm`).
- SSR auth session handling via `@supabase/ssr` cookie-aware clients (`src/lib/supabase/server.ts`, `middleware.ts`).
- OAuth/code flow support endpoint exists: `/api/auth/callback`.

### Route Protection
- Middleware allows public routes (`/`, `/menu/*`, `/_next`, `/api`) and redirects unauthenticated `/dashboard*` to `/login`.

### Authorization Model
- App-level role model: owner/staff per restaurant via `staff_members`.
- API authorization checks verify owner or active staff membership (`verifyRestaurantAccess` in invoice routes).
- DB-level RLS policies enforce row access patterns for public/staff/owner operations.

### Notable Permission Behaviors
- Public insert/select allowed on `orders` and `order_items` for customer ordering/tracking.
- Public select allowed on `tables`, `menu_categories`, `menu_items`, active restaurants.
- Billing routes use `supabaseAdmin` but perform explicit user access checks first.

## 7. API Structure

Route handlers under `src/app/api`:

### `GET /api/auth/callback`
- Exchanges code for Supabase session and redirects to `next` (default `/dashboard`).

### `POST /api/qr`
- Validates payload (`tableId`, `restaurantSlug`, `tableNumber`), requires authenticated user.
- Generates QR data URL and stores in `tables.qr_code`.

### `GET /api/invoices`
- Auth required, restaurant access required.
- Inputs: `restaurantId`, optional `paymentStatus`, `page`, `pageSize`.
- Reconciles missing completed-order invoices before returning paginated invoices.

### `POST /api/invoices`
- Auth required, restaurant access required.
- Inputs: `orderId`, `restaurantId`.
- Creates invoice if order is billable and not already invoiced.

### `PATCH /api/invoices`
- Auth required.
- Inputs: `invoiceId`, `payment_status`.
- Access check by invoice’s restaurant, updates payment state and `paid_at`.

### `POST /api/invoices/send`
- Auth required, restaurant access required.
- Inputs: `invoiceId`.
- Marks invoice `notes='sent_to_table'`.

### `GET /api/invoices/table`
- Public table endpoint.
- Input: `tableId`.
- Finds latest unpaid sent invoice for that table from recent orders.

### `PATCH /api/invoices/table`
- Public table endpoint.
- Inputs: `invoiceId`, `tableId`.
- Verifies invoice belongs to table, updates notes to `acknowledged_by_table`.

### Validation/Error Pattern
- Manual validation with explicit 400/401/403/404/500 JSON responses.
- No centralized validation schema library.

## 8. Real-Time Systems

### Implemented Real-time Mechanisms
- **Supabase Realtime (`postgres_changes`)** for:
  - orders list and status updates (`useRealtimeOrders`, `useOrderStatus`)
  - dashboard order notifications (`OrderNotifications`)
  - billing invoice refresh (`billing page`)
  - dashboard overview refresh on order changes
- **Polling** for customer invoice delivery (`TableInvoice`, every 5s).
- **Periodic polling/refresh** in dashboard overview (`setInterval` 15s) in addition to realtime.

### What Updates in Real Time
- New order toasts on admin dashboard.
- Order status changes for staff and customer tracker.
- Billing list refresh on invoice changes.
- Overview metrics/recent orders auto-refresh.

### Current Break/Fragility Risks
- Some realtime channels (e.g., `order_items` channel in overview) are broad and not filtered by restaurant.
- Duplicate update pathways (realtime + interval polling + manual fetch) can cause extra load/race flicker.
- Customer invoice delivery uses status encoded in `notes` instead of dedicated state field.

## 9. State Management

### Global/Shared State
- Zustand persisted cart (`useCartStore`) with custom merge recalculation.
- Cart resets when restaurant/table context changes.

### Local Component State
- Most dashboard pages use local `useState` + `useEffect` + `useCallback` for data/loading/pagination/modals.

### Cache/Invalidation Pattern
- No React Query/SWR cache layer.
- Invalidation = manual refetch after writes and realtime callbacks.
- Optimistic updates used in orders status transitions with fallback refetch on failure.

### Synchronization Risks
- Manual refetch orchestration increases chance of stale/duplicated fetch logic.
- Multi-source updates (optimistic + realtime + polling) can lead to temporary mismatches.

## 10. Weaknesses & Risks

1. **Public invoice table endpoints are unauthenticated** (`/api/invoices/table`) and rely only on `tableId` + ownership checks by relation; this is simple but broad for production-grade privacy.
2. **Service request events are modeled as fake orders** (`REQUEST: Water/Bill` in `special_instructions`), mixing operational domains.
3. **Invoice workflow state overloaded into `invoices.notes`** (`sent_to_table`, `acknowledged_by_table`) instead of typed status columns.
4. **Dual invoice number generation sources** (DB trigger + app-level generation) can drift.
5. **No centralized validation/error schema**; repeated manual checks in each route.
6. **No explicit rate limiting/abuse protection** on public ordering/service-request APIs.
7. **Client-heavy direct DB access patterns** can create duplicated permission/business logic across pages.
8. **Dashboard realtime subscriptions are numerous and may over-fetch** (including periodic timers).
9. **Slug creation has no uniqueness collision handling in UI flow** (registration/dashboard setup may fail on duplicate slug).
10. **Limited role granularity** (`owner|staff`) with no feature-level permissions.

## 11. Scalability Concerns

1. **Polling-based table invoice checks (5s per client)** will scale poorly with many concurrent tables.
2. **Large nested selects in frequent refetches** (`orders` + `items` + `menu_item`) can become expensive.
3. **No formal tenant isolation layer** beyond restaurant filtering and RLS; multi-tenant operational tooling is minimal.
4. **Realtime fan-out may increase Supabase channel load** due to multiple channels per dashboard session.
5. **QR code stored as large data URLs in DB rows** can bloat table row size and transfer costs.
6. **No background jobs/queues** for invoice reconciliation or async notifications; done inline in request paths.

## 12. Suggested Future Tables & Columns

### A. Add dedicated service requests
- **New table:** `service_requests` (`id`, `restaurant_id`, `table_id`, `request_type`, `status`, `created_at`, `resolved_at`)
- **Why:** separates non-food events from `orders`, cleaner analytics and kitchen flow.
- **Scalability impact:** reduces special-case filtering across order queries.

### B. Add invoice delivery lifecycle fields
- **Columns in `invoices`:** `delivery_status` enum, `sent_to_table_at`, `acknowledged_by_table_at`
- **Why:** replace overloaded `notes` string flags.
- **Compatibility:** incremental migration from existing note flags.

### C. Add audit/activity logs
- **New table:** `audit_logs` (`actor_user_id`, `restaurant_id`, `entity_type`, `entity_id`, `action`, `before`, `after`, `created_at`)
- **Why:** trace admin actions (status changes, menu edits, payment updates).

### D. Add role-permission system
- **New tables:** `roles`, `permissions`, `staff_role_permissions` (or `staff_members.role_id`).
- **Why:** support cashier/kitchen/manager scoped access.

### E. Add event/analytics tracking
- **New table:** `analytics_events` (`restaurant_id`, `table_id`, `event_name`, `payload`, `created_at`)
- **Why:** funnel metrics, conversion, peak-time performance insights.

### F. Add idempotency for order creation
- **New table/column:** client-generated `idempotency_key` on `orders` (unique per table/session)
- **Why:** prevent duplicate orders on retries/network issues.

### G. Multi-tenant hardening metadata
- **Columns:** `restaurants.plan_tier`, `restaurants.timezone`, `restaurants.locale`, `restaurants.archived_at`
- **Why:** pricing/limits, correct local-time analytics/billing, lifecycle management.

## 13. Recommended Improvements

1. Replace service-request-as-order with dedicated `service_requests` model and UI.
2. Replace `invoices.notes` status encoding with explicit typed fields.
3. Consolidate invoice number generation to one source (prefer DB function/constraint-safe path).
4. Add schema-level input validation patterns (or shared validators) for API routes.
5. Introduce authenticated tokenized table session model for customer endpoints.
6. Move heavy reconciliation work to scheduled/background jobs.
7. Consider React Query/SWR for standardized caching + invalidation.
8. Tighten realtime subscriptions with restaurant filters everywhere and remove redundant polling where possible.
9. Add uniqueness-safe slug generation retries and conflict UX.
10. Move QR image storage to object storage (URL reference) if scale increases.

## 14. Final Architectural Summary

Servaa is a **Next.js + Supabase restaurant QR ordering SaaS** centered around a restaurant-scoped data model (`restaurants`, `tables`, `menu`, `orders`, `invoices`, `staff_members`).

- The **admin side** provides operations for menu, tables/QR, order lifecycle, billing, and settings.
- The **client side** supports public menu access by slug/table QR link, persistent cart checkout, live order status, and table invoice acknowledgment.
- **Auth/session** is Supabase-based with middleware-protected dashboard routes.
- **Authorization** is a mix of app-level owner/staff checks and DB RLS policies.
- **Realtime** is implemented using Supabase `postgres_changes`, supplemented by polling for table invoice delivery.

The current architecture is functional for small-to-medium deployments but has clear growth needs around typed workflow modeling, endpoint hardening, query/load optimization, richer RBAC, and multi-tenant scalability controls.
