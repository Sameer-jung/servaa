import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { hasBillableItems } from '@/utils/orders'
import { writeAuditLog } from '@/utils/audit'
import { hasRestaurantAccess } from '@/utils/roles'
import { clampInteger, isUuid, validatePrice } from '@/utils/validation'

const paymentStatuses = ['unpaid', 'paid', 'refunded'] as const
type PaymentStatus = (typeof paymentStatuses)[number]

function validatePaymentStatus(value: unknown): PaymentStatus | null {
  return typeof value === 'string' && paymentStatuses.includes(value as PaymentStatus)
    ? value as PaymentStatus
    : null
}

async function generateInvoiceNumber(restaurantId: string) {
  const now = new Date()
  const prefix = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('')

  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)

  const { count } = await supabaseAdmin
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .gte('created_at', startOfDay.toISOString())

  return `${prefix}-${String((count || 0) + 1).padStart(4, '0')}`
}

async function createInvoiceForOrder(orderId: string, restaurantId: string, actorUserId?: string | null) {
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('*, items:order_items(*, menu_item:menu_items(name))')
    .eq('id', orderId)
    .maybeSingle()

  if (orderError || !order) {
    if (orderError) console.error('[invoices] order lookup error:', orderError.message)
    return { invoice: null, error: 'Order not found', status: 404 }
  }

  if (order.restaurant_id !== restaurantId || !hasBillableItems(order)) {
    return { invoice: null, error: 'Order has no billable items', status: 400 }
  }

  const { data: existingInvoice, error: existingInvoiceError } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle()

  if (existingInvoiceError) {
    console.error('[invoices] existing invoice lookup error:', existingInvoiceError.message)
    return { invoice: null, error: 'Could not load invoice.', status: 500 }
  }

  if (existingInvoice) {
    return { invoice: existingInvoice, error: null, status: 200 }
  }

  const { data: restaurant, error: restaurantError } = await supabaseAdmin
    .from('restaurants')
    .select('tax_rate')
    .eq('id', restaurantId)
    .maybeSingle()

  if (restaurantError) {
    console.error('[invoices] restaurant lookup error:', restaurantError.message)
    return { invoice: null, error: 'Could not create invoice.', status: 500 }
  }

  const taxRate = Math.min(100, validatePrice(restaurant?.tax_rate) || 0)
  const subtotal = validatePrice(order.total_amount)
  if (subtotal === null) {
    console.error('[invoices] invalid order total for order:', orderId)
    return { invoice: null, error: 'Could not calculate invoice.', status: 500 }
  }

  const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100
  const grandTotal = Math.round((subtotal + taxAmount) * 100) / 100

  const { data: invoice, error: invoiceError } = await supabaseAdmin
    .from('invoices')
    .insert({
      restaurant_id: restaurantId,
      order_id: orderId,
      invoice_number: await generateInvoiceNumber(restaurantId),
      subtotal,
      tax_amount: taxAmount,
      grand_total: grandTotal,
      payment_status: 'unpaid',
    })
    .select()
    .single()

  if (invoiceError) {
    if (invoiceError.code === '23505') {
      // Concurrent insert won: unique constraint violation on order_id.
      const { data: concurrentInvoice } = await supabaseAdmin
        .from('invoices')
        .select('*')
        .eq('order_id', orderId)
        .maybeSingle()

      if (concurrentInvoice) {
        return { invoice: concurrentInvoice, error: null, status: 200 }
      }
    }
    
    console.error('[invoices] invoice insert error:', invoiceError.message)
    return { invoice: null, error: 'Could not create invoice.', status: 500 }
  }

  void writeAuditLog(supabaseAdmin, {
    restaurantId,
    actorUserId,
    action: 'invoice.created',
    entityType: 'invoice',
    entityId: invoice.id,
    metadata: {
      order_id: orderId,
      invoice_number: invoice.invoice_number,
      grand_total: grandTotal,
    },
  })

  return { invoice, error: null, status: 200 }
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
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const restaurantId = searchParams.get('restaurantId')
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

    await reconcileCompletedOrders(restaurantId)

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
      console.error('[invoices.GET] invoice query error:', error.message)
      return NextResponse.json({ error: 'Could not load invoices.' }, { status: 500 })
    }

    return NextResponse.json({ invoices: invoices || [] })
  } catch (error) {
    console.error('[invoices.GET] error:', error)
    return NextResponse.json({ error: 'Failed to load invoices' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { orderId, restaurantId } = await request.json()

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
    console.error('[invoices.POST] error:', error)
    return NextResponse.json(
      { error: 'Failed to generate invoice' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const { invoiceId, payment_status, payment_method } = await request.json()

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
      console.error('[invoices.PATCH] invoice lookup error:', invoiceError.message)
      return NextResponse.json({ error: 'Could not load invoice.' }, { status: 500 })
    }

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

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
    }

    return NextResponse.json({ invoice: updatedInvoice })
  } catch (error) {
    console.error('[invoices.PATCH] error:', error)
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
  }
}
