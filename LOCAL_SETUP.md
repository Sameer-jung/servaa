# Local Development Setup

## Prerequisites

- Node.js 18+ 
- npm or yarn
- A Supabase account (free tier)

## Step-by-Step Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a project
2. Note your project URL and anon key from Settings → API
3. Get the service_role key (used server-side for privileged operations — orders, QR generation, inventory, billing)

### 3. Set Environment Variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Initialize Database

Run these files **in order** via Supabase Dashboard → SQL Editor (or `psql "postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres" -f database/<file>`):

1. `database/schema.sql`
2. `database/rls_policies.sql`
3. `database/scalability.sql`
4. `database/add_modifiers.sql`
5. `database/001_order_item_cancellation.sql` (no-op on a fresh `schema.sql` — safe to run)
6. `database/002_security_fixes.sql` (must run after `rls_policies.sql` and `add_modifiers.sql`)
7. `database/003_item_name_snapshot.sql`
8. `database/fix_duplicate_invoices.sql`
9. `database/004_inventory_expenses.sql`
10. `database/005_inventory_categories.sql`
11. `database/006_atomic_order_creation.sql`
12. `database/007_billing_splits_payments.sql`
13. `database/008_remove_bill_split_concept.sql`
14. `database/009_bill_customer_name.sql`

Skip `audit_logs_v1.sql`, `safe_refactor_v1.sql`, `currency_defaults_v1.sql`, and `add_waiter_request.sql` — these are early migrations already consolidated into `schema.sql` (or unused). See [CLAUDE.md](CLAUDE.md) for the full rationale per migration.

Alternatively, `npm run db:migrate` applies just `database/schema.sql` to `DATABASE_URL` (fresh local DB only) — you'd still need to run the rest of the list above manually after.

### 5. Enable Realtime

1. Supabase Dashboard → Database → Replication
2. Enable Realtime for: `orders`, `order_items`, `invoices`, `service_requests`

(Inventory and expense tables are intentionally excluded — that UI refetches on mutation instead.)

### 6. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:3000`

### 7. Create First Account

1. Go to `http://localhost:3000/register`
2. Enter restaurant name, email, password
3. This creates both a user account and restaurant

### 8. Test the Flow

1. Go to Dashboard → Tables
2. Add a table (e.g., "Table 1")
3. Click "Generate QR"
4. Download or print the QR code
5. Scan with your phone or visit the URL directly
6. Add items to cart and place an order
7. Watch the order appear in Dashboard → Orders in real-time

## Development Tips

### Regenerate Types
If you modify the database schema:
```bash
npm run db:types
```

### Common Issues

**Build error: Cannot find module**
- Run `npm install` again
- Check `tsconfig.json` paths are correct

**Auth session not persisting**
- Ensure middleware.ts is properly configured
- Check cookies are not blocked in browser

**RLS policy violation**
- Verify staff_members row exists for the user
- Check `is_restaurant_staff()` function works correctly

**Realtime not working**
- Confirm tables have `REPLICA IDENTITY FULL`
- Check Realtime is enabled in Supabase Dashboard
- Verify channel subscription in browser dev tools

### Project Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # Run ESLint
npm run db:types     # Regenerate src/types/supabase.ts from live Supabase schema
npm run db:migrate   # Apply database/schema.sql to DATABASE_URL (fresh local DB only)
npx tsc --noEmit     # TypeScript check without building
```
