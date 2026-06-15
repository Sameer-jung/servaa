import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isUuid, readTrimmedString } from '@/utils/validation'
import { getBearerToken, hashTableAccessToken } from '@/utils/tableSession'

// Returns a customer's unpaid orders for the bill summary modal.
// Replaces the direct client-side Supabase query in CustomerActions that
// required order_items_select_public: USING (true).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const tableId = searchParams.get('tableId')
    const customerSessionId = readTrimmedString(searchParams.get('customerSessionId'), 128)
    const tableToken = readTrimmedString(searchParams.get('tableToken'), 256) || getBearerToken(request)

    if (!isUuid(tableId)) {
      return NextResponse.json({ error: 'Invalid tableId' }, { status: 400 })
    }

    if (!customerSessionId) {
      return NextResponse.json({ error: 'Missing customerSessionId' }, { status: 400 })
    }

    // Validate table token when provided
    if (tableToken) {
      const { data: table } = await supabaseAdmin
        .from('tables')
        .select('id')
        .eq('id', tableId)
        .eq('qr_token_hash', hashTableAccessToken(tableToken))
        .maybeSingle()

      if (!table) {
        return NextResponse.json({ error: 'Table not found' }, { status: 404 })
      }
    }

    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select(
        'id, special_instructions, status, total_amount, items:order_items(id, quantity, price_snapshot, modifiers, menu_item:menu_items(name)), invoices(payment_status)'
      )
      .eq('table_id', tableId)
      .eq('customer_session_id', customerSessionId)
      .in('status', ['pending', 'accepted', 'preparing', 'ready', 'completed'])
      .order('created_at', { ascending: false })
      .limit(25)

    if (error) {
      console.error('[orders.bill.GET] error:', error.message)
      return NextResponse.json({ error: 'Failed to load bill data' }, { status: 500 })
    }

    return NextResponse.json({ orders: orders || [] })
  } catch {
    return NextResponse.json({ error: 'Failed to load bill data' }, { status: 500 })
  }
}
