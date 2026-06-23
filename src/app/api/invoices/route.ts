import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import '@/lib/sentry'
import { getPostHogServerClient } from '@/lib/posthog/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/utils/audit'
import { hasRestaurantAccess } from '@/utils/roles'
import { clampInteger, isUuid } from '@/utils/validation'
import { createInvoiceForOrder } from '@/lib/invoices/createInvoiceForOrder'

const paymentStatuses = ['unpaid', 'paid', 'refunded'] as const
type PaymentStatus = (typeof paymentStatuses)[number]

function validatePaymentStatus(value: unknown): PaymentStatus | null {
  return typeof value === 'string' && paymentStatuses.includes(value as PaymentStatus)
    ? value as PaymentStatus
    : null
}

async function reconcileCompletedOrders(restaurantId: string) {
  const [
    { data: completedOrders, error: completedOrdersError },
    { data: existingInvoices, error: existingInvoicesError },
  ] = await Promise.all([
    supabaseAdmin
      .from('orders')
      .select('id, items:order_items(id)')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(100),
    supabaseAdmin
      .from('invoices')
      .select('order_id')
      .eq('restaurant_id', restaurantId),
  ])

  if (completedOrdersError || existingInvoicesError) {
    console.error(
      '[invoices] reconcile query error:',
      completedOrdersError?.message || existingInvoicesError?.message
    )
    throw new Error('Could not reconcile invoices')
  }

  const invoicedOrderIds = new Set((existingInvoices || []).map((invoice) => invoice.order_id))
  const missingInvoiceOrders = (completedOrders || []).filter((order) => {
    const items = Array.isArray(order.items) ? order.items : []
    return items.length > 0 && !invoicedOrderIds.has(order.id)
  })

  const results = await Promise.all(
    missingInvoiceOrders.map((order) => createInvoiceForOrder(order.id, restaurantId, null))
  )

  const failed = results.find((result) => result.error)
  if (failed?.error) {
    throw new Error(failed.error)
  }
}

export async function GET(request: Request) {
  let restaurantId: string | null = null
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    restaurantId = searchParams.get('restaurantId')
    const paymentStatus = searchParams.get('paymentStatus')
    const page = clampInteger(searchParams.get('page') || 0, 0, 10000)
    const pageSize = clampInteger(searchParams.get('pageSize') || 20, 1, 50)

    if (!isUuid(restaurantId) || page === null || pageSize === null) {
      return NextResponse.json({ error: 'Invalid invoice query' }, { status: 400 })
    }

    const from = page * pageSize
    const to = from + pageSize - 1

    const cleanPaymentStatus = paymentStatus ? validatePaymentStatus(paymentStatus) : null
    if (paymentStatus && !cleanPaymentStatus) {
      return NextResponse.json({ error: 'Invalid payment status' }, { status: 400 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const hasAccess = await hasRestaurantAccess(supabase, restaurantId, user.id)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Fire-and-forget: do not block the GET response on reconciliation
    void reconcileCompletedOrders(restaurantId).catch((e) => {
      Sentry.captureException(e, { tags: { restaurant_id: restaurantId } })
      console.error('[invoices.GET] reconcile error:', e)
    })

    let query = supabaseAdmin
      .from('invoices')
      .select('*, order:orders(*, table:tables(table_number), items:order_items(*, menu_item:menu_items(name)))')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })

    if (cleanPaymentStatus) {
      query = query.eq('payment_status', cleanPaymentStatus)
    }

    const { data: invoices, error } = await query.range(from, to)

    if (error) {
      Sentry.captureException(error, { tags: { restaurant_id: restaurantId } })
      console.error('[invoices.GET] invoice query error:', error.message)
      return NextResponse.json({ error: 'Could not load invoices.' }, { status: 500 })
    }

    return NextResponse.json({ invoices: invoices || [] })
  } catch (error) {
    Sentry.captureException(error, { tags: { restaurant_id: restaurantId } })
    console.error('[invoices.GET] error:', error)
    return NextResponse.json({ error: 'Failed to load invoices' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  let orderId: string | undefined
  let restaurantId: string | undefined
  try {
    const body = await request.json()
    orderId = body.orderId
    restaurantId = body.restaurantId

    if (!isUuid(orderId) || !isUuid(restaurantId)) {
      return NextResponse.json({ error: 'Invalid invoice payload' }, { status: 400 })
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

    const result = await createInvoiceForOrder(orderId, restaurantId, user.id)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ invoice: result.invoice })
  } catch (error) {
    Sentry.captureException(error, { tags: { order_id: orderId, restaurant_id: restaurantId } })
    console.error('[invoices.POST] error:', error)
    return NextResponse.json(
      { error: 'Failed to generate invoice' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  let invoiceId: string | undefined
  let restaurantId: string | undefined
  try {
    const body = await request.json()
    invoiceId = body.invoiceId
    const { payment_status, payment_method } = body

    const cleanPaymentStatus = validatePaymentStatus(payment_status)

    if (!isUuid(invoiceId) || !cleanPaymentStatus) {
      return NextResponse.json({ error: 'Invalid invoice update' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('id, restaurant_id')
      .eq('id', invoiceId)
      .maybeSingle()

    if (invoiceError) {
      Sentry.captureException(invoiceError, { tags: { invoice_id: invoiceId } })
      console.error('[invoices.PATCH] invoice lookup error:', invoiceError.message)
      return NextResponse.json({ error: 'Could not load invoice.' }, { status: 500 })
    }

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    restaurantId = invoice.restaurant_id

    const hasAccess = await hasRestaurantAccess(supabase, invoice.restaurant_id, user.id)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const updates = {
      payment_status: cleanPaymentStatus,
      payment_method: payment_method || null,
      paid_at: cleanPaymentStatus === 'paid' ? new Date().toISOString() : null,
    }

    const { data: updatedInvoice, error: updateError } = await supabaseAdmin
      .from('invoices')
      .update(updates)
      .eq('id', invoiceId)
      .select()
      .single()

    if (updateError) {
      Sentry.captureException(updateError, { tags: { invoice_id: invoiceId, restaurant_id: restaurantId } })
      console.error('[invoices.PATCH] invoice update error:', updateError.message)
      return NextResponse.json({ error: 'Could not update invoice.' }, { status: 500 })
    }

    if (cleanPaymentStatus === 'paid') {
      void writeAuditLog(supabaseAdmin, {
        restaurantId: invoice.restaurant_id,
        actorUserId: user.id,
        action: 'invoice.marked_paid',
        entityType: 'invoice',
        entityId: invoiceId,
        metadata: {
          payment_status: cleanPaymentStatus,
          payment_method: payment_method || null,
        },
      })

      const posthogClient = getPostHogServerClient()
      if (posthogClient) {
        posthogClient.capture({
          distinctId: user.id,
          event: 'payment_completed',
          properties: {
            restaurant_id: invoice.restaurant_id,
            invoice_id: invoiceId,
            payment_method: payment_method || null,
            source: 'server',
          },
          groups: { restaurant: invoice.restaurant_id },
        })
        // flushAt: 1 queues a flush automatically, but in serverless environments
        // the function can terminate before that in-flight request completes —
        // await it explicitly so the event is actually delivered.
        await posthogClient.flush()
      }
    }

    return NextResponse.json({ invoice: updatedInvoice })
  } catch (error) {
    Sentry.captureException(error, { tags: { invoice_id: invoiceId, restaurant_id: restaurantId } })
    console.error('[invoices.PATCH] error:', error)
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
  }
}
