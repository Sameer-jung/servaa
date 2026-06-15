'use client'

/* eslint-disable @next/next/no-img-element */

import { useState } from 'react'
import { useCartStore } from '@/hooks/useCartStore'
import { formatCurrency } from '@/utils/format'
import { calculateItemTotal } from '@/utils/pricing'
import { isUuid } from '@/utils/validation'
import { Order } from '@/types'
import { toast } from 'react-hot-toast'
import { MESSAGES } from '@/utils/messages'

interface OrderSidebarProps {
  restaurantId: string
  tableId: string
  tableToken?: string
  currency?: string
  taxRate?: number
  customerSessionId?: string | null
  onOrderPlaced?: (order: Order) => void
}

export function OrderSidebar({
  restaurantId,
  tableId,
  tableToken,
  currency,
  taxRate = 0,
  customerSessionId,
  onOrderPlaced,
}: OrderSidebarProps) {
  const [placing, setPlacing] = useState(false)
  const cart = useCartStore()

  const subtotal = cart.totalPrice
  const tax = subtotal * (taxRate / 100)
  const total = subtotal + tax

  const handlePlaceOrder = async () => {
    if (cart.items.length === 0) return

    if (
      !isUuid(restaurantId) ||
      !isUuid(tableId) ||
      cart.items.some((item) => !isUuid(item.menuItem.id))
    ) {
      toast.error('Could not place order. Please refresh the page and try again.')
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
        toast.success(MESSAGES.customerOrder.sentToKitchen)
        return
      }

      toast.error(
        result?.error === 'One or more items are unavailable'
          ? MESSAGES.customerOrder.itemsUnavailable
          : MESSAGES.customerOrder.placeFailed,
      )
    } catch {
      toast.error(MESSAGES.customerOrder.placeFailed)
    } finally {
      setPlacing(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Order summary card */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-900">Your Order</h2>
            <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-medium text-white">
              {cart.totalItems} {cart.totalItems === 1 ? 'item' : 'items'}
            </span>
          </div>
          {cart.totalItems > 0 && (
            <button
              onClick={() => cart.clearCart()}
              className="text-gray-400 transition-colors hover:text-red-500"
              title="Clear cart"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          )}
        </div>

        {cart.totalItems === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-gray-400">Add items to start your order</p>
          </div>
        ) : (
          <>
            {/* Items list */}
            <div className="max-h-72 divide-y divide-gray-50 overflow-y-auto">
              {cart.items.map((item) => {
                const unitPrice = calculateItemTotal(item.menuItem.price, item.modifiers)
                return (
                  <div key={item.cartItemId} className="flex items-center gap-2 px-3 py-2.5">
                    {item.menuItem.image_url ? (
                      <img
                        src={item.menuItem.image_url}
                        alt={item.menuItem.name}
                        className="h-11 w-11 flex-shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="h-11 w-11 flex-shrink-0 rounded-lg bg-gray-100" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{item.menuItem.name}</p>
                      <p className="text-xs text-gray-500">{formatCurrency(unitPrice, currency)}</p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <button
                        onClick={() => cart.updateQuantity(item.cartItemId, item.quantity - 1)}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-600 hover:bg-gray-200"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-sm font-semibold">{item.quantity}</span>
                      <button
                        onClick={() => cart.updateQuantity(item.cartItemId, item.quantity + 1)}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-sm text-white hover:bg-brand-700"
                      >
                        +
                      </button>
                    </div>
                    <span className="w-16 flex-shrink-0 text-right text-sm font-semibold text-gray-900">
                      {formatCurrency(unitPrice * item.quantity, currency)}
                    </span>
                    <button
                      onClick={() => cart.updateQuantity(item.cartItemId, 0)}
                      className="flex-shrink-0 text-gray-300 hover:text-gray-500"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Totals */}
            <div className="space-y-1.5 border-t border-gray-100 px-4 py-3">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal, currency)}</span>
              </div>
              {taxRate > 0 && (
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Tax ({taxRate}%)</span>
                  <span>{formatCurrency(tax, currency)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-100 pt-1.5 font-bold text-gray-900">
                <span>Total</span>
                <span className="text-brand-600">{formatCurrency(total, currency)}</span>
              </div>
            </div>

            {/* Place Order */}
            <div className="px-4 pb-4">
              <button
                onClick={handlePlaceOrder}
                disabled={placing}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
              >
                {placing ? (
                  'Placing order...'
                ) : (
                  <>
                    Place Order
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </>
                )}
              </button>
              <p className="mt-2 flex items-center justify-center gap-1 text-center text-xs text-gray-400">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
                Your order is secure and encrypted
              </p>
            </div>
          </>
        )}
      </div>

      {/* Enjoy your meal */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm">
        <div className="mb-2 text-3xl">🍽️</div>
        <h3 className="font-semibold text-gray-900">Enjoy your meal!</h3>
        <p className="mt-1 text-xs text-gray-500">Thank you for dining with us.</p>
      </div>
    </div>
  )
}
