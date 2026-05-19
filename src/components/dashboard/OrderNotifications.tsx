'use client'

import { useEffect } from 'react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { useRestaurant } from '@/hooks/useRestaurant'
import { formatCurrency } from '@/utils/format'
import { getServiceRequestLabel } from '@/utils/orders'

type OrderNotificationPayload = {
  id?: string
  table_id?: string
  total_amount?: number
  special_instructions?: string | null
}

type NotificationOrderItem = {
  id: string
  quantity: number
  price_snapshot: number
  menu_item?: {
    name?: string | null
  } | null
}

type NotificationOrder = OrderNotificationPayload & {
  table?: {
    table_number?: string | null
  } | null
  items?: NotificationOrderItem[] | null
}

function readOrder(record: unknown): OrderNotificationPayload | null {
  if (!record || typeof record !== 'object') return null
  return record as OrderNotificationPayload
}

function waitForOrderItems() {
  return new Promise((resolve) => window.setTimeout(resolve, 300))
}

function playAlertSound() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    if (!AudioContextClass) return

    const context = new AudioContextClass()
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, context.currentTime)
    oscillator.frequency.setValueAtTime(660, context.currentTime + 0.12)
    gain.gain.setValueAtTime(0.001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.28)

    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.onended = () => {
      void context.close()
    }
    oscillator.start()
    oscillator.stop(context.currentTime + 0.3)
  } catch {
    // Browsers can block sound until the admin has interacted with the page.
  }
}

export function OrderNotifications() {
  const { restaurant } = useRestaurant()
  const supabase = createClient()

  useEffect(() => {
    if (!restaurant) return

    const channel = supabase
      .channel(`dashboard-notifications:${restaurant.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurant.id}`,
        },
        async (payload) => {
          const order = readOrder(payload.new)
          if (!order?.id) return

          playAlertSound()

          let fullOrder: NotificationOrder | null = null
          for (let attempt = 0; attempt < 3; attempt += 1) {
            const { data } = await supabase
              .from('orders')
              .select('id, table_id, total_amount, special_instructions, table:tables(table_number), items:order_items(id, quantity, price_snapshot, menu_item:menu_items(name))')
              .eq('id', order.id)
              .eq('restaurant_id', restaurant.id)
              .maybeSingle()

            fullOrder = (data as NotificationOrder | null) || null
            if (fullOrder?.items?.length || (fullOrder && getServiceRequestLabel(fullOrder))) break
            await waitForOrderItems()
          }

          const notificationOrder = fullOrder || order
          const items = fullOrder?.items || []
          const tableNumber = fullOrder?.table?.table_number || 'Unknown'
          const requestLabel = getServiceRequestLabel(notificationOrder)
          const title = requestLabel ? `${requestLabel} request` : 'New order'

          toast.custom(
            (t) => (
              <div className="w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
                <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{title}</p>
                    <span className="mt-1 inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                      Table {tableNumber}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toast.dismiss(t.id)}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {items.length > 0 ? (
                    items.map((item) => (
                      <div key={item.id} className="grid grid-cols-[auto_1fr_auto] gap-2 text-sm">
                        <span className="font-medium text-gray-900">{item.quantity}x</span>
                        <span className="truncate text-gray-700">{item.menu_item?.name || 'Item'}</span>
                        <span className="font-medium text-gray-900">
                          {formatCurrency((item.price_snapshot || 0) * item.quantity, restaurant.currency)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="grid grid-cols-[auto_1fr] gap-2 text-sm">
                      <span className="font-medium text-gray-900">1x</span>
                      <span className="text-gray-700">{requestLabel || 'Order item'}</span>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 text-sm">
                  <span className="font-semibold text-gray-900">Total</span>
                  <span className="font-bold text-gray-900">
                    {formatCurrency(notificationOrder.total_amount || 0, restaurant.currency)}
                  </span>
                </div>
              </div>
            ),
            { duration: 8000, position: 'top-right' }
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [restaurant, supabase])

  return null
}
