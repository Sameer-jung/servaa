import * as Sentry from '@sentry/nextjs'
import '@/lib/sentry'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { hasBillableItems } from '@/utils/orders'
import { writeAuditLog } from '@/utils/audit'
import { validatePrice } from '@/utils/validation'

export async function generateInvoiceNumber(restaurantId: string) {
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

export async function createInvoiceForOrder(orderId: string, restaurantId: string, actorUserId?: string | null) {
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('*, items:order_items(*, menu_item:menu_items(name))')
    .eq('id', orderId)
    .maybeSingle()

  if (orderError || !order) {
    if (orderError) {
      Sentry.captureException(orderError, { tags: { order_id: orderId, restaurant_id: restaurantId } })
      console.error('[invoices] order lookup error:', orderError.message)
    }
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
    Sentry.captureException(existingInvoiceError, { tags: { order_id: orderId, restaurant_id: restaurantId } })
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
    Sentry.captureException(restaurantError, { tags: { order_id: orderId, restaurant_id: restaurantId } })
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

    Sentry.captureException(invoiceError, { tags: { order_id: orderId, restaurant_id: restaurantId } })
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
