'use client'

import { useEffect, useState, useCallback } from 'react'
import posthog from 'posthog-js'
import { createClient } from '@/lib/supabase/client'
import { Restaurant } from '@/types'

export function useRestaurant() {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchRestaurant = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      // Try staff_members first
      const { data: staffMember } = await supabase
        .from('staff_members')
        .select('restaurant_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle()

      let restaurantId = staffMember?.restaurant_id

      // Fallback to owner
      if (!restaurantId) {
        const { data: ownerRestaurant } = await supabase
          .from('restaurants')
          .select('id')
          .eq('owner_id', user.id)
          .maybeSingle()
        restaurantId = ownerRestaurant?.id
      }

      if (!restaurantId) {
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('restaurants')
        .select('*')
        .eq('id', restaurantId)
        .maybeSingle()

      setRestaurant(data || null)
      if (data) {
        posthog.group('restaurant', data.id)
      }
    } catch (error) {
      console.error('Error fetching restaurant:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchRestaurant()
  }, [fetchRestaurant])

  return { restaurant, loading }
}
