# Deployment Guide

## Vercel + Supabase

### Step 1: Prepare Your Repository

```bash
# Ensure all files are committed
git add .
git commit -m "Initial commit"
git push origin main
```

### Step 2: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "Add New Project"
3. Import your GitHub repository
4. Configure:
   - **Framework Preset**: Next.js
   - **Build Command**: `next build`
   - **Output Directory**: `.next`

### Step 3: Environment Variables in Vercel

In your Vercel project settings, add these environment variables:

| Variable | Value | Source |
|----------|-------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://your-project.supabase.co` | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Supabase Dashboard → Settings → API (service_role) |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` | Your Vercel deployment URL |

### Step 4: Supabase Setup

#### 4.1 Create Project
1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Choose region closest to your users
4. Set a strong database password

#### 4.2 Run Schema
1. Go to SQL Editor in Supabase Dashboard
2. New query → Paste contents of `database/schema.sql`
3. Run

#### 4.3 Run RLS Policies
1. New query → Paste contents of `database/rls_policies.sql`
2. Run

#### 4.4 Enable Realtime
1. Go to Database → Replication
2. Enable Realtime on tables:
   - `orders`
   - `order_items`
   - `invoices`

#### 4.5 Create Storage Bucket
1. Go to Storage
2. Create bucket named `qr-codes`
3. Set to **Public**
4. Add policy: `Allow public read access`

#### 4.6 Configure Auth
1. Go to Authentication → Providers
2. Enable Email provider
3. (Optional) Configure email templates
4. Set Site URL to your Vercel URL

### Step 5: Deploy

Click "Deploy" in Vercel. Your app will be live at `https://your-app.vercel.app`.

### Step 6: Verify

1. Visit your deployed URL
2. Register a new restaurant account
3. Add a table and generate a QR code
4. Scan the QR code with your phone
5. Place a test order
6. Check the dashboard for real-time updates

### Updating After Deployment

```bash
# Make changes locally
git add .
git commit -m "Update feature"
git push origin main
# Vercel auto-deploys
```

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails | Check `NEXT_PUBLIC_SUPABASE_URL` is set correctly |
| Auth not working | Verify Site URL in Supabase Auth settings matches your domain |
| Realtime not working | Enable Realtime on tables in Supabase Dashboard |
| QR codes not generating | Check `qr-codes` bucket exists and is public |
| RLS errors | Ensure `staff_members` row is created for the owner after registration |
