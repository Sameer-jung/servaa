// New restaurants get a 14-day trial by default — enforced entirely at the
// DB level (protect_restaurant_admin_fields in
// database/012_super_admin_trial_default.sql), not here, because the insert
// happens under the owner's own RLS session: app-level code setting this
// value could be bypassed by a crafted insert request the same way
// plan/is_active could.

export type PlanStatusTone = 'green' | 'amber' | 'red' | 'gray'

export interface PlanStatus {
  label: string
  tone: PlanStatusTone
}

/**
 * Derives a human-readable trial/paid status from the plain metadata fields
 * (restaurants.plan, restaurants.trial_ends_at) — there's no billing engine
 * behind this, just a label so admins can see at a glance who needs
 * follow-up without doing date math themselves.
 */
export function getPlanStatus(plan: string, trialEndsAt: string | null): PlanStatus {
  if (plan === 'paid') {
    return { label: 'Paid', tone: 'green' }
  }

  if (!trialEndsAt) {
    return { label: 'Trial — no end date set', tone: 'gray' }
  }

  const daysLeft = Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000)

  if (daysLeft < 0) {
    return { label: `Trial expired ${Math.abs(daysLeft)}d ago`, tone: 'red' }
  }
  if (daysLeft === 0) {
    return { label: 'Trial ends today', tone: 'amber' }
  }
  if (daysLeft <= 3) {
    return { label: `Trial — ${daysLeft}d left`, tone: 'amber' }
  }
  return { label: `Trial — ${daysLeft}d left`, tone: 'gray' }
}
