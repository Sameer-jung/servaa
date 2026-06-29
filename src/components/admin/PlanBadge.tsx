import { cn } from '@/utils/cn'
import { getPlanStatus, type PlanStatusTone } from '@/utils/plan'

const toneClasses: Record<PlanStatusTone, string> = {
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  gray: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

export function PlanBadge({ plan, trialEndsAt }: { plan: string; trialEndsAt: string | null }) {
  const status = getPlanStatus(plan, trialEndsAt)

  return (
    <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', toneClasses[status.tone])}>
      {status.label}
    </span>
  )
}
