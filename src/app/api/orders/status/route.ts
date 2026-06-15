import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isUuid } from '@/utils/validation'
import { hasRestaurantAccess } from '@/utils/roles'
import { writeAuditLog } from '@/utils/audit'

type OrderStatus = 'pending' | 'accepted' | 'preparing' | 'ready' | 'completed' | 'cancelled'

const ORDER_STATUSES: OrderStatus[] = ['pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled']

function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as string[]).includes(value)
}

// Server-enforced state machine. 'completed' is included in pending's allowed set
// to handle service-request orders that skip the kitchen workflow.
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['accepted', 'cancelled', 'completed'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export async function PATCH(request: Request) {
  try {
    const { orderId, restaurantId, status } = await request.json()

    if (!isUuid(orderId) || !isUuid(restaurantId) || !isOrderStatus(status)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const hasAccess = await hasRestaurantAccess(supabase, restaurantId, user.id)
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, status, restaurant_id')
      .eq('id', orderId)
      .maybeSingle()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.restaurant_id !== restaurantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const allowed = ALLOWED_TRANSITIONS[order.status as OrderStatus] ?? []
    if (!allowed.includes(status)) {
      return NextResponse.json(
        { error: `Cannot transition order from '${order.status}' to '${status}'` },
        { status: 422 }
      )
    }

    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({ status })
      .eq('id', orderId)

    if (updateError) {
      console.error('[orders.status.PATCH] update error:', updateError.message)
      return NextResponse.json({ error: 'Failed to update order status' }, { status: 500 })
    }

    void writeAuditLog(supabaseAdmin, {
      restaurantId,
      actorUserId: user.id,
      action: 'order.status_changed',
      entityType: 'order',
      entityId: orderId,
      metadata: { from_status: order.status, to_status: status },
    })

    return NextResponse.json({ ok: true, status })
  } catch (error) {
    console.error('[orders.status.PATCH] error:', error)
    return NextResponse.json({ error: 'Failed to update order status' }, { status: 500 })
  }
}
