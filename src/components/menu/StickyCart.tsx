'use client'

import { useState } from 'react'
import { useCartStore } from '@/hooks/useCartStore'
import { formatCurrency } from '@/utils/format'
import { Button } from '@/components/ui/Button'
import { Order } from '@/types'
import { isUuid } from '@/utils/validation'

interface StickyCartProps {
  restaurantId: string
  tableId: string
  tableToken?: string
  currency?: string
  onOrderPlaced?: (order: Order) => void
}

export function StickyCart({ restaurantId, tableId, tableToken, currency, onOrderPlaced }: StickyCartProps) {
  const [placing, setPlacing] = useState(false)
  const [placed, setPlaced] = useState(false)
  const [error, setError] = useState('')
  const cart = useCartStore()

  const handlePlaceOrder = async () => {
    if (cart.items.length === 0) return

    setError('')

    if (!isUuid(restaurantId) || !isUuid(tableId) || cart.items.some((item) => !isUuid(item.menuItem.id))) {
      setError('Could not place order. Please refresh the page and try again.')
      return
    }

    setPlacing(true)

    const clientRequestId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId,
          tableId,
          tableToken,
          clientRequestId,
          items: cart.items.map((item) => ({
            menuItemId: item.menuItem.id,
            quantity: item.quantity,
            notes: item.notes || null,
          })),
        }),
      })
      const result = await response.json().catch(() => null)

      if (response.ok && result?.order) {
        onOrderPlaced?.(result.order as Order)
        cart.clearCart()
        setPlacing(false)
        setPlaced(true)
        return
      }

      setError(
        result?.error === 'One or more items are unavailable'
          ? result.error
          : 'Could not place order. Please try again.'
      )
    } catch (orderError) {
      console.error('[StickyCart] order request error:', orderError)
      setError('Could not place order. Please try again.')
    } finally {
      setPlacing(false)
    }
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
          <p className="text-lg font-bold text-gray-900">{formatCurrency(cart.totalPrice, currency)}</p>
        </div>

        <div className="max-h-32 space-y-2 overflow-y-auto">
          {cart.items.map((item) => (
            <div key={item.menuItem.id} className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{item.menuItem.name}</p>
                  <p className="text-xs text-gray-500">{formatCurrency(item.menuItem.price, currency)} each</p>
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
              <input
                type="text"
                value={item.notes || ''}
                onChange={(event) => cart.updateNotes(item.menuItem.id, event.target.value)}
                placeholder="Add note"
                className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
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
