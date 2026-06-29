import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Maps auth user ids to emails for the admin UI (owner lists, restaurant
 * detail). auth.users isn't exposed over PostgREST, so this goes through
 * the service-role admin API instead of a table query.
 *
 * v1 scale: a single page covers up to 1000 users, comfortably past
 * expected tenant counts for now — revisit if that changes.
 */
export async function getUserEmailMap(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = new Set(userIds)
  if (unique.size === 0) return map

  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error || !data) return map

  for (const user of data.users) {
    if (unique.has(user.id)) {
      map.set(user.id, user.email || '')
    }
  }

  return map
}
