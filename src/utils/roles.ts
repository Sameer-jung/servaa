import type { SupabaseClient } from '@supabase/supabase-js'

export type RestaurantRole = 'owner' | 'staff'

type SupabaseLike = Pick<SupabaseClient, 'from'>

export async function getUserRole(
  supabase: SupabaseLike,
  restaurantId: string,
  userId: string
): Promise<RestaurantRole | null> {
  const { data: ownedRestaurant } = await supabase
    .from('restaurants')
    .select('id')
    .eq('id', restaurantId)
    .eq('owner_id', userId)
    .maybeSingle()

  if (ownedRestaurant) return 'owner'

  const { data: staffMember } = await supabase
    .from('staff_members')
    .select('role')
    .eq('restaurant_id', restaurantId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (!staffMember) return null

  return staffMember.role === 'owner' ? 'owner' : 'staff'
}

export async function isOwner(supabase: SupabaseLike, restaurantId: string, userId: string) {
  return (await getUserRole(supabase, restaurantId, userId)) === 'owner'
}

export async function isStaff(supabase: SupabaseLike, restaurantId: string, userId: string) {
  return (await getUserRole(supabase, restaurantId, userId)) !== null
}

export async function hasRestaurantAccess(
  supabase: SupabaseLike,
  restaurantId: string,
  userId: string
) {
  return isStaff(supabase, restaurantId, userId)
}
