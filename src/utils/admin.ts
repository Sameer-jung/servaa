import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// platform_admins has RLS enabled with zero policies, so it's only readable
// through the service-role client — never derivable from a user's own session.
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  return !!data
}

/**
 * The single gate for the admin area: resolves the current session user and
 * confirms platform-admin status. Returns null if either check fails — pages
 * should redirect on null, API routes should return 403 on null.
 */
export async function getAdminUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = await isPlatformAdmin(user.id)
  return admin ? user : null
}
