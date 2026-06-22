import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import '@/lib/sentry'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/utils/audit'
import { hasRestaurantAccess } from '@/utils/roles'
import { isUuid, readTrimmedString, validatePrice } from '@/utils/validation'
import { loadBillDetail } from '@/lib/billing/loadBillDetail'
import { createInvoiceForOrder } from '@/lib/invoices/createInvoiceForOrder'

const ROUNDING_TOLERANCE = 0.01

type PaymentListRow = {
  id: string
  amount: number
  method: string
  created_at: string
  bill?: { table?: { table_number: string } | { table_number: string }[] | null } | null
}

export async function GET(request: Request) {
  let restaurantId: string | null = null
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    restaurantId = searchParams.get('restaurantId')
    const method = searchParams.get('method')

    if (!isUuid(restaurantId)) {
      return NextResponse.json({ error: 'Invalid payments query' }, { status: 400 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const hasAccess = await hasRestaurantAccess(supabase, restaurantId, user.id)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let query = supabaseAdmin
      .from('payments')
      .select('id, amount, method, created_at, bill:bills(table:tables(table_number))')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (method) {
      query = query.eq('method', method)
    }

    const { data: payments, error } = await query

    if (error) {
      Sentry.captureException(error, { tags: { restaurant_id: restaurantId } })
      console.error('[billing.payments.GET] query error:', error.message)
      return NextResponse.json({ error: 'Could not load payments.' }, { status: 500 })
    }

    const normalized = (payments as unknown as PaymentListRow[] || []).map((p) => {
      const tableRef = Array.isArray(p.bill?.table) ? p.bill?.table[0] : p.bill?.table
      return {
        id: p.id,
        amount: p.amount,
        method: p.method,
        created_at: p.created_at,
        table_number: tableRef?.table_number || null,
      }
    })

    return NextResponse.json({ payments: normalized })
  } catch (error) {
    Sentry.captureException(error, { tags: { restaurant_id: restaurantId } })
    console.error('[billing.payments.GET] error:', error)
    return NextResponse.json({ error: 'Failed to load payments' }, { status: 500 })
  }
}

// Bills are a layer above invoices — paying one off here doesn't touch
// `orders`/`invoices` on its own. Without this, the dashboard's Active/Inactive
// table cards (invoice-driven) would never reflect a bill paid through this
// flow, forcing staff to separately "Mark Paid" each underlying invoice.
// Mirror the bill's paid status onto its orders' invoices (creating one if
// reconciliation hasn't run yet) once the bill is fully paid.
//
// payment_method is set to the 'Bill' sentinel rather than picking a
// "dominant" method: a bill's payments can be split across multiple methods
// (Split by Money), and an invoice only has one payment_method field, so
// picking one would misattribute the rest. The Payments tab reads the real
// per-method breakdown from the `payments` ledger directly instead of from
// these invoices — see GET /api/billing/payments.
const BILL_INVOICE_PAYMENT_METHOD = 'Bill'

async function syncInvoicesForPaidBill(
  bill: { restaurant_id: string; orders?: { id: string }[] },
  actorUserId: string
) {
  for (const order of bill.orders || []) {
    const { invoice } = await createInvoiceForOrder(order.id, bill.restaurant_id, actorUserId)
    if (!invoice || invoice.payment_status === 'paid') continue

    const { error: updateError } = await supabaseAdmin
      .from('invoices')
      .update({ payment_status: 'paid', payment_method: BILL_INVOICE_PAYMENT_METHOD, paid_at: new Date().toISOString() })
      .eq('id', invoice.id)

    if (updateError) {
      Sentry.captureException(updateError, { tags: { invoice_id: invoice.id, order_id: order.id } })
      console.error('[billing.payments] invoice sync error:', updateError.message)
    }
  }
}

export async function POST(request: Request) {
  let billId: string | undefined
  let restaurantId: string | undefined
  try {
    const body = await request.json()
    billId = body.billId
    restaurantId = body.restaurantId
    const amount = validatePrice(body.amount)
    const method = readTrimmedString(body.method, 40)

    if (!isUuid(billId) || !isUuid(restaurantId) || amount === null || amount <= 0 || !method) {
      return NextResponse.json({ error: 'Invalid payment payload' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const hasAccess = await hasRestaurantAccess(supabase, restaurantId, user.id)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { bill, error: loadError } = await loadBillDetail(billId)
    if (loadError) {
      Sentry.captureException(loadError, { tags: { bill_id: billId } })
      return NextResponse.json({ error: 'Could not load bill.' }, { status: 500 })
    }
    if (!bill || bill.restaurant_id !== restaurantId) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
    }
    if (bill.status === 'paid') {
      return NextResponse.json({ error: 'Bill is already fully paid' }, { status: 400 })
    }
    if (amount > bill.owed + ROUNDING_TOLERANCE) {
      return NextResponse.json({ error: `Amount exceeds the balance owed (${bill.owed.toFixed(2)})` }, { status: 400 })
    }

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .insert({
        bill_id: billId,
        restaurant_id: restaurantId,
        amount,
        method,
        recorded_by: user.id,
      })
      .select()
      .single()

    if (paymentError) {
      Sentry.captureException(paymentError, { tags: { bill_id: billId, restaurant_id: restaurantId } })
      console.error('[billing.payments.POST] insert error:', paymentError.message)
      return NextResponse.json({ error: 'Could not record payment.' }, { status: 500 })
    }

    void writeAuditLog(supabaseAdmin, {
      restaurantId,
      actorUserId: user.id,
      action: 'bill.payment_recorded',
      entityType: 'bill',
      entityId: billId,
      metadata: { payment_id: payment.id, amount, method },
    })

    const { bill: fullBill } = await loadBillDetail(billId)

    if (fullBill?.status === 'paid') {
      await syncInvoicesForPaidBill(fullBill, user.id)
    }

    return NextResponse.json({ bill: fullBill, payment })
  } catch (error) {
    Sentry.captureException(error, { tags: { bill_id: billId, restaurant_id: restaurantId } })
    console.error('[billing.payments.POST] error:', error)
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
  }
}
