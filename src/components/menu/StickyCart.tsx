'use client'

import { useState } from 'react'
import { useCartStore } from '@/hooks/useCartStore'
import { formatCurrency } from '@/utils/format'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { Order } from '@/types'

interface StickyCartProps {
  restaurantId: string
  tableId: string
  onOrderPlaced?: (order: Order) => void
}

export function StickyCart({ restaurantId, tableId, onOrderPlaced }: StickyCartProps) {
  const [placing, setPlacing] = useState(false)
  const [placed, setPlaced] = useState(false)
  const [error, setError] = useState('')
  const cart = useCartStore()
  const supabase = createClient()

  const handlePlaceOrder = async () => {
    if (cart.items.length === 0) return

    setError('')
    setPlacing(true)

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        restaurant_id: restaurantId,
        table_id: tableId,
        status: 'pending',
        total_amount: cart.totalPrice,
      })
      .select()
      .single()

    if (orderError || !order) {
      setError(orderError?.message || 'Could not place order. Please try again.')
      setPlacing(false)
      return
    }

    const orderItems = cart.items.map((item) => ({
      order_id: order.id,
      menu_item_id: item.menuItem.id,
      quantity: item.quantity,
      price_snapshot: item.menuItem.price,
      notes: item.notes || null,
    }))

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems)

    if (itemsError) {
      setError(itemsError.message)
      setPlacing(false)
      return
    }

    onOrderPlaced?.({
      ...(order as Order),
      total_amount: cart.totalPrice,
    })
    cart.clearCart()
    setPlacing(false)
    setPlaced(true)
  }

  if (placed && cart.totalItems === 0) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-emerald-200 bg-emerald-50 p-4">
        <div className="mx-auto max-w-lg text-center">
          <p className="text-sm font-medium text-emerald-700">Order sent to the kitchen!</p>
          <button
            type="button"
            onClick={() => setPlaced(false)}
            className="mt-1 text-xs text-emerald-600 underline"
          >
            Order more
          </button>
        </div>
      </div>
    )
  }

  if (cart.totalItems === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white p-4 shadow-lg">
      <div className="mx-auto max-w-lg space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">Your Order</p>
            <p className="text-xs text-gray-500">
              {cart.totalItems} {cart.totalItems === 1 ? 'item' : 'items'} selected
            </p>
          </div>
          <p className="text-lg font-bold text-gray-900">{formatCurrency(cart.totalPrice)}</p>
        </div>

        <div className="max-h-32 space-y-2 overflow-y-auto">
          {cart.items.map((item) => (
            <div key={item.menuItem.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{item.menuItem.name}</p>
                <p className="text-xs text-gray-500">{formatCurrency(item.menuItem.price)} each</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => cart.updateQuantity(item.menuItem.id, item.quantity - 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm"
                >
                  -
                </button>
                <span className="min-w-[1.25rem] text-center text-sm font-semibold text-gray-900">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => cart.updateQuantity(item.menuItem.id, item.quantity + 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <Button
          className="w-full"
          isLoading={placing}
          onClick={handlePlaceOrder}
        >
          Order Now
        </Button>
      </div>
    </div>
  )
}
