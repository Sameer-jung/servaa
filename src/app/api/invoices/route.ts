import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasBillableItems } from '@/utils/orders'

export async function POST(request: Request) {
  try {
    const { orderId, restaurantId } = await request.json()

    const supabase = await createClient()

    // Verify user has access
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get order with items
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, items:order_items(*, menu_item:menu_items(name))')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.restaurant_id !== restaurantId || !hasBillableItems(order)) {
      return NextResponse.json({ error: 'Order First' }, { status: 400 })
    }

    // Get restaurant tax rate
    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('tax_rate')
      .eq('id', restaurantId)
      .single()

    const taxRate = restaurant?.tax_rate || 0
    const subtotal = order.total_amount
    const taxAmount = subtotal * (taxRate / 100)
    const grandTotal = subtotal + taxAmount

    // Create invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        restaurant_id: restaurantId,
        order_id: orderId,
        subtotal,
        tax_amount: taxAmount,
        grand_total: grandTotal,
        payment_status: 'unpaid',
      })
      .select()
      .single()

    if (invoiceError) {
      return NextResponse.json({ error: invoiceError.message }, { status: 500 })
    }

    return NextResponse.json({ invoice })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate invoice' },
      { status: 500 }
    )
  }
}
