'use client'
import {toast} from "react-hot-toast"
import {MESSAGES} from "@/utils/messages"
import { useState } from 'react'
import posthog from 'posthog-js'
import { useCartStore } from '@/hooks/useCartStore'
import { formatCurrency } from '@/utils/format'
import { Button } from '@/components/ui/Button'
import { Order } from '@/types'
import { isUuid } from '@/utils/validation'
import { calculateItemTotal } from '@/utils/pricing'
import { ShoppingCart, X } from "lucide-react";

interface StickyCartProps {
  restaurantId: string;
  tableId: string;
  tableToken?: string;
  currency?: string;
  customerSessionId?: string | null;
  onOrderPlaced?: (order: Order) => void;
  sessionExpired?: boolean;
  onSessionExpired?: () => void;
}

export function StickyCart({ restaurantId, tableId, tableToken, currency, onOrderPlaced, customerSessionId, sessionExpired, onSessionExpired }: StickyCartProps) {
  const [placing, setPlacing] = useState(false)
  const [placed, setPlaced] = useState(false)
  const [error, setError] = useState('')
  const [isOpen, setIsOpen] = useState(false);
  const cart = useCartStore()

  const handlePlaceOrder = async () => {
    if (cart.items.length === 0) return

    if (sessionExpired) {
      onSessionExpired?.()
      return
    }

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
        posthog.capture('order_placed', {
          restaurant_id: restaurantId,
          table_id: tableId,
          order_id: result.order.id,
          item_count: cart.totalItems,
          total_amount: cart.totalPrice,
        })
        onOrderPlaced?.(result.order as Order)
        cart.clearCart()
        setIsOpen(false)
        setPlacing(false)
        setPlaced(true)
        toast.success(MESSAGES.customerOrder.sentToKitchen);
        return
      }

      if (result?.error === 'TABLE_SESSION_EXPIRED') {
        onSessionExpired?.()
        toast.error('Please scan the QR code again to place this order.')
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
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-2xl shadow-brand-600/30 active:bg-brand-700 lg:hidden"
        aria-label="Open cart"
      >
        <ShoppingCart className="h-6 w-6" />
        <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1 text-xs font-bold text-brand-700 shadow">
          {cart.totalItems}
        </span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close cart"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-black/40"
          />

          <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] rounded-t-3xl bg-white p-4 shadow-2xl">
            <div className="mx-auto max-w-lg space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-bold text-gray-900">Your Order</p>
                  <p className="text-xs text-gray-500">
                    {cart.totalItems} {cart.totalItems === 1 ? "item" : "items"}{" "}
                    selected
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 active:bg-gray-200"
                  aria-label="Close cart"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex items-center justify-between rounded-2xl bg-brand-50 px-4 py-3">
                <span className="text-sm font-semibold text-gray-700">
                  Total
                </span>
                <span className="text-lg font-bold text-brand-700">
                  {formatCurrency(cart.totalPrice, currency)}
                </span>
              </div>

              <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
                {cart.items.map((item) => (
                  <div
                    key={item.cartItemId}
                    className="rounded-2xl bg-gray-50 px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold text-gray-900">
                          {item.menuItem.name}
                        </p>

                        {(item.modifiers || []).length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {item.modifiers?.map((modifier) => (
                              <p
                                key={modifier.id}
                                className="break-words text-xs text-gray-500"
                              >
                                + {modifier.name}
                                {modifier.price > 0
                                  ? ` (${formatCurrency(modifier.price, currency)})`
                                  : ""}
                              </p>
                            ))}
                          </div>
                        )}

                        <p className="mt-1 text-xs text-gray-500">
                          {formatCurrency(
                            calculateItemTotal(
                              item.menuItem.price,
                              item.modifiers,
                            ),
                            currency,
                          )}{" "}
                          each
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-1 rounded-full bg-white px-1 py-1 shadow-sm">
                        <button
                          type="button"
                          onClick={() =>
                            cart.updateQuantity(
                              item.cartItemId,
                              item.quantity - 1,
                            )
                          }
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-700 active:bg-gray-200"
                        >
                          -
                        </button>

                        <span className="min-w-[1.25rem] text-center text-sm font-bold text-gray-900">
                          {item.quantity}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            cart.updateQuantity(
                              item.cartItemId,
                              item.quantity + 1,
                            )
                          }
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white active:bg-brand-700"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <input
                      type="text"
                      value={item.notes || ""}
                      onChange={(event) =>
                        cart.updateNotes(item.cartItemId, event.target.value)
                      }
                      placeholder="Add note"
                      className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
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
                disabled={sessionExpired}
                onClick={handlePlaceOrder}
              >
                {sessionExpired ? 'Scan QR code to order' : 'Order Now'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
