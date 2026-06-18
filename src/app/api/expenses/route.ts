import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import '@/lib/sentry'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/utils/audit'
import { isOwner } from '@/utils/roles'
import {
  clampInteger,
  isUuid,
  readTrimmedString,
  validateDateString,
  validateExpenseCategory,
  validatePrice,
} from '@/utils/validation'

export async function GET(request: Request) {
  let restaurantId: string | null = null
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    restaurantId = searchParams.get('restaurantId')
    const category = searchParams.get('category')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const page = clampInteger(searchParams.get('page') || 0, 0, 10000)
    const pageSize = clampInteger(searchParams.get('pageSize') || 50, 1, 100)

    if (!isUuid(restaurantId) || page === null || pageSize === null) {
      return NextResponse.json({ error: 'Invalid expense query' }, { status: 400 })
    }

    const cleanCategory = category ? validateExpenseCategory(category) : null
    if (category && !cleanCategory) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }

    const fromDate = from ? validateDateString(from) : null
    const toDate = to ? validateDateString(to) : null
    if ((from && !fromDate) || (to && !toDate)) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ownerAccess = await isOwner(supabase, restaurantId, user.id)
    if (!ownerAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const rangeFrom = page * pageSize
    const rangeTo = rangeFrom + pageSize - 1

    let query = supabaseAdmin
      .from('expenses')
      .select('*, movements:stock_movements(quantity_delta, inventory_item:inventory_items(name, unit))')
      .eq('restaurant_id', restaurantId)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (cleanCategory) query = query.eq('category', cleanCategory)
    if (fromDate) query = query.gte('expense_date', fromDate)
    if (toDate) query = query.lte('expense_date', toDate)

    const { data: expenses, error } = await query.range(rangeFrom, rangeTo)

    if (error) {
      Sentry.captureException(error, { tags: { restaurant_id: restaurantId } })
      console.error('[expenses.GET] query error:', error.message)
      return NextResponse.json({ error: 'Could not load expenses.' }, { status: 500 })
    }

    return NextResponse.json({ expenses: expenses || [] })
  } catch (error) {
    Sentry.captureException(error, { tags: { restaurant_id: restaurantId } })
    console.error('[expenses.GET] error:', error)
    return NextResponse.json({ error: 'Failed to load expenses' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  let restaurantId: string | undefined
  try {
    const body = await request.json()
    restaurantId = body.restaurantId

    if (!isUuid(restaurantId)) {
      return NextResponse.json({ error: 'Invalid expense payload' }, { status: 400 })
    }

    const category = validateExpenseCategory(body.category)
    const amount = validatePrice(body.amount)
    const expenseDate = body.expense_date ? validateDateString(body.expense_date) : null
    const vendor = body.vendor ? readTrimmedString(body.vendor, 120) : null
    const paymentMethod = body.payment_method ? readTrimmedString(body.payment_method, 60) : null
    const note = body.note ? readTrimmedString(body.note, 300) : null

    if (!category || amount === null || amount <= 0) {
      return NextResponse.json({ error: 'Category and a positive amount are required' }, { status: 400 })
    }
    if (body.expense_date && !expenseDate) {
      return NextResponse.json({ error: 'Invalid expense date' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ownerAccess = await isOwner(supabase, restaurantId, user.id)
    if (!ownerAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: expense, error } = await supabaseAdmin
      .from('expenses')
      .insert({
        restaurant_id: restaurantId,
        category,
        amount,
        vendor,
        payment_method: paymentMethod,
        expense_date: expenseDate || undefined,
        note,
        source: 'manual',
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      Sentry.captureException(error, { tags: { restaurant_id: restaurantId } })
      console.error('[expenses.POST] insert error:', error.message)
      return NextResponse.json({ error: 'Could not create expense.' }, { status: 500 })
    }

    void writeAuditLog(supabaseAdmin, {
      restaurantId,
      actorUserId: user.id,
      action: 'expense.created',
      entityType: 'expense',
      entityId: expense.id,
      metadata: { category, amount },
    })

    return NextResponse.json({ expense })
  } catch (error) {
    Sentry.captureException(error, { tags: { restaurant_id: restaurantId } })
    console.error('[expenses.POST] error:', error)
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  let expenseId: string | undefined
  let restaurantId: string | undefined
  try {
    const body = await request.json()
    expenseId = body.expenseId
    restaurantId = body.restaurantId

    if (!isUuid(expenseId) || !isUuid(restaurantId)) {
      return NextResponse.json({ error: 'Invalid expense update' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ownerAccess = await isOwner(supabase, restaurantId, user.id)
    if (!ownerAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const updates: Record<string, unknown> = {}

    if (body.category !== undefined) {
      const category = validateExpenseCategory(body.category)
      if (!category) return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
      updates.category = category
    }
    if (body.amount !== undefined) {
      const amount = validatePrice(body.amount)
      if (amount === null || amount <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
      updates.amount = amount
    }
    if (body.expense_date !== undefined) {
      const expenseDate = validateDateString(body.expense_date)
      if (!expenseDate) return NextResponse.json({ error: 'Invalid expense date' }, { status: 400 })
      updates.expense_date = expenseDate
    }
    if (body.vendor !== undefined) updates.vendor = body.vendor ? readTrimmedString(body.vendor, 120) : null
    if (body.payment_method !== undefined) {
      updates.payment_method = body.payment_method ? readTrimmedString(body.payment_method, 60) : null
    }
    if (body.note !== undefined) updates.note = body.note ? readTrimmedString(body.note, 300) : null

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data: expense, error } = await supabaseAdmin
      .from('expenses')
      .update(updates)
      .eq('id', expenseId)
      .eq('restaurant_id', restaurantId)
      .select()
      .single()

    if (error) {
      Sentry.captureException(error, { tags: { expense_id: expenseId, restaurant_id: restaurantId } })
      console.error('[expenses.PATCH] update error:', error.message)
      return NextResponse.json({ error: 'Could not update expense.' }, { status: 500 })
    }

    void writeAuditLog(supabaseAdmin, {
      restaurantId,
      actorUserId: user.id,
      action: 'expense.updated',
      entityType: 'expense',
      entityId: expenseId,
      metadata: { fields: Object.keys(updates) },
    })

    return NextResponse.json({ expense })
  } catch (error) {
    Sentry.captureException(error, { tags: { expense_id: expenseId, restaurant_id: restaurantId } })
    console.error('[expenses.PATCH] error:', error)
    return NextResponse.json({ error: 'Failed to update expense' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  let expenseId: string | null = null
  let restaurantId: string | null = null
  try {
    const { searchParams } = new URL(request.url)
    expenseId = searchParams.get('expenseId')
    restaurantId = searchParams.get('restaurantId')

    if (!isUuid(expenseId) || !isUuid(restaurantId)) {
      return NextResponse.json({ error: 'Invalid expense delete' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ownerAccess = await isOwner(supabase, restaurantId, user.id)
    if (!ownerAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { error } = await supabaseAdmin
      .from('expenses')
      .delete()
      .eq('id', expenseId)
      .eq('restaurant_id', restaurantId)

    if (error) {
      Sentry.captureException(error, { tags: { expense_id: expenseId, restaurant_id: restaurantId } })
      console.error('[expenses.DELETE] delete error:', error.message)
      return NextResponse.json({ error: 'Could not delete expense.' }, { status: 500 })
    }

    void writeAuditLog(supabaseAdmin, {
      restaurantId,
      actorUserId: user.id,
      action: 'expense.deleted',
      entityType: 'expense',
      entityId: expenseId,
      metadata: {},
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    Sentry.captureException(error, { tags: { expense_id: expenseId, restaurant_id: restaurantId } })
    console.error('[expenses.DELETE] error:', error)
    return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 })
  }
}
