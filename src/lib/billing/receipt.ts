import type { Bill } from '@/types'
import { roundCents } from '@/lib/billing/calculations'

export type ReceiptLineItem = {
  name: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export type ReceiptPaymentLine = {
  amount: number
  method: string
  createdAt: string
}

export type ReceiptData = {
  restaurantName: string
  restaurantAddress?: string | null
  restaurantPhone?: string | null
  currency: string
  tableNumber: string
  billId: string
  generatedAt: string
  items: ReceiptLineItem[]
  subtotal: number
  taxAmount: number
  total: number
  paid: number
  owed: number
  payments: ReceiptPaymentLine[]
}

type RestaurantInfo = {
  name: string
  address?: string | null
  phone?: string | null
  currency?: string
}

// Builds printer-format-agnostic receipt data for a bill, combining all of
// its linked orders' items into one itemized list plus the payment ledger
// (which may span multiple methods, e.g. part cash + part online).
export function buildReceiptData(restaurant: RestaurantInfo, bill: Bill): ReceiptData {
  const items = (bill.orders || [])
    .flatMap((order) => order.items || [])
    .filter((item) => !item.cancelled)
    .map((item) => ({
      name: item.item_name_snapshot || item.menu_item?.name || 'Item',
      quantity: item.quantity,
      unitPrice: item.price_snapshot,
      lineTotal: roundCents(item.price_snapshot * item.quantity),
    }))

  const subtotal = bill.subtotal ?? roundCents(items.reduce((sum, i) => sum + i.lineTotal, 0))
  const taxAmount = bill.tax_amount ?? 0
  const total = bill.total ?? subtotal
  const paid = bill.paid ?? 0
  const owed = bill.owed ?? roundCents(total - paid)

  const payments = (bill.payments || []).map((p) => ({ amount: p.amount, method: p.method, createdAt: p.created_at }))

  return {
    restaurantName: restaurant.name,
    restaurantAddress: restaurant.address,
    restaurantPhone: restaurant.phone,
    currency: restaurant.currency || 'NPR',
    tableNumber: bill.table?.table_number || '',
    billId: bill.id,
    generatedAt: new Date().toISOString(),
    items,
    subtotal,
    taxAmount,
    total,
    paid,
    owed,
    payments,
  }
}
