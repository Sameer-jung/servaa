import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import '@/lib/sentry'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { hasBillableItems } from '@/utils/orders'
import { writeAuditLog } from '@/utils/audit'
import { hasRestaurantAccess, isOwner } from '@/utils/roles'
import { isUuid, readTrimmedString } from '@/utils/validation'
import { computeBillTotals, roundCents } from '@/lib/billing/calculations'
import { loadBillDetail } from '@/lib/billing/loadBillDetail'

type OrderRow = {
  id: string
  restaurant_id: string
  table_id: string
  status: string
  total_amount: number
  special_instructions?: string | null
  items?: { cancelled?: boolean }[] | null
}

export async function GET(request: Request) {
  let restaurantId: string | null = null
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    restaurantId = searchParams.get('restaurantId')
    const billId = searchParams.get('billId')
    const tableId = searchParams.get('tableId')
    const status = searchParams.get('status')

    if (!isUuid(restaurantId)) {
      return NextResponse.json({ error: 'Invalid bill query' }, { status: 400 })
    }
    if (billId && !isUuid(billId)) {
      return NextResponse.json({ error: 'Invalid billId' }, { status: 400 })
    }
    if (tableId && !isUuid(tableId)) {
      return NextResponse.json({ error: 'Invalid tableId' }, { status: 400 })
    }
    if (status && status !== 'open' && status !== 'paid') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const hasAccess = await hasRestaurantAccess(supabase, restaurantId, user.id)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (billId) {
      const { bill, error } = await loadBillDetail(billId)
      if (error) {
        Sentry.captureException(error, { tags: { bill_id: billId, restaurant_id: restaurantId } })
        return NextResponse.json({ error: 'Could not load bill.' }, { status: 500 })
      }
      if (!bill || bill.restaurant_id !== restaurantId) {
        return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
      }
      return NextResponse.json({ bill })
    }

    let query = supabaseAdmin
      .from('bills')
      .select('id, status, table_id, created_at, customer_name, table:tables(table_number), bill_orders(order_id, order:orders(total_amount)), payments(amount)')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })

    if (tableId) query = query.eq('table_id', tableId)
    if (status) query = query.eq('status', status)

    const [{ data: bills, error }, { data: restaurant }] = await Promise.all([
      query,
      supabaseAdmin.from('restaurants').select('tax_rate').eq('id', restaurantId).maybeSingle(),
    ])

    if (error) {
      Sentry.captureException(error, { tags: { restaurant_id: restaurantId } })
      console.error('[billing.bills.GET] query error:', error.message)
      return NextResponse.json({ error: 'Could not load bills.' }, { status: 500 })
    }

    type ListRow = {
      id: string
      status: string
      table_id: string
      created_at: string
      customer_name?: string | null
      table?: { table_number: string } | { table_number: string }[] | null
      bill_orders?: { order_id: string; order: { total_amount: number } | null }[]
      payments?: { amount: number }[]
    }

    const taxRate = Number(restaurant?.tax_rate || 0)
    const summarized = (bills as unknown as ListRow[] || []).map((b) => {
      const rawSubtotal = (b.bill_orders || []).reduce((sum, bo) => sum + Number(bo.order?.total_amount || 0), 0)
      const { total } = computeBillTotals(rawSubtotal, taxRate)
      const paid = roundCents((b.payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0))
      const table = Array.isArray(b.table) ? b.table[0] : b.table
      return {
        id: b.id,
        status: b.status,
        table_id: b.table_id,
        created_at: b.created_at,
        customer_name: b.customer_name || null,
        table_number: table?.table_number || null,
        order_ids: (b.bill_orders || []).map((bo) => bo.order_id),
        total,
        paid,
        owed: Math.max(0, roundCents(total - paid)),
      }
    })

    return NextResponse.json({ bills: summarized })
  } catch (error) {
    Sentry.captureException(error, { tags: { restaurant_id: restaurantId } })
    console.error('[billing.bills.GET] error:', error)
    return NextResponse.json({ error: 'Failed to load bills' }, { status: 500 })
  }
}

async function validateOrdersForBill(
  restaurantId: string,
  tableId: string,
  orderIds: string[]
): Promise<{ error: string; status: number } | { error: null }> {
  const { data: orders, error: ordersError } = await supabaseAdmin
    .from('orders')
    .select('id, restaurant_id, table_id, status, total_amount, special_instructions, items:order_items(cancelled)')
    .in('id', orderIds)

  if (ordersError) {
    Sentry.captureException(ordersError, { tags: { restaurant_id: restaurantId } })
    return { error: 'Could not load orders.', status: 500 }
  }

  if (!orders || orders.length !== orderIds.length) {
    return { error: 'One or more orders were not found', status: 404 }
  }

  for (const order of orders as OrderRow[]) {
    if (order.restaurant_id !== restaurantId || order.table_id !== tableId) {
      return { error: 'Order does not belong to this restaurant/table', status: 400 }
    }
    if (order.status !== 'completed') {
      return { error: 'Only completed orders can be added to a bill', status: 400 }
    }
    if (!hasBillableItems(order)) {
      return { error: 'Order has no billable items', status: 400 }
    }
  }

  const { data: alreadyBilled, error: alreadyBilledError } = await supabaseAdmin
    .from('bill_orders')
    .select('order_id')
    .in('order_id', orderIds)

  if (alreadyBilledError) {
    Sentry.captureException(alreadyBilledError, { tags: { restaurant_id: restaurantId } })
    return { error: 'Could not verify orders.', status: 500 }
  }

  if (alreadyBilled && alreadyBilled.length > 0) {
    return { error: 'One or more orders are already on a bill', status: 409 }
  }

  return { error: null }
}

function validateOrderIdsPayload(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) return null
  if (!value.every((id) => isUuid(id))) return null
  return Array.from(new Set(value as string[]))
}

export async function POST(request: Request) {
  let restaurantId: string | undefined
  let tableId: string | undefined
  try {
    const body = await request.json()
    restaurantId = body.restaurantId
    tableId = body.tableId
    const orderIds = validateOrderIdsPayload(body.orderIds)

    if (!isUuid(restaurantId) || !isUuid(tableId) || !orderIds) {
      return NextResponse.json({ error: 'Invalid bill payload' }, { status: 400 })
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

    const validation = await validateOrdersForBill(restaurantId, tableId, orderIds)
    if (validation.error) {
      return NextResponse.json({ error: validation.error }, { status: validation.status })
    }

    const { data: bill, error: billError } = await supabaseAdmin
      .from('bills')
      .insert({ restaurant_id: restaurantId, table_id: tableId, created_by: user.id })
      .select()
      .single()

    if (billError) {
      Sentry.captureException(billError, { tags: { restaurant_id: restaurantId, table_id: tableId } })
      console.error('[billing.bills.POST] bill insert error:', billError.message)
      return NextResponse.json({ error: 'Could not create bill.' }, { status: 500 })
    }

    const { error: linkError } = await supabaseAdmin
      .from('bill_orders')
      .insert(orderIds.map((orderId) => ({ bill_id: bill.id, order_id: orderId, restaurant_id: restaurantId })))

    if (linkError) {
      await supabaseAdmin.from('bills').delete().eq('id', bill.id)
      if (linkError.code === '23505') {
        return NextResponse.json({ error: 'One or more orders are already on a bill' }, { status: 409 })
      }
      Sentry.captureException(linkError, { tags: { restaurant_id: restaurantId, bill_id: bill.id } })
      console.error('[billing.bills.POST] bill_orders insert error:', linkError.message)
      return NextResponse.json({ error: 'Could not combine orders into a bill.' }, { status: 500 })
    }

    void writeAuditLog(supabaseAdmin, {
      restaurantId,
      actorUserId: user.id,
      action: 'bill.created',
      entityType: 'bill',
      entityId: bill.id,
      metadata: { table_id: tableId, order_ids: orderIds },
    })

    const { bill: fullBill, error: loadError } = await loadBillDetail(bill.id)
    if (loadError || !fullBill) {
      return NextResponse.json({ bill })
    }
    return NextResponse.json({ bill: fullBill })
  } catch (error) {
    Sentry.captureException(error, { tags: { restaurant_id: restaurantId, table_id: tableId } })
    console.error('[billing.bills.POST] error:', error)
    return NextResponse.json({ error: 'Failed to create bill' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  let billId: string | undefined
  let restaurantId: string | undefined
  try {
    const body = await request.json()
    billId = body.billId
    restaurantId = body.restaurantId
    const addOrderIds = body.addOrderIds !== undefined ? validateOrderIdsPayload(body.addOrderIds) : null
    const customerNameProvided = body.customerName !== undefined
    const customerName = customerNameProvided ? readTrimmedString(body.customerName, 80) : null

    if (!isUuid(billId) || !isUuid(restaurantId)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    if (body.addOrderIds !== undefined && !addOrderIds) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    if (!addOrderIds && !customerNameProvided) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
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

    const { data: bill, error: billError } = await supabaseAdmin
      .from('bills')
      .select('id, restaurant_id, table_id, status')
      .eq('id', billId)
      .maybeSingle()

    if (billError) {
      Sentry.captureException(billError, { tags: { bill_id: billId } })
      return NextResponse.json({ error: 'Could not load bill.' }, { status: 500 })
    }
    if (!bill || bill.restaurant_id !== restaurantId) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
    }
    if (bill.status !== 'open') {
      return NextResponse.json({ error: 'Cannot update a paid bill' }, { status: 400 })
    }

    if (addOrderIds) {
      const validation = await validateOrdersForBill(restaurantId, bill.table_id, addOrderIds)
      if (validation.error) {
        return NextResponse.json({ error: validation.error }, { status: validation.status })
      }

      const { error: linkError } = await supabaseAdmin
        .from('bill_orders')
        .insert(addOrderIds.map((orderId) => ({ bill_id: billId, order_id: orderId, restaurant_id: restaurantId })))

      if (linkError) {
        if (linkError.code === '23505') {
          return NextResponse.json({ error: 'One or more orders are already on a bill' }, { status: 409 })
        }
        Sentry.captureException(linkError, { tags: { restaurant_id: restaurantId, bill_id: billId } })
        console.error('[billing.bills.PATCH] bill_orders insert error:', linkError.message)
        return NextResponse.json({ error: 'Could not add orders to bill.' }, { status: 500 })
      }

      void writeAuditLog(supabaseAdmin, {
        restaurantId,
        actorUserId: user.id,
        action: 'bill.orders_added',
        entityType: 'bill',
        entityId: billId,
        metadata: { order_ids: addOrderIds },
      })
    }

    if (customerNameProvided) {
      const { error: nameError } = await supabaseAdmin
        .from('bills')
        .update({ customer_name: customerName || null })
        .eq('id', billId)

      if (nameError) {
        Sentry.captureException(nameError, { tags: { restaurant_id: restaurantId, bill_id: billId } })
        console.error('[billing.bills.PATCH] customer_name update error:', nameError.message)
        return NextResponse.json({ error: 'Could not update tab name.' }, { status: 500 })
      }

      void writeAuditLog(supabaseAdmin, {
        restaurantId,
        actorUserId: user.id,
        action: 'bill.customer_name_updated',
        entityType: 'bill',
        entityId: billId,
        metadata: { customer_name: customerName },
      })
    }

    const { bill: fullBill } = await loadBillDetail(billId)
    return NextResponse.json({ bill: fullBill })
  } catch (error) {
    Sentry.captureException(error, { tags: { bill_id: billId, restaurant_id: restaurantId } })
    console.error('[billing.bills.PATCH] error:', error)
    return NextResponse.json({ error: 'Failed to update bill' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  let billId: string | null = null
  let restaurantId: string | null = null
  try {
    const { searchParams } = new URL(request.url)
    billId = searchParams.get('billId')
    restaurantId = searchParams.get('restaurantId')

    if (!isUuid(billId) || !isUuid(restaurantId)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const actorIsOwner = await isOwner(supabase, restaurantId, user.id)
    if (!actorIsOwner) {
      return NextResponse.json({ error: 'Only the owner can delete a bill' }, { status: 403 })
    }

    const { data: bill, error: billError } = await supabaseAdmin
      .from('bills')
      .select('id, restaurant_id, status')
      .eq('id', billId)
      .maybeSingle()

    if (billError) {
      Sentry.captureException(billError, { tags: { bill_id: billId } })
      return NextResponse.json({ error: 'Could not load bill.' }, { status: 500 })
    }
    if (!bill || bill.restaurant_id !== restaurantId) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
    }
    // A paid bill has already synced its orders' invoices to 'paid' (see
    // syncInvoicesForPaidBill in /api/billing/payments). Deleting it here would
    // wipe the payment ledger backing that paid status, leaving the invoices
    // permanently stuck "paid" with no record of why — an orphaned state with
    // no undo. Block it rather than allow a silent data-integrity gap.
    if (bill.status === 'paid') {
      return NextResponse.json({ error: 'Cannot delete a paid bill' }, { status: 400 })
    }

    const { error: deleteError } = await supabaseAdmin.from('bills').delete().eq('id', billId)
    if (deleteError) {
      Sentry.captureException(deleteError, { tags: { bill_id: billId, restaurant_id: restaurantId } })
      console.error('[billing.bills.DELETE] error:', deleteError.message)
      return NextResponse.json({ error: 'Could not delete bill.' }, { status: 500 })
    }

    void writeAuditLog(supabaseAdmin, {
      restaurantId,
      actorUserId: user.id,
      action: 'bill.deleted',
      entityType: 'bill',
      entityId: billId,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    Sentry.captureException(error, { tags: { bill_id: billId, restaurant_id: restaurantId } })
    console.error('[billing.bills.DELETE] error:', error)
    return NextResponse.json({ error: 'Failed to delete bill' }, { status: 500 })
  }
}
