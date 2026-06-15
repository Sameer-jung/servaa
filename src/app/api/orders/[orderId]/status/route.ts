import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isUuid, readTrimmedString } from '@/utils/validation'
import { getBearerToken, hashTableAccessToken } from '@/utils/tableSession'

// Validates that the requester owns the order via customerSessionId or a valid table token.
// This endpoint replaces the Supabase Realtime direct-subscription approach for customer
// order tracking, which required an open USING (true) RLS policy on the orders table.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params
    if (!isUuid(orderId)) {
      return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const customerSessionId = readTrimmedString(searchParams.get('customerSessionId'), 128)
    const tableToken = readTrimmedString(searchParams.get('tableToken'), 256) || getBearerToken(request)

    if (!customerSessionId && !tableToken) {
      return NextResponse.json({ error: 'Missing session credentials' }, { status: 400 })
    }

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('id, status, table_id, customer_session_id')
      .eq('id', orderId)
      .maybeSingle()

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    let hasAccess = false

    if (customerSessionId && order.customer_session_id === customerSessionId) {
      hasAccess = true
    }

    if (!hasAccess && tableToken && order.table_id) {
      const { data: table } = await supabaseAdmin
        .from('tables')
        .select('id')
        .eq('id', order.table_id)
        .eq('qr_token_hash', hashTableAccessToken(tableToken))
        .maybeSingle()
      hasAccess = Boolean(table)
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json({ status: order.status })
  } catch {
    return NextResponse.json({ error: 'Failed to load order status' }, { status: 500 })
  }
}
