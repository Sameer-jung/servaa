'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface PlanEditFormProps {
  restaurantId: string
  plan: string
  trialEndsAt: string | null
}

export function PlanEditForm({ restaurantId, plan, trialEndsAt }: PlanEditFormProps) {
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)

    try {
      const form = event.currentTarget
      const nextPlan = (form.elements.namedItem('plan') as HTMLSelectElement).value
      const rawTrialEndsAt = (form.elements.namedItem('trialEndsAt') as HTMLInputElement).value

      const response = await fetch(`/api/admin/restaurants/${restaurantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: nextPlan,
          trialEndsAt: rawTrialEndsAt ? new Date(rawTrialEndsAt).toISOString() : null,
        }),
      })

      if (!response.ok) {
        const result = await response.json().catch(() => null)
        toast.error(result?.error || 'Unable to save plan changes.')
        return
      }

      toast.success('Plan updated.')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-gray-200">
          Plan
        </label>
        <select
          name="plan"
          defaultValue={plan}
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-base text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="trial">Trial</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      <Input
        name="trialEndsAt"
        label="Trial ends at"
        type="date"
        defaultValue={trialEndsAt ? trialEndsAt.slice(0, 10) : ''}
      />

      <Button type="submit" isLoading={saving}>
        Save plan
      </Button>
    </form>
  )
}
