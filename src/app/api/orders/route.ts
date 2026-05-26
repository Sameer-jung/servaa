import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getBearerToken, hashTableAccessToken } from '@/utils/tableSession'
import { isUuid, readTrimmedString, validateOrderItems, validatePrice } from '@/utils/validation'
import { writeAuditLog } from '@/utils/audit'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const restaurantId = body?.restaurantId
    const tableId = body?.tableId
    const items = validateOrderItems(body?.items)
    const clientRequestId = readTrimmedString(body?.clientRequestId, 128)
    const tableToken = readTrimmedString(body?.tableToken, 256) || getBearerToken(request)

    if (!isUuid(restaurantId) || !isUuid(tableId) || !items) {
      return NextResponse.json({ error: 'Invalid order payload' }, { status: 400 })
    }

    const tableQuery = supabaseAdmin
      .from('tables')
      .select('id, restaurant_id, is_active')
      .eq('id', tableId)
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)

    if (tableToken) {
      tableQuery.eq('qr_token_hash', hashTableAccessToken(tableToken))
    }

    const { data: table, error: tableError } = await tableQuery.maybeSingle()

    if (tableError) {
      console.error('[orders.POST] table lookup error:', tableError.message)
      return NextResponse.json({ error: 'Could not validate table.' }, { status: 500 })
    }

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 })
    }

    if (clientRequestId) {
      const { data: existingOrder } = await supabaseAdmin
        .from('orders')
        .select('*, items:order_items(*, menu_item:menu_items(*))')
        .eq('restaurant_id', restaurantId)
        .eq('table_id', tableId)
        .eq('client_request_id', clientRequestId)
        .maybeSingle()

      if (existingOrder) {
        return NextResponse.json({ order: existingOrder })
      }
    }

    const menuItemIds = Array.from(new Set(items.map((item) => item.menuItemId)))
    const { data: menuItems, error: menuError } = await supabaseAdmin
      .from('menu_items')
      .select('id, restaurant_id, price, available')
      .eq('restaurant_id', restaurantId)
      .in('id', menuItemIds)

    if (menuError) {
      console.error('[orders.POST] menu lookup error:', menuError.message)
      return NextResponse.json({ error: 'Could not validate menu items.' }, { status: 500 })
    }

    const menuItemsById = new Map((menuItems || []).map((item) => [item.id, item]))
    const allItemsAvailable = items.every((item) => menuItemsById.get(item.menuItemId)?.available)
    const hasValidPrices = (menuItems || []).every((item) => validatePrice(item.price) !== null)

    if (!allItemsAvailable || menuItemsById.size !== menuItemIds.length) {
      return NextResponse.json({ error: 'One or more items are unavailable' }, { status: 400 })
    }

    if (!hasValidPrices) {
      console.error('[orders.POST] invalid menu item price for restaurant:', restaurantId)
      return NextResponse.json({ error: 'Could not place order.' }, { status: 500 })
    }

    const totalAmount = Math.round(items.reduce((total, item) => {
      const menuItem = menuItemsById.get(item.menuItemId)
      return total + (validatePrice(menuItem?.price) || 0) * item.quantity
    }, 0) * 100) / 100

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        restaurant_id: restaurantId,
        table_id: tableId,
        status: 'pending',
        total_amount: totalAmount,
        client_request_id: clientRequestId,
        customer_session_id: tableToken ? hashTableAccessToken(tableToken) : null,
      })
      .select()
      .single()

    if (orderError || !order) {
      if (orderError) console.error('[orders.POST] order insert error:', orderError.message)
      return NextResponse.json({ error: 'Could not place order.' }, { status: 500 })
    }

    const orderItems = items.map((item) => ({
      order_id: order.id,
      menu_item_id: item.menuItemId,
      quantity: item.quantity,
      price_snapshot: validatePrice(menuItemsById.get(item.menuItemId)?.price) || 0,
      notes: item.notes,
    }))

    const { data: insertedItems, error: itemsError } = await supabaseAdmin
      .from('order_items')
      .insert(orderItems)
      .select('*, menu_item:menu_items(*)')

    if (itemsError) {
      console.error('[orders.POST] order items insert error:', itemsError.message)
      await supabaseAdmin.from('orders').delete().eq('id', order.id)
      return NextResponse.json({ error: 'Could not place order.' }, { status: 500 })
    }

    void writeAuditLog(supabaseAdmin, {
      restaurantId,
      actorUserId: null,
      action: 'order.created',
      entityType: 'order',
      entityId: order.id,
      metadata: {
        table_id: tableId,
        item_count: insertedItems?.length || 0,
        total_amount: totalAmount,
      },
    })

    return NextResponse.json({
      order: {
        ...order,
        total_amount: totalAmount,
        items: insertedItems || [],
      },
    })
  } catch (error) {
    console.error('[orders.POST] error:', error)
    return NextResponse.json({ error: 'Failed to place order' }, { status: 500 })
  }
}
