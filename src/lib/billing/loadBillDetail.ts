import { supabaseAdmin } from '@/lib/supabase/admin'
import { computeBillTotals, roundCents } from '@/lib/billing/calculations'

type OrderRow = {
  id: string
  restaurant_id: string
  table_id: string
  status: string
  total_amount: number
  special_instructions?: string | null
  items?: { cancelled?: boolean }[] | null
}

type PaymentRow = {
  id: string
  bill_id: string
  restaurant_id: string
  amount: number
  method: string
  recorded_by?: string | null
  created_at: string
}

type BillRow = {
  id: string
  restaurant_id: string
  table_id: string
  status: string
  created_by?: string | null
  created_at: string
  updated_at: string
  paid_at?: string | null
  table?: { table_number: string } | { table_number: string }[] | null
  bill_orders?: { order: OrderRow }[]
  payments?: PaymentRow[]
}

export async function loadBillDetail(billId: string) {
  const { data: bill, error } = await supabaseAdmin
    .from('bills')
    .select(
      `*,
      table:tables(table_number),
      bill_orders(order:orders(*, items:order_items(*, menu_item:menu_items(name)))),
      payments(*)`
    )
    .eq('id', billId)
    .maybeSingle()

  if (error || !bill) return { bill: null, error }

  const row = bill as unknown as BillRow
  const orders = (row.bill_orders || []).map((bo) => bo.order).filter(Boolean)
  const payments = row.payments || []

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('tax_rate')
    .eq('id', row.restaurant_id)
    .maybeSingle()

  const rawSubtotal = orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0)
  const { subtotal, taxAmount, total } = computeBillTotals(rawSubtotal, Number(restaurant?.tax_rate || 0))
  const paid = roundCents(payments.reduce((sum, p) => sum + Number(p.amount || 0), 0))
  const owed = Math.max(0, roundCents(total - paid))

  const { bill_orders: _bo, ...rest } = row
  void _bo

  return {
    bill: {
      ...rest,
      orders,
      payments,
      subtotal,
      tax_amount: taxAmount,
      total,
      paid,
      owed,
    },
    error: null,
  }
}
