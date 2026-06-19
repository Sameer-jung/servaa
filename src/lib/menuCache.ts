import { supabaseAdmin } from '@/lib/supabase/admin'
import type { MenuCategory, MenuItem } from '@/types'

const TTL_MS = 30_000

type MenuCacheEntry = {
  data: { categories: MenuCategory[]; items: MenuItem[] }
  expiresAt: number
}

const cache = new Map<string, MenuCacheEntry>()

export async function getCachedMenu(restaurantId: string) {
  const cached = cache.get(restaurantId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }

  const [{ data: categories, error: categoriesError }, { data: items, error: itemsError }] = await Promise.all([
    supabaseAdmin
      .from('menu_categories')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('sort_order'),
    supabaseAdmin
      .from('menu_items')
      .select('*, modifier_groups(*, modifiers(*))')
      .eq('restaurant_id', restaurantId)
      .order('sort_order'),
  ])

  if (categoriesError) console.error('[menuCache] categories fetch error:', categoriesError.message)
  if (itemsError) console.error('[menuCache] items fetch error:', itemsError.message)

  const data = {
    categories: (categories || []) as MenuCategory[],
    items: (items || []) as unknown as MenuItem[],
  }
  cache.set(restaurantId, { data, expiresAt: Date.now() + TTL_MS })
  return data
}

export function invalidateMenuCache(restaurantId: string) {
  cache.delete(restaurantId)
}
