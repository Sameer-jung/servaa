import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/utils/audit'
import { hasRestaurantAccess, isOwner } from '@/utils/roles'
import {
  clampInteger,
  isUuid,
  readTrimmedString,
  validatePrice,
  validateQuantity,
  validateSignedQuantity,
  validateStockMovementType,
} from '@/utils/validation'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const restaurantId = searchParams.get('restaurantId')
    const inventoryItemId = searchParams.get('inventoryItemId')
    const page = clampInteger(searchParams.get('page') || 0, 0, 10000)
    const pageSize = clampInteger(searchParams.get('pageSize') || 50, 1, 100)

    if (!isUuid(restaurantId) || page === null || pageSize === null) {
      return NextResponse.json({ error: 'Invalid movements query' }, { status: 400 })
    }
    if (inventoryItemId && !isUuid(inventoryItemId)) {
      return NextResponse.json({ error: 'Invalid item id' }, { status: 400 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const hasAccess = await hasRestaurantAccess(supabase, restaurantId, user.id)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const from = page * pageSize
    const to = from + pageSize - 1

    let query = supabaseAdmin
      .from('stock_movements')
      .select('*, inventory_item:inventory_items(name, unit)')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })

    if (inventoryItemId) {
      query = query.eq('inventory_item_id', inventoryItemId)
    }

    const { data: movements, error } = await query.range(from, to)

    if (error) {
      console.error('[inventory.movements.GET] query error:', error.message)
      return NextResponse.json({ error: 'Could not load movements.' }, { status: 500 })
    }

    return NextResponse.json({ movements: movements || [] })
  } catch (error) {
    console.error('[inventory.movements.GET] error:', error)
    return NextResponse.json({ error: 'Failed to load movements' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { restaurantId, inventoryItemId } = body

    if (!isUuid(restaurantId) || !isUuid(inventoryItemId)) {
      return NextResponse.json({ error: 'Invalid movement payload' }, { status: 400 })
    }

    const movementType = validateStockMovementType(body.movement_type)
    if (!movementType) {
      return NextResponse.json({ error: 'Invalid movement type' }, { status: 400 })
    }

    const note = body.note ? readTrimmedString(body.note, 300) : null
    const unitCost = body.unit_cost == null || body.unit_cost === ''
      ? null
      : validatePrice(body.unit_cost)
    if (body.unit_cost != null && body.unit_cost !== '' && unitCost === null) {
      return NextResponse.json({ error: 'Invalid unit cost' }, { status: 400 })
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

    // Load the item to validate ownership and to compute count deltas.
    const { data: item, error: itemError } = await supabaseAdmin
      .from('inventory_items')
      .select('id, restaurant_id, name, unit, current_quantity')
      .eq('id', inventoryItemId)
      .maybeSingle()

    if (itemError) {
      console.error('[inventory.movements.POST] item lookup error:', itemError.message)
      return NextResponse.json({ error: 'Could not load item.' }, { status: 500 })
    }
    if (!item || item.restaurant_id !== restaurantId) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    // Resolve the signed delta from the movement type + payload.
    let delta: number | null = null
    if (movementType === 'purchase') {
      const qty = validateQuantity(body.quantity)
      if (qty === null || qty <= 0) {
        return NextResponse.json({ error: 'Quantity must be greater than 0' }, { status: 400 })
      }
      delta = qty
    } else if (movementType === 'usage' || movementType === 'wastage') {
      const qty = validateQuantity(body.quantity)
      if (qty === null || qty <= 0) {
        return NextResponse.json({ error: 'Quantity must be greater than 0' }, { status: 400 })
      }
      delta = -qty
    } else if (movementType === 'adjustment') {
      delta = validateSignedQuantity(body.quantity_delta)
      if (delta === null || delta === 0) {
        return NextResponse.json({ error: 'Adjustment must be a non-zero amount' }, { status: 400 })
      }
    } else if (movementType === 'count') {
      const counted = validateQuantity(body.counted_quantity)
      if (counted === null) {
        return NextResponse.json({ error: 'Invalid counted quantity' }, { status: 400 })
      }
      delta = Math.round((counted - Number(item.current_quantity)) * 1000) / 1000
    }

    if (delta === null) {
      return NextResponse.json({ error: 'Could not resolve movement' }, { status: 400 })
    }

    // Stock can never go below zero. 'count' sets an absolute (already validated
    // >= 0); reducing movements must not exceed what is on hand.
    const projected = Math.round((Number(item.current_quantity) + delta) * 1000) / 1000
    if (projected < 0) {
      return NextResponse.json(
        { error: `Only ${Number(item.current_quantity)} ${item.unit} in stock — cannot remove more.` },
        { status: 400 }
      )
    }

    // Optional purchase -> expense bridge. Restricted to owners since expenses
    // are owner-only financial data; staff can still record the stock movement.
    let expenseId: string | null = null
    const wantsExpense = movementType === 'purchase' && body.createExpense === true && unitCost != null
    if (wantsExpense) {
      const actorIsOwner = await isOwner(supabase, restaurantId, user.id)
      if (actorIsOwner) {
        const amount = Math.round(delta * unitCost * 100) / 100
        const paymentMethod =
          body.payment_method === 'Cash' || body.payment_method === 'Online'
            ? body.payment_method
            : null
        const { data: expense, error: expenseError } = await supabaseAdmin
          .from('expenses')
          .insert({
            restaurant_id: restaurantId,
            category: 'ingredients',
            amount,
            vendor: body.vendor ? readTrimmedString(body.vendor, 120) : null,
            payment_method: paymentMethod,
            note,
            source: 'inventory_purchase',
            created_by: user.id,
          })
          .select('id')
          .single()

        if (expenseError) {
          console.error('[inventory.movements.POST] expense insert error:', expenseError.message)
          return NextResponse.json({ error: 'Could not record expense.' }, { status: 500 })
        }
        expenseId = expense.id
      }
    }

    const { data: movement, error: movementError } = await supabaseAdmin
      .from('stock_movements')
      .insert({
        restaurant_id: restaurantId,
        inventory_item_id: inventoryItemId,
        movement_type: movementType,
        quantity_delta: delta,
        unit_cost: unitCost,
        note,
        expense_id: expenseId,
        actor_user_id: user.id,
      })
      .select('*, inventory_item:inventory_items(name, unit, current_quantity)')
      .single()

    if (movementError) {
      console.error('[inventory.movements.POST] insert error:', movementError.message)
      // Roll back the bridged expense so we don't leave an orphan.
      if (expenseId) {
        await supabaseAdmin.from('expenses').delete().eq('id', expenseId)
      }
      return NextResponse.json({ error: 'Could not record movement.' }, { status: 500 })
    }

    // Keep cost_per_unit fresh on purchases so stock valuation stays useful.
    if (movementType === 'purchase' && unitCost != null) {
      await supabaseAdmin
        .from('inventory_items')
        .update({ cost_per_unit: unitCost })
        .eq('id', inventoryItemId)
    }

    void writeAuditLog(supabaseAdmin, {
      restaurantId,
      actorUserId: user.id,
      action: 'inventory.movement.created',
      entityType: 'stock_movement',
      entityId: movement.id,
      metadata: {
        inventory_item_id: inventoryItemId,
        movement_type: movementType,
        quantity_delta: delta,
        expense_id: expenseId,
      },
    })

    return NextResponse.json({ movement })
  } catch (error) {
    console.error('[inventory.movements.POST] error:', error)
    return NextResponse.json({ error: 'Failed to record movement' }, { status: 500 })
  }
}
