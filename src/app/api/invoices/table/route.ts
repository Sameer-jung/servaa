import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getBearerToken, hashTableAccessToken } from '@/utils/tableSession'
import { readTrimmedString } from '@/utils/validation'

async function validateTableAccess(tableId: string, token: string | null) {
  if (!token) return true

  const { data: table, error } = await supabaseAdmin
    .from('tables')
    .select('id')
    .eq('id', tableId)
    .eq('qr_token_hash', hashTableAccessToken(token))
    .maybeSingle()

  if (error) throw error
  return Boolean(table)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const tableId = searchParams.get('tableId')
    const tableToken = readTrimmedString(searchParams.get('tableToken'), 256) || getBearerToken(request)

    if (!tableId) {
      return NextResponse.json({ error: 'Missing tableId' }, { status: 400 })
    }

    const hasTableAccess = await validateTableAccess(tableId, tableToken)
    if (!hasTableAccess) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 })
    }

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('id')
      .eq('table_id', tableId)
      .order('created_at', { ascending: false })
      .limit(25)

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 })
    }

    const orderIds = (orders || []).map((order) => order.id)
    if (orderIds.length === 0) {
      return NextResponse.json({ invoice: null })
    }

    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('*, order:orders(*, items:order_items(*, menu_item:menu_items(name)))')
      .in('order_id', orderIds)
      .eq('payment_status', 'unpaid')
      .or('sent_to_table_at.not.is.null,notes.eq.sent_to_table')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (invoiceError) {
      return NextResponse.json({ error: invoiceError.message }, { status: 500 })
    }

    return NextResponse.json({ invoice: invoice || null })
  } catch {
    return NextResponse.json({ error: 'Failed to load invoice' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const { invoiceId, tableId, tableToken: rawTableToken } = await request.json()
    const tableToken = readTrimmedString(rawTableToken, 256) || getBearerToken(request)

    if (!invoiceId || !tableId) {
      return NextResponse.json({ error: 'Missing invoiceId or tableId' }, { status: 400 })
    }

    const hasTableAccess = await validateTableAccess(tableId, tableToken)
    if (!hasTableAccess) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('id, order:orders(table_id)')
      .eq('id', invoiceId)
      .maybeSingle()

    if (invoiceError) {
      return NextResponse.json({ error: invoiceError.message }, { status: 500 })
    }

    const order = Array.isArray((invoice as any)?.order)
      ? (invoice as any).order[0]
      : (invoice as any)?.order

    if (!invoice || order?.table_id !== tableId) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const { error: updateError } = await supabaseAdmin
      .from('invoices')
      .update({
        notes: 'acknowledged_by_table',
        acknowledged_by_table_at: new Date().toISOString(),
      })
      .eq('id', invoiceId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
  }
}
