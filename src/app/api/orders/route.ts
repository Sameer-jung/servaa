import { NextResponse } from 'next/server'
import { createOrder } from '@/lib/orders/createOrder'
import { createClient } from '@/lib/supabase/server'
import { getBearerToken } from '@/utils/tableSession'
import { isUuid, readTrimmedString, validateOrderItems } from '@/utils/validation'
import { hasRestaurantAccess } from '@/utils/roles'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const restaurantId = body?.restaurantId
    const tableId = body?.tableId
    const items = validateOrderItems(body?.items)
    const customerSessionId = readTrimmedString(body?.customerSessionId, 128);
    const clientRequestId = readTrimmedString(body?.clientRequestId, 128)
    const tableToken = readTrimmedString(body?.tableToken, 256) || getBearerToken(request)
    const isStaffOrder = body?.mode === 'staff'

    if (!isUuid(restaurantId) || !isUuid(tableId) || !items) {
      return NextResponse.json({ error: 'Invalid order payload' }, { status: 400 })
    }

    let actorUserId: string | null = null

    if (isStaffOrder) {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const hasAccess = await hasRestaurantAccess(supabase, restaurantId, user.id)
      if (!hasAccess) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      actorUserId = user.id
    }

    const result = await createOrder({
      restaurantId,
      tableId,
      items,
      tableToken: isStaffOrder ? null : tableToken,
      customerSessionId: isStaffOrder ? null : customerSessionId || null,
      clientRequestId: clientRequestId || null,
      actorUserId,
    })

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ order: result.order })
  } catch (error) {
    console.error('[orders.POST] error:', error)
    return NextResponse.json({ error: 'Failed to place order' }, { status: 500 })
  }
}
