# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build (requires valid Supabase env vars)
npm run lint         # ESLint (next lint)
npm run db:types     # Regenerate src/types/supabase.ts from live Supabase schema
npm run db:migrate   # Apply database/schema.sql to DATABASE_URL
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
| `/api/orders`, `/api/qr`, `/api/invoices` | Server-side route handlers |

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

### QR codes

Generated via `POST /api/qr/route.ts`. Both `qr_code` (text URL) and `qr_code_data_url` (PNG data URL) are stored directly on the `tables` row. Do not move QR storage to Supabase Storage.

### Order lifecycle

`pending → accepted → preparing → ready → completed` (or `→ cancelled`). Completing an order triggers invoice creation. Service requests live in the `service_requests` table; legacy zero-total orders also exist for compatibility — `src/utils/orders.ts` filters them from billable logic.

### Database setup (fresh)

Run in order:
1. `database/schema.sql`
2. `database/rls_policies.sql`
3. `database/scalability.sql`

Enable Supabase Realtime on tables: `orders`, `order_items`, `invoices`.

### Path aliases

`tsconfig.json` maps `@/*` → `src/*`, plus `@/components/*`, `@/lib/*`, `@/hooks/*`, `@/types/*`, `@/utils/*`.

## Required environment variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY     # server-only, never expose to browser
NEXT_PUBLIC_APP_URL           # base URL for QR links (Vercel also reads VERCEL_URL)
```

See `.env.local.example` for the full template.

## Patterns to preserve

- Do not duplicate cart state, order creation APIs, or RBAC role models.
- Do not remove polling because realtime exists.
- Do not make audit logging block async operations.
- Do not drop compatibility columns (`notes`, legacy zero-total orders) without a phased migration.
- The `SUPABASE_SERVICE_ROLE_KEY` must never appear in browser-accessible code — use the admin client (`src/lib/supabase/admin.ts`) only in server routes/actions.
- Same color combination almost everywhere 
