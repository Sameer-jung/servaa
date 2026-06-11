import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isUuid } from '@/utils/validation'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { restaurantId, tableId, request_type, customerSessionId } = body

    if (!isUuid(restaurantId) || !isUuid(tableId)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    if (!['water', 'bill', 'waiter'].includes(request_type)) {
      return NextResponse.json({ error: 'Invalid request type' }, { status: 400 })
    }

    // Enforce 60-second cooldown per table and per request type
    const { data: recentRequests, error: cooldownError } = await supabaseAdmin
      .from('service_requests')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('table_id', tableId)
      .eq('request_type', request_type)
      .gt('created_at', new Date(Date.now() - 60000).toISOString())
      .limit(1)

    if (cooldownError) {
      console.error('[service-requests] cooldown check error:', cooldownError)
      return NextResponse.json({ error: 'Failed to process request' }, { status: 500 })
    }

    if (recentRequests && recentRequests.length > 0) {
      return NextResponse.json(
        { error: 'Please wait a moment before sending another request.' },
        { status: 429 }
      )
    }

    // For bill requests, enforce that the table has at least one real order
    if (request_type === 'bill') {
      const { data: recentOrders } = await supabaseAdmin
        .from('orders')
        .select('id, special_instructions, items:order_items(id)')
        .eq('table_id', tableId)
        .eq('customer_session_id', customerSessionId)
        .order('created_at', { ascending: false })
        .limit(25)

      const hasRealOrders = (recentOrders || []).some((order) => {
        const items = Array.isArray(order.items) ? order.items : []
        return items.length > 0 && !order.special_instructions?.toLowerCase().startsWith('request:')
      })

      if (!hasRealOrders) {
        return NextResponse.json(
          { error: 'Please place an order before requesting the bill.' },
          { status: 400 }
        )
      }
    }

    const { data: serviceRequest, error: insertError } = await supabaseAdmin
      .from('service_requests')
      .insert({
        restaurant_id: restaurantId,
        table_id: tableId,
        request_type,
        status: 'pending',
        customer_session_id: customerSessionId || null,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[service-requests] insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create request' }, { status: 500 })
    }

    // Currently we skip legacy order creation as decided by the user

    return NextResponse.json({ success: true, serviceRequest })
  } catch (error) {
    console.error('[service-requests] server error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
