import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasRestaurantAccess } from '@/utils/roles'
import { isUuid } from '@/utils/validation'
import { invalidateMenuCache } from '@/lib/menuCache'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const restaurantId = body?.restaurantId

  if (!isUuid(restaurantId)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const hasAccess = await hasRestaurantAccess(supabase, restaurantId, user.id)
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  invalidateMenuCache(restaurantId)
  return NextResponse.json({ success: true })
}
