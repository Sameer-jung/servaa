# QR Order — In-Restaurant QR Ordering System

A lightweight, production-ready SaaS application for cafes and restaurants to enable QR code-based in-restaurant ordering.

## Features

- **QR Code Ordering** — Customers scan table QR codes to browse menus and place orders
- **Real-time Dashboard** — Live order updates via Supabase Realtime (no refresh needed)
- **Menu Management** — Add/edit/delete categories and items with availability toggles
- **Table Management** — Generate and download QR codes for each table
- **Order Management** — Accept, reject, and track order status through the kitchen flow
- **Simple Billing** — Auto-generate invoices with tax calculation, mark as paid
- **Multi-tenant** — Row Level Security ensures restaurants only see their own data
- **No Customer Login** — Seamless ordering experience for diners

## Tech Stack

- **Next.js 15** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Supabase** (PostgreSQL, Auth, Realtime, Storage)
- **Zustand** (client state)
- **QRCode** (QR generation)

## Quick Start

### 1. Clone & Install

```bash
git clone <repo>
cd qr-order-saas
npm install
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run the schema: `database/schema.sql`
3. Run RLS policies: `database/rls_policies.sql`
4. Create a storage bucket named `qr-codes` (public)
5. Copy your project URL and anon key

### 3. Environment Variables

```bash
cp .env.local.example .env.local
```

Fill in:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Run Locally

```bash
npm run dev
```

Visit `http://localhost:3000`

## Deployment

### Vercel

1. Push to GitHub
2. Import to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Supabase

- Free tier handles the database, auth, realtime, and storage
- Enable Realtime on `orders`, `order_items`, and `invoices` tables

## Project Structure

```
src/
  app/              # Next.js App Router pages
    (auth)/         # Auth routes (login, register)
    (dashboard)/    # Dashboard routes (protected)
    menu/[slug]/    # Customer-facing menu
    api/            # API routes
  components/
    ui/             # Reusable UI primitives
    auth/           # Auth forms
    dashboard/      # Dashboard layout components
    menu/           # Customer menu components
    orders/         # Order cards
    tables/         # QR code display
    billing/        # Invoice components
  hooks/            # Custom hooks (auth, cart, realtime)
  lib/
    supabase/       # Server & client Supabase clients
  types/            # TypeScript types
  utils/            # Helper functions
database/
  schema.sql        # PostgreSQL schema
  rls_policies.sql  # Row Level Security policies
```

## Database Schema

### Tables
- `restaurants` — Restaurant accounts
- `tables` — Physical tables with QR codes
- `menu_categories` — Menu category groups
- `menu_items` — Individual menu items
- `orders` — Customer orders
- `order_items` — Items within each order
- `invoices` — Generated bills
- `staff_members` — Staff access control

### Order Status Flow
```
pending → accepted → preparing → ready → completed
   ↓
cancelled
```

## Customer Flow

1. Scan QR code at table
2. Browse menu by category
3. Add items to cart
4. Place order (no login required)
5. Track order status in real-time
6. Request water or bill via buttons

## Staff Flow

1. Log in to dashboard
2. View live orders with real-time updates
3. Accept/reject incoming orders
4. Update order status through kitchen flow
5. Generate invoices for completed orders
6. Mark invoices as paid

## License

MIT
