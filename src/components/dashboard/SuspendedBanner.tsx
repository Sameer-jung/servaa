'use client'

import { useRestaurant } from '@/hooks/useRestaurant'

export function SuspendedBanner() {
  const { restaurant } = useRestaurant()

  if (!restaurant || restaurant.is_active) return null

  return (
    <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
      This restaurant is suspended. Customers cannot view the menu or place new orders.
    </div>
  )
}
