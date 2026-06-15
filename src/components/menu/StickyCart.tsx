'use client'
import {toast} from "react-hot-toast"
import {MESSAGES} from "@/utils/messages"
import { useState } from 'react'
import { useCartStore } from '@/hooks/useCartStore'
import { formatCurrency } from '@/utils/format'
import { Button } from '@/components/ui/Button'
import { Order } from '@/types'
import { isUuid } from '@/utils/validation'
import { calculateItemTotal } from '@/utils/pricing'

interface StickyCartProps {
  restaurantId: string;
  tableId: string;
  tableToken?: string;
  currency?: string;
  customerSessionId?: string | null;
  onOrderPlaced?: (order: Order) => void;
}

export function StickyCart({ restaurantId, tableId, tableToken, currency, onOrderPlaced, customerSessionId }: StickyCartProps) {
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
          customerSessionId,
          items: cart.items.map((item) => ({
            menuItemId: item.menuItem.id,
            quantity: item.quantity,
            notes: item.notes || null,
            modifiers: item.modifiers || [],
          })),
        }),
      })
      const result = await response.json().catch(() => null)

      if (response.ok && result?.order) {
        onOrderPlaced?.(result.order as Order)
        cart.clearCart()
        setPlacing(false)
        setPlaced(true)
        toast.success(MESSAGES.customerOrder.sentToKitchen);
        return
      }
      
      toast.error(
        result?.error === "One or more items are unavailable"
          ? MESSAGES.customerOrder.itemsUnavailable
          : MESSAGES.customerOrder.placeFailed,
      );
    } catch (orderError) {
      console.error('[StickyCart] order request error:', orderError)
      toast.error(MESSAGES.customerOrder.placeFailed);
    } finally {
      setPlacing(false)
    }
  }

  if (placed && cart.totalItems === 0) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-emerald-200 bg-emerald-50 p-4 lg:hidden">
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
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white p-4 shadow-lg lg:hidden">
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
            <div key={item.cartItemId} className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium text-gray-900">{item.menuItem.name}</p>
                  {(item.modifiers || []).length > 0 && (
                    <div className="mt-0.5 space-y-0.5">
                      {item.modifiers?.map((modifier) => (
                        <p key={modifier.id} className="break-words text-xs text-gray-500">
                          + {modifier.name}
                          {modifier.price > 0 ? ` (${formatCurrency(modifier.price, currency)})` : ''}
                        </p>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-500">
                    {formatCurrency(calculateItemTotal(item.menuItem.price, item.modifiers), currency)} each
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => cart.updateQuantity(item.cartItemId, item.quantity - 1)}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm sm:h-7 sm:w-7"
                  >
                    -
                  </button>
                  <span className="min-w-[1.25rem] text-center text-sm font-semibold text-gray-900">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => cart.updateQuantity(item.cartItemId, item.quantity + 1)}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm sm:h-7 sm:w-7"
                  >
                    +
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={item.notes || ''}
                onChange={(event) => cart.updateNotes(item.cartItemId, event.target.value)}
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
