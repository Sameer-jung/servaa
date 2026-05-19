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
3. Get the service_role key (for QR generation)

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

#### Option A: Using Supabase SQL Editor
1. Open Supabase Dashboard → SQL Editor
2. Run `database/schema.sql`
3. Run `database/rls_policies.sql`

#### Option B: Using psql (if you have direct DB access)
```bash
psql "postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres" -f database/schema.sql
```

### 5. Enable Realtime

1. Supabase Dashboard → Database → Replication
2. Enable Realtime for: `orders`, `order_items`, `invoices`

### 6. Create Storage Bucket

1. Supabase Dashboard → Storage
2. Create bucket `qr-codes`
3. Make it Public
4. Add bucket policy for public read access

### 7. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:3000`

### 8. Create First Account

1. Go to `http://localhost:3000/register`
2. Enter restaurant name, email, password
3. This creates both a user account and restaurant

### 9. Test the Flow

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
npm run dev      # Start dev server
npm run build    # Production build
npm run lint     # Run ESLint
```
