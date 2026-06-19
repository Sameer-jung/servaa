import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import '@/lib/sentry'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getBearerToken, hashTableAccessToken } from '@/utils/tableSession'
import { isUuid, readTrimmedString } from '@/utils/validation'

type InvoiceOrderRelation = {
  table_id?: string | null
}

type InvoiceWithOrderRelation = {
  order?: InvoiceOrderRelation | InvoiceOrderRelation[] | null
}

async function validateTableAccess(tableId: string, token: string | null) {
  if (!token) return false

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
  let tableId: string | null = null
  try {
    const { searchParams } = new URL(request.url)
    tableId = searchParams.get('tableId')
    const tableToken = readTrimmedString(searchParams.get('tableToken'), 256) || getBearerToken(request)

    if (!isUuid(tableId)) {
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
      Sentry.captureException(ordersError, { tags: { table_id: tableId } })
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
      .is('acknowledged_by_table_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (invoiceError) {
      Sentry.captureException(invoiceError, { tags: { table_id: tableId } })
      return NextResponse.json({ error: invoiceError.message }, { status: 500 })
    }

    return NextResponse.json({ invoice: invoice || null })
  } catch (error) {
    Sentry.captureException(error, { tags: { table_id: tableId } })
    return NextResponse.json({ error: 'Failed to load invoice' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  let invoiceId: string | undefined
  let tableId: string | undefined
  try {
    const body = await request.json()
    invoiceId = body.invoiceId
    tableId = body.tableId
    const tableToken = readTrimmedString(body.tableToken, 256) || getBearerToken(request)

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
      Sentry.captureException(invoiceError, { tags: { invoice_id: invoiceId, table_id: tableId } })
      return NextResponse.json({ error: invoiceError.message }, { status: 500 })
    }

    const invoiceWithOrder = invoice as InvoiceWithOrderRelation | null
    const order = Array.isArray(invoiceWithOrder?.order)
      ? invoiceWithOrder.order[0]
      : invoiceWithOrder?.order

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
      Sentry.captureException(updateError, { tags: { invoice_id: invoiceId, table_id: tableId } })
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    Sentry.captureException(error, { tags: { invoice_id: invoiceId, table_id: tableId } })
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
  }
}
