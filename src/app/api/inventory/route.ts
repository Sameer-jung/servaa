import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/utils/audit'
import { hasRestaurantAccess } from '@/utils/roles'
import {
  isUuid,
  readTrimmedString,
  validateInventoryUnit,
  validatePrice,
  validateQuantity,
} from '@/utils/validation'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const restaurantId = searchParams.get('restaurantId')
    const lowStockOnly = searchParams.get('lowStock') === 'true'

    if (!isUuid(restaurantId)) {
      return NextResponse.json({ error: 'Invalid inventory query' }, { status: 400 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const hasAccess = await hasRestaurantAccess(supabase, restaurantId, user.id)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: items, error } = await supabaseAdmin
      .from('inventory_items')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (error) {
      console.error('[inventory.GET] query error:', error.message)
      return NextResponse.json({ error: 'Could not load inventory.' }, { status: 500 })
    }

    const result = lowStockOnly
      ? (items || []).filter(
          (item) => item.reorder_threshold > 0 && item.current_quantity <= item.reorder_threshold
        )
      : items || []

    return NextResponse.json({ items: result })
  } catch (error) {
    console.error('[inventory.GET] error:', error)
    return NextResponse.json({ error: 'Failed to load inventory' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { restaurantId } = body

    if (!isUuid(restaurantId)) {
      return NextResponse.json({ error: 'Invalid inventory payload' }, { status: 400 })
    }

    const name = readTrimmedString(body.name, 120)
    const unit = validateInventoryUnit(body.unit)
    const reorderThreshold = validateQuantity(body.reorder_threshold ?? 0)
    const costPerUnit = body.cost_per_unit == null || body.cost_per_unit === ''
      ? null
      : validatePrice(body.cost_per_unit)
    const category = body.category ? readTrimmedString(body.category, 60) : null

    if (!name || !unit || reorderThreshold === null) {
      return NextResponse.json({ error: 'Invalid inventory item' }, { status: 400 })
    }
    if (body.cost_per_unit != null && body.cost_per_unit !== '' && costPerUnit === null) {
      return NextResponse.json({ error: 'Invalid cost per unit' }, { status: 400 })
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

    const { data: item, error } = await supabaseAdmin
      .from('inventory_items')
      .insert({
        restaurant_id: restaurantId,
        name,
        unit,
        category,
        reorder_threshold: reorderThreshold,
        cost_per_unit: costPerUnit,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'An item with this name already exists.' }, { status: 409 })
      }
      console.error('[inventory.POST] insert error:', error.message)
      return NextResponse.json({ error: 'Could not create item.' }, { status: 500 })
    }

    void writeAuditLog(supabaseAdmin, {
      restaurantId,
      actorUserId: user.id,
      action: 'inventory.item.created',
      entityType: 'inventory_item',
      entityId: item.id,
      metadata: { name, unit },
    })

    return NextResponse.json({ item })
  } catch (error) {
    console.error('[inventory.POST] error:', error)
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { itemId, restaurantId } = body

    if (!isUuid(itemId) || !isUuid(restaurantId)) {
      return NextResponse.json({ error: 'Invalid inventory update' }, { status: 400 })
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

    // Build a whitelist of editable metadata fields. current_quantity is never
    // editable here — it is maintained by the stock_movements ledger trigger.
    const updates: Record<string, unknown> = {}

    if (body.name !== undefined) {
      const name = readTrimmedString(body.name, 120)
      if (!name) return NextResponse.json({ error: 'Invalid name' }, { status: 400 })
      updates.name = name
    }
    if (body.unit !== undefined) {
      const unit = validateInventoryUnit(body.unit)
      if (!unit) return NextResponse.json({ error: 'Invalid unit' }, { status: 400 })
      updates.unit = unit
    }
    if (body.category !== undefined) {
      updates.category = body.category ? readTrimmedString(body.category, 60) : null
    }
    if (body.reorder_threshold !== undefined) {
      const threshold = validateQuantity(body.reorder_threshold)
      if (threshold === null) return NextResponse.json({ error: 'Invalid threshold' }, { status: 400 })
      updates.reorder_threshold = threshold
    }
    if (body.cost_per_unit !== undefined) {
      const cost = body.cost_per_unit == null || body.cost_per_unit === ''
        ? null
        : validatePrice(body.cost_per_unit)
      if (body.cost_per_unit != null && body.cost_per_unit !== '' && cost === null) {
        return NextResponse.json({ error: 'Invalid cost per unit' }, { status: 400 })
      }
      updates.cost_per_unit = cost
    }
    if (body.is_active !== undefined && typeof body.is_active === 'boolean') {
      updates.is_active = body.is_active
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data: item, error } = await supabaseAdmin
      .from('inventory_items')
      .update(updates)
      .eq('id', itemId)
      .eq('restaurant_id', restaurantId)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'An item with this name already exists.' }, { status: 409 })
      }
      console.error('[inventory.PATCH] update error:', error.message)
      return NextResponse.json({ error: 'Could not update item.' }, { status: 500 })
    }

    void writeAuditLog(supabaseAdmin, {
      restaurantId,
      actorUserId: user.id,
      action: 'inventory.item.updated',
      entityType: 'inventory_item',
      entityId: itemId,
      metadata: { fields: Object.keys(updates) },
    })

    return NextResponse.json({ item })
  } catch (error) {
    console.error('[inventory.PATCH] error:', error)
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
  }
}
