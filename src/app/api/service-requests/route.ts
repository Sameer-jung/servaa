import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { restaurantId, tableId, type, customerSessionId } = body ?? {}

  if (!restaurantId || !tableId || !['water', 'waiter', 'bill'].includes(type)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
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
    return NextResponse.json({ error: 'Failed to create service request' }, { status: 500 })
  }

  // Insert into service_requests for water and bill.
  // 'waiter' is not in the service_request_type enum so it is handled via the legacy order only.
  if (type === 'water' || type === 'bill') {
    await supabaseAdmin
      .from('service_requests')
      .insert({
        restaurant_id: restaurantId,
        table_id: tableId,
        request_type: type,
        status: 'pending',
        customer_session_id: customerSessionId ?? null,
        legacy_order_id: legacyOrder?.id ?? null,
      })
  }

  return NextResponse.json({ success: true })
}
