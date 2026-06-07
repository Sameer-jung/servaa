import { supabaseAdmin } from '@/lib/supabase/admin'
import { hashTableAccessToken } from '@/utils/tableSession'
import { validateOrderItems, validatePrice } from '@/utils/validation'
import { writeAuditLog } from '@/utils/audit'

export type CreateOrderItemInput = NonNullable<ReturnType<typeof validateOrderItems>>[number]

export type CreateOrderResult =
  | { order: unknown; error: null; status: 200 }
  | { order: null; error: string; status: number }

interface CreateOrderInput {
  restaurantId: string
  tableId: string
  items: CreateOrderItemInput[]
  tableToken?: string | null
  customerSessionId?: string | null
  clientRequestId?: string | null
  actorUserId?: string | null
}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const {
    restaurantId,
    tableId,
    items,
    tableToken,
    customerSessionId,
    clientRequestId,
    actorUserId = null,
  } = input

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
    console.error('[createOrder] table lookup error:', tableError.message)
    return { order: null, error: 'Could not validate table.', status: 500 }
  }

  if (!table) {
    return { order: null, error: 'Table not found', status: 404 }
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
      return { order: existingOrder, error: null, status: 200 }
    }
  }

  const menuItemIds = Array.from(new Set(items.map((item) => item.menuItemId)))
  const { data: menuItems, error: menuError } = await supabaseAdmin
    .from('menu_items')
    .select('id, restaurant_id, price, available')
    .eq('restaurant_id', restaurantId)
    .in('id', menuItemIds)

  if (menuError) {
    console.error('[createOrder] menu lookup error:', menuError.message)
    return { order: null, error: 'Could not validate menu items.', status: 500 }
  }

  const menuItemsById = new Map((menuItems || []).map((item) => [item.id, item]))
  const allItemsAvailable = items.every((item) => menuItemsById.get(item.menuItemId)?.available)
  const hasValidPrices = (menuItems || []).every((item) => validatePrice(item.price) !== null)

  if (!allItemsAvailable || menuItemsById.size !== menuItemIds.length) {
    return { order: null, error: 'One or more items are unavailable', status: 400 }
  }

  if (!hasValidPrices) {
    console.error('[createOrder] invalid menu item price for restaurant:', restaurantId)
    return { order: null, error: 'Could not place order.', status: 500 }
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
      customer_session_id: customerSessionId || null,
    })
    .select()
    .single()

  if (orderError || !order) {
    if (orderError) console.error('[createOrder] order insert error:', orderError.message)
    return { order: null, error: 'Could not place order.', status: 500 }
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
    console.error('[createOrder] order items insert error:', itemsError.message)
    await supabaseAdmin.from('orders').delete().eq('id', order.id)
    return { order: null, error: 'Could not place order.', status: 500 }
  }

  void writeAuditLog(supabaseAdmin, {
    restaurantId,
    actorUserId,
    action: 'order.created',
    entityType: 'order',
    entityId: order.id,
    metadata: {
      table_id: tableId,
      item_count: insertedItems?.length || 0,
      total_amount: totalAmount,
    },
  })

  return {
    order: {
      ...order,
      total_amount: totalAmount,
      items: insertedItems || [],
    },
    error: null,
    status: 200,
  }
}
