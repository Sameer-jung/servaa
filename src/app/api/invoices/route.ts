import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { hasBillableItems } from '@/utils/orders'

async function verifyRestaurantAccess(userId: string, restaurantId: string) {
  const supabase = await createClient()

  const { data: ownedRestaurant } = await supabase
    .from('restaurants')
    .select('id')
    .eq('id', restaurantId)
    .eq('owner_id', userId)
    .maybeSingle()

  if (ownedRestaurant) return true

  const { data: staffMember } = await supabase
    .from('staff_members')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  return Boolean(staffMember)
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

async function createInvoiceForOrder(orderId: string, restaurantId: string) {
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('*, items:order_items(*, menu_item:menu_items(name))')
    .eq('id', orderId)
    .maybeSingle()

  if (orderError || !order) {
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
    return { invoice: null, error: existingInvoiceError.message, status: 500 }
  }

  if (existingInvoice) {
    return { invoice: existingInvoice, error: null, status: 200 }
  }

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('tax_rate')
    .eq('id', restaurantId)
    .maybeSingle()

  const taxRate = restaurant?.tax_rate || 0
  const subtotal = Number(order.total_amount || 0)
  const taxAmount = subtotal * (taxRate / 100)
  const grandTotal = subtotal + taxAmount

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
    return { invoice: null, error: invoiceError.message, status: 500 }
  }

  return { invoice, error: null, status: 200 }
}

async function reconcileCompletedOrders(restaurantId: string) {
  const [{ data: completedOrders }, { data: existingInvoices }] = await Promise.all([
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

  const invoicedOrderIds = new Set((existingInvoices || []).map((invoice) => invoice.order_id))
  const missingInvoiceOrders = (completedOrders || []).filter((order) => {
    const items = Array.isArray(order.items) ? order.items : []
    return items.length > 0 && !invoicedOrderIds.has(order.id)
  })

  const results = await Promise.all(
    missingInvoiceOrders.map((order) => createInvoiceForOrder(order.id, restaurantId))
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
    const page = Math.max(0, Number(searchParams.get('page') || 0))
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize') || 20)))
    const from = page * pageSize
    const to = from + pageSize - 1

    if (!restaurantId) {
      return NextResponse.json({ error: 'Missing restaurantId' }, { status: 400 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const hasAccess = await verifyRestaurantAccess(user.id, restaurantId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await reconcileCompletedOrders(restaurantId)

    let query = supabaseAdmin
      .from('invoices')
      .select('*, order:orders(*, table:tables(table_number), items:order_items(*, menu_item:menu_items(name)))')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })

    if (paymentStatus) {
      query = query.eq('payment_status', paymentStatus)
    }

    const { data: invoices, error } = await query.range(from, to)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ invoices: invoices || [] })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load invoices'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { orderId, restaurantId } = await request.json()

    if (!orderId || !restaurantId) {
      return NextResponse.json({ error: 'Missing orderId or restaurantId' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const hasAccess = await verifyRestaurantAccess(user.id, restaurantId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await createInvoiceForOrder(orderId, restaurantId)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ invoice: result.invoice })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate invoice' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const { invoiceId, payment_status } = await request.json()

    if (!invoiceId || !payment_status) {
      return NextResponse.json({ error: 'Missing invoiceId or payment_status' }, { status: 400 })
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
      return NextResponse.json({ error: invoiceError.message }, { status: 500 })
    }

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const hasAccess = await verifyRestaurantAccess(user.id, invoice.restaurant_id)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const updates = {
      payment_status,
      paid_at: payment_status === 'paid' ? new Date().toISOString() : null,
    }

    const { data: updatedInvoice, error: updateError } = await supabaseAdmin
      .from('invoices')
      .update(updates)
      .eq('id', invoiceId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ invoice: updatedInvoice })
  } catch {
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
  }
}
