# Servaa Cleanup Execution v1

Date: 2026-05-21

## Changes Performed

This execution batch was limited to proven-safe cleanup and small clarity fixes. No production flow was intentionally changed.

## Files Removed

- `src/components/billing/InvoiceCard.tsx`
  - Removed because it had no source imports and billing now uses `BillingTableGroup` plus `InvoiceDetail`.
- `src/hooks/useAuth.ts`
  - Removed because it had no source imports. Auth behavior is handled by server route checks, middleware, and form-level Supabase calls.

## Files Modified

- `src/utils/format.ts`
  - Removed commented legacy duplicate implementations of `formatCurrency`, `formatDate`, `formatTimeAgo`, and `generateSlug`.
- `src/app/(dashboard)/dashboard/page.tsx`
  - Replaced inline slug generation with existing `generateSlug`.
- `src/app/(dashboard)/dashboard/billing/page.tsx`
  - Replaced corrupted separator display with ASCII text.
  - Removed unused `supabase` dependency from `fetchData` callback.
- `src/app/(dashboard)/dashboard/orders/page.tsx`
  - Replaced corrupted separator display with ASCII text.
- `src/app/page.tsx`
  - Replaced corrupted footer dash display with ASCII text.
- `src/components/auth/LoginForm.tsx`
  - Replaced corrupted password placeholder with ASCII placeholder text.
- `src/components/auth/RegisterForm.tsx`
  - Replaced corrupted password placeholders with ASCII placeholder text.
- `src/components/billing/InvoiceDetail.tsx`
  - Replaced corrupted payment method fallback display with `N/A`.
- `src/components/orders/OrderCard.tsx`
  - Replaced corrupted separator display with ASCII text.
- `src/components/tables/QRCodeDisplay.tsx`
  - Replaced non-ASCII separator display with ASCII text.
- `cleanup-analysis-v1.md`
  - Added full cleanup analysis.
- `cleanup-plan-v1.md`
  - Added phased cleanup plan.
- `cleanup-execution-v1.md`
  - Added execution record.

## Migrations Added

None.

## Systems Consolidated

- Slug generation in dashboard setup now uses the existing `generateSlug` utility instead of a local duplicate implementation.

No realtime, invoice, service request, QR, RLS, or order lifecycle systems were consolidated in code during this pass because those paths are active production behavior and need staged verification.

## Compatibility Layers Preserved

- Direct Supabase order creation fallback in `StickyCart`.
- Legacy service request orders using `special_instructions = REQUEST:*`.
- `service_requests.legacy_order_id`.
- Invoice delivery `notes` compatibility values.
- Dual QR fields `qr_code` and `qr_code_data_url`.
- Optional table token behavior for older QR links.
- Dashboard and billing fallback polling.
- Existing RLS policies.
- Existing audit logging behavior.

## Verification Performed

Baseline before edits:

- `npx tsc --noEmit`: passed.
- `npm run lint`: blocked by Next.js interactive ESLint setup prompt; no lint result produced.

After cleanup batch:

- Pending final verification commands:
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm run build`
  - import/reference searches

## Risks Remaining

- Lint script is not CI-safe because `next lint` prompts for initial ESLint configuration.
- There are still duplicate sync paths by design: realtime plus polling fallback.
- Service requests are still represented twice until dashboard consumption of `service_requests` is first-class.
- Invoice number generation remains duplicated between app code and DB trigger.
- Invoice table delivery still dual-writes timestamps and legacy `notes` values.
- Some exported types and UI primitives appear unused but were left in place to avoid breaking the informal shared API surface.

## Rollback Notes

Rollback is low difficulty:

- Restore deleted files from git if needed.
- Revert display text cleanup and `generateSlug` import if any unexpected issue appears.
- No database rollback is required because no migration was added.
