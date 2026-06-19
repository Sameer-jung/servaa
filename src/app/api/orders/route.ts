import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import '@/lib/sentry'
import { getPostHogServerClient } from '@/lib/posthog/server'
import { createOrder } from '@/lib/orders/createOrder'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getBearerToken } from '@/utils/tableSession'
import { isUuid, readTrimmedString, validateOrderItems, validatePrice } from '@/utils/validation'
import { hasRestaurantAccess } from '@/utils/roles'
import { writeAuditLog } from '@/utils/audit'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export async function POST(request: Request) {
  let restaurantId: string | undefined
  let tableId: string | undefined
  try {
    const body = await request.json()
    restaurantId = body?.restaurantId
    tableId = body?.tableId
    const items = validateOrderItems(body?.items)
    const customerSessionId = readTrimmedString(body?.customerSessionId, 128);
    const clientRequestId = readTrimmedString(body?.clientRequestId, 128)
    const tableToken = readTrimmedString(body?.tableToken, 256) || getBearerToken(request)
    const isStaffOrder = body?.mode === 'staff'

    if (!isUuid(restaurantId) || !isUuid(tableId) || !items) {
      return NextResponse.json({ error: 'Invalid order payload' }, { status: 400 })
    }

    // Throttle per IP+table so a script can't hammer order creation; staff
    // orders are excluded since they're authenticated and rate-limited by
    // having to be a logged-in human clicking through the dashboard.
    if (!isStaffOrder) {
      const rateLimitKey = `orders:${getClientIp(request)}:${tableId}`
      if (!checkRateLimit(rateLimitKey, 12, 30_000)) {
        return NextResponse.json({ error: 'Too many requests, please slow down.' }, { status: 429 })
      }
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
      if (result.status >= 500) {
        Sentry.captureException(new Error(result.error), {
          tags: { restaurant_id: restaurantId, table_id: tableId },
        })
      }
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const posthogClient = getPostHogServerClient()
    if (posthogClient) {
      const orderId = (result.order as { id?: string } | null)?.id
      posthogClient.capture({
        distinctId: customerSessionId || tableId,
        event: 'order_placed',
        properties: {
          restaurant_id: restaurantId,
          table_id: tableId,
          order_id: orderId,
          staff_placed: isStaffOrder,
          source: 'server',
        },
        groups: { restaurant: restaurantId },
      })
      // flushAt: 1 queues a flush automatically, but in serverless environments
      // the function can terminate before that in-flight request completes —
      // await it explicitly so the event is actually delivered.
      await posthogClient.flush()
    }

    return NextResponse.json({ order: result.order })
  } catch (error) {
    Sentry.captureException(error, { tags: { restaurant_id: restaurantId, table_id: tableId } })
    console.error('[orders.POST] error:', error)
    return NextResponse.json({ error: 'Failed to place order' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  let orderItemId: string | undefined
  let restaurantId: string | undefined
  let orderId: string | undefined
  try {
    const body = await request.json()
    orderItemId = body.orderItemId
    restaurantId = body.restaurantId

    if (!isUuid(orderItemId) || !isUuid(restaurantId)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const hasAccess = await hasRestaurantAccess(supabase, restaurantId, user.id)
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Fetch the item
    const { data: orderItem, error: itemError } = await supabaseAdmin
      .from('order_items')
      .select('id, order_id, cancelled')
      .eq('id', orderItemId)
      .maybeSingle()

    if (itemError || !orderItem) {
      return NextResponse.json({ error: 'Order item not found' }, { status: 404 })
    }

    orderId = orderItem.order_id

    if (orderItem.cancelled) {
      return NextResponse.json({ error: 'Item already cancelled' }, { status: 400 })
    }

    // Verify item belongs to the given restaurant via its order
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, restaurant_id, status')
      .eq('id', orderItem.order_id)
      .maybeSingle()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.restaurant_id !== restaurantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (order.status === 'cancelled' || order.status === 'completed') {
      return NextResponse.json({ error: 'Cannot modify a completed or cancelled order' }, { status: 400 })
    }

    // Soft-cancel the item — the DB trigger recalculates orders.total_amount automatically
    const { error: cancelError } = await supabaseAdmin
      .from('order_items')
      .update({ cancelled: true })
      .eq('id', orderItemId)

    if (cancelError) {
      Sentry.captureException(cancelError, {
        tags: { order_id: orderId, restaurant_id: restaurantId },
      })
      console.error('[orders.PATCH] cancel item error:', cancelError.message)
      return NextResponse.json({ error: 'Failed to cancel item' }, { status: 500 })
    }

    // Check if all items are now cancelled → auto-cancel the order
    const { count: activeCount } = await supabaseAdmin
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId)
      .eq('cancelled', false)

    let orderCancelled = false
    if ((activeCount ?? 0) === 0) {
      const { error: statusError } = await supabaseAdmin
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId)

      if (!statusError) orderCancelled = true
    }

    // If an unpaid invoice exists, recalculate its totals
    const { data: invoice } = await supabaseAdmin
      .from('invoices')
      .select('id')
      .eq('order_id', orderId)
      .eq('payment_status', 'unpaid')
      .maybeSingle()

    if (invoice) {
      const { data: remainingItems } = await supabaseAdmin
        .from('order_items')
        .select('quantity, price_snapshot')
        .eq('order_id', orderId)
        .eq('cancelled', false)

      const newSubtotal = (remainingItems || []).reduce(
        (sum, item) => sum + item.quantity * item.price_snapshot,
        0
      )

      const { data: restaurantRow } = await supabaseAdmin
        .from('restaurants')
        .select('tax_rate')
        .eq('id', restaurantId)
        .maybeSingle()

      const taxRate = Math.min(100, validatePrice(restaurantRow?.tax_rate) ?? 0)
      const newTaxAmount = Math.round(newSubtotal * (taxRate / 100) * 100) / 100
      const newGrandTotal = Math.round((newSubtotal + newTaxAmount) * 100) / 100

      await supabaseAdmin
        .from('invoices')
        .update({ subtotal: newSubtotal, tax_amount: newTaxAmount, grand_total: newGrandTotal })
        .eq('id', invoice.id)
    }

    void writeAuditLog(supabaseAdmin, {
      restaurantId,
      actorUserId: user.id,
      action: 'order_item.cancelled',
      entityType: 'order_item',
      entityId: orderItemId,
      metadata: { order_id: orderId, order_auto_cancelled: orderCancelled },
    })

    return NextResponse.json({ success: true, orderCancelled })
  } catch (error) {
    Sentry.captureException(error, {
      tags: { order_item_id: orderItemId, order_id: orderId, restaurant_id: restaurantId },
    })
    console.error('[orders.PATCH] error:', error)
    return NextResponse.json({ error: 'Failed to cancel item' }, { status: 500 })
  }
}
