'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getUserRole, type RestaurantRole } from '@/utils/roles'

/**
 * Resolves the current user's role for a given restaurant. Used to gate
 * owner-only surfaces (e.g. Expenses) in the dashboard UI. Server routes
 * still enforce access independently — this is for UI affordances only.
 *
 * `loading` is derived from whether we have resolved a role for the *current*
 * restaurantId, so callers never see a stale `role` (which would otherwise
 * flash the "not owner" state while a new lookup is in flight).
 */
export function useRole(restaurantId?: string | null) {
  const [role, setRole] = useState<RestaurantRole | null>(null)
  const [resolvedId, setResolvedId] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false

    async function run() {
      if (!restaurantId) {
        if (!cancelled) {
          setRole(null)
          setResolvedId(restaurantId ?? null)
        }
        return
      }

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return

      if (!user) {
        setRole(null)
        setResolvedId(restaurantId)
        return
      }

      const resolved = await getUserRole(supabase, restaurantId, user.id)
      if (cancelled) return

      setRole(resolved)
      setResolvedId(restaurantId)
    }

    run()
    return () => {
      cancelled = true
    }
  }, [restaurantId])

  // Loading until we have a result for the restaurantId currently requested.
  const loading = restaurantId ? resolvedId !== restaurantId : false

  return { role, isOwner: role === 'owner', loading }
}
