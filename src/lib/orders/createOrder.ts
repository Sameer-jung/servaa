import { supabaseAdmin } from '@/lib/supabase/admin'
import { hashTableAccessToken } from '@/utils/tableSession'
import { isTableSessionActive } from '@/lib/tableSessions'
import { validateOrderItems, validatePrice } from '@/utils/validation'
import { writeAuditLog } from '@/utils/audit'
import { calculateItemTotal } from '@/utils/pricing'
import type { Modifier } from '@/types'

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

type ModifierGroupRecord = {
  id: string
  menu_item_id: string
  is_required: boolean
  is_multiselect: boolean
  modifiers?: {
    id: string
    name: string
    price: number
  }[]
}

type ModifierRecord = NonNullable<ModifierGroupRecord['modifiers']>[number]

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

  // Staff orders are authenticated separately (actorUserId + RBAC) and never
  // carry a table token. Customer orders must always present a valid token —
  // without this check, anyone could place an order under any table's
  // identity just by changing ?table=<number> in the URL.
  if (!tableToken && !actorUserId) {
    return { order: null, error: 'Missing table access token', status: 401 }
  }

  // Suspension must actually stop orders, not just hide the menu — this is
  // the canonical path for both customer and staff order creation, so the
  // check lives here rather than duplicated per caller.
  const { data: restaurant, error: restaurantError } = await supabaseAdmin
    .from('restaurants')
    .select('id, is_active')
    .eq('id', restaurantId)
    .maybeSingle()

  if (restaurantError) {
    console.error('[createOrder] restaurant lookup error:', restaurantError.message)
    return { order: null, error: 'Could not validate restaurant.', status: 500 }
  }

  if (!restaurant || !restaurant.is_active) {
    return { order: null, error: 'This restaurant is not currently accepting orders.', status: 403 }
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
    console.error('[createOrder] table lookup error:', tableError.message)
    return { order: null, error: 'Could not validate table.', status: 500 }
  }

  if (!table) {
    return { order: null, error: 'Table not found', status: 404 }
  }

  // Checked before the session-expiry gate below: client_request_id exists
  // specifically so a dropped-response retry returns the order that was
  // already created, rather than erroring — that guarantee must hold even if
  // the customer's ordering window has since lapsed between the original
  // attempt and the retry.
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

  // Customer orders additionally require an active 20-hour ordering window
  // (see database/013_table_session_expiry.sql) on top of the table token
  // check above — staff orders (actorUserId set) are exempt, same as the
  // table-token requirement itself. Placed after the idempotency check above
  // so it only gates genuinely new orders, never a retry of one already made.
  if (!actorUserId) {
    const sessionActive = await isTableSessionActive(supabaseAdmin, table.id, customerSessionId)
    if (!sessionActive) {
      return { order: null, error: 'TABLE_SESSION_EXPIRED', status: 410 }
    }
  }

  const menuItemIds = Array.from(new Set(items.map((item) => item.menuItemId)))
  const { data: menuItems, error: menuError } = await supabaseAdmin
    .from('menu_items')
    .select('id, restaurant_id, price, available, name')
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

  const { data: modifierGroups, error: modifierError } = await supabaseAdmin
    .from('modifier_groups')
    .select('id, menu_item_id, is_required, is_multiselect, modifiers(id, name, price)')
    .eq('restaurant_id', restaurantId)
    .in('menu_item_id', menuItemIds)

  if (modifierError) {
    console.error('[createOrder] modifier lookup error:', modifierError.message)
    return { order: null, error: 'Could not validate modifiers.', status: 500 }
  }

  const groupsByMenuItemId = new Map<string, ModifierGroupRecord[]>()
  for (const group of ((modifierGroups || []) as ModifierGroupRecord[])) {
    const groups = groupsByMenuItemId.get(group.menu_item_id) || []
    groups.push(group)
    groupsByMenuItemId.set(group.menu_item_id, groups)
  }

  const verifiedModifiersByItem = new Map<CreateOrderItemInput, Modifier[]>()

  for (const item of items) {
    const groups = groupsByMenuItemId.get(item.menuItemId) || []
    const selectedModifierIds = item.modifiers.map((modifier) => modifier.id)
    const selectedCountsByGroupId = new Map<string, number>()
    const verifiedModifiers: Modifier[] = []

    for (const modifierId of selectedModifierIds) {
      let matchedGroup: ModifierGroupRecord | null = null
      let matchedModifier: ModifierRecord | null = null

      for (const group of groups) {
        const modifier = group.modifiers?.find((candidate) => candidate.id === modifierId)
        if (modifier) {
          matchedGroup = group
          matchedModifier = modifier
          break
        }
      }

      if (!matchedGroup || !matchedModifier || validatePrice(matchedModifier.price) === null) {
        return { order: null, error: 'One or more modifiers are unavailable', status: 400 }
      }

      selectedCountsByGroupId.set(
        matchedGroup.id,
        (selectedCountsByGroupId.get(matchedGroup.id) || 0) + 1
      )

      verifiedModifiers.push({
        id: matchedModifier.id,
        name: matchedModifier.name,
        price: validatePrice(matchedModifier.price) || 0,
        group_is_required: matchedGroup.is_required,
        group_is_multiselect: matchedGroup.is_multiselect,
      })
    }

    const hasDuplicateModifier = new Set(selectedModifierIds).size !== selectedModifierIds.length
    const missingRequiredGroup = groups.some(
      (group) => !actorUserId && group.is_required && !selectedCountsByGroupId.get(group.id)
    )
    const invalidSingleSelectGroup = groups.some(
      (group) => !group.is_multiselect && (selectedCountsByGroupId.get(group.id) || 0) > 1
    )

    if (hasDuplicateModifier || missingRequiredGroup || invalidSingleSelectGroup) {
      return { order: null, error: 'Invalid modifier selection', status: 400 }
    }

    verifiedModifiersByItem.set(item, verifiedModifiers)
  }

  const totalAmount = Math.round(items.reduce((total, item) => {
    const menuItem = menuItemsById.get(item.menuItemId)
    const verifiedModifiers = verifiedModifiersByItem.get(item) || []
    const itemTotal = calculateItemTotal(validatePrice(menuItem?.price) || 0, verifiedModifiers)
    return total + itemTotal * item.quantity
  }, 0) * 100) / 100

  const orderItemsPayload = items.map((item) => {
    const menuItem = menuItemsById.get(item.menuItemId)
    const verifiedModifiers = verifiedModifiersByItem.get(item) || []
    const itemTotal = calculateItemTotal(validatePrice(menuItem?.price) || 0, verifiedModifiers)

    return {
      menu_item_id: item.menuItemId,
      item_name_snapshot: menuItem?.name || '',
      quantity: item.quantity,
      price_snapshot: itemTotal,
      notes: item.notes,
      modifiers: verifiedModifiers,
    }
  })

  // Order + items are inserted together inside this function call so they
  // commit or roll back as one unit — see database/006_atomic_order_creation.sql.
  const { data: orderId, error: createError } = await supabaseAdmin.rpc('create_order_with_items', {
    p_restaurant_id: restaurantId,
    p_table_id: tableId,
    p_total_amount: totalAmount,
    p_client_request_id: clientRequestId,
    p_customer_session_id: customerSessionId || null,
    p_items: orderItemsPayload,
  })

  if (createError || !orderId) {
    if (createError) console.error('[createOrder] order creation error:', createError.message)
    return { order: null, error: 'Could not place order.', status: 500 }
  }

  const { data: order, error: fetchError } = await supabaseAdmin
    .from('orders')
    .select('*, items:order_items(*, menu_item:menu_items(*))')
    .eq('id', orderId)
    .single()

  if (fetchError || !order) {
    console.error('[createOrder] order fetch error:', fetchError?.message)
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
      item_count: order.items?.length || 0,
      total_amount: totalAmount,
    },
  })

  return {
    order,
    error: null,
    status: 200,
  }
}
