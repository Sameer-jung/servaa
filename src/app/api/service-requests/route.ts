import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import '@/lib/sentry'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getBearerToken, hashTableAccessToken } from '@/utils/tableSession'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  let restaurantId: string | undefined
  let tableId: string | undefined

  try {
    const body = await req.json().catch(() => null)
    restaurantId = body?.restaurantId
    tableId = body?.tableId
    const { type, customerSessionId, tableToken: rawTableToken } = body ?? {}
    const tableToken = rawTableToken || getBearerToken(req)

    if (!restaurantId || !tableId || !['water', 'waiter', 'bill'].includes(type)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    if (!tableToken) {
      return NextResponse.json({ error: 'Missing table access token' }, { status: 401 })
    }

    // Throttle per IP+table — a normal customer presses one of these
    // buttons a handful of times per visit, never in a tight loop.
    const rateLimitKey = `service-requests:${getClientIp(req)}:${tableId}`
    if (!checkRateLimit(rateLimitKey, 8, 30_000)) {
      return NextResponse.json({ error: 'Too many requests, please slow down.' }, { status: 429 })
    }

    const { data: table } = await supabaseAdmin
      .from('tables')
      .select('id')
      .eq('id', tableId)
      .eq('restaurant_id', restaurantId)
      .eq('qr_token_hash', hashTableAccessToken(tableToken))
      .maybeSingle()

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 })
    }

    const specialInstructions =
      type === 'water' ? 'REQUEST: Water' : type === 'waiter' ? 'REQUEST: Waiter' : 'REQUEST: Bill'

    // Insert legacy order for all types (dashboard uses special_instructions to detect service requests)
    const { data: legacyOrder, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        restaurant_id: restaurantId,
        table_id: tableId,
        status: 'pending',
        total_amount: 0,
        special_instructions: specialInstructions,
        customer_session_id: customerSessionId ?? null,
      })
      .select('id')
      .maybeSingle()

    if (orderError) {
      Sentry.captureException(orderError, { tags: { restaurant_id: restaurantId, table_id: tableId } })
      return NextResponse.json({ error: 'Failed to create service request' }, { status: 500 })
    }

    // Insert into service_requests for water and bill.
    // 'waiter' is not in the service_request_type enum so it is handled via the legacy order only.
    if (type === 'water' || type === 'bill') {
      const { error: serviceRequestError } = await supabaseAdmin
        .from('service_requests')
        .insert({
          restaurant_id: restaurantId,
          table_id: tableId,
          request_type: type,
          status: 'pending',
          customer_session_id: customerSessionId ?? null,
          legacy_order_id: legacyOrder?.id ?? null,
        })

      if (serviceRequestError) {
        Sentry.captureException(serviceRequestError, { tags: { restaurant_id: restaurantId, table_id: tableId } })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    Sentry.captureException(error, { tags: { restaurant_id: restaurantId, table_id: tableId } })
    return NextResponse.json({ error: 'Failed to create service request' }, { status: 500 })
  }
}
