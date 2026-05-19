'use client'

import { useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { OrderStatus } from '@/types'

const orderStatuses: OrderStatus[] = ['pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled']

function isOrderStatus(status: unknown): status is OrderStatus {
  return typeof status === 'string' && orderStatuses.includes(status as OrderStatus)
}

function readOrderPayload(record: unknown) {
  if (!record || typeof record !== 'object') return null
  return record as { id?: string; status?: unknown }
}

type OrderCallback = (payload: {
  orderId: string
  status?: OrderStatus
  type: 'INSERT' | 'UPDATE' | 'DELETE'
}) => void

export function useRealtimeOrders(
  restaurantId: string,
  onOrderChange: OrderCallback
) {
  const supabase = createClient()

  useEffect(() => {
    if (!restaurantId) return

    const channel = supabase
      .channel(`orders:${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const nextOrder = readOrderPayload(payload.new)
          const previousOrder = readOrderPayload(payload.old)
          const orderId = nextOrder?.id || previousOrder?.id
          const status = nextOrder?.status

          if (!orderId) return

          onOrderChange({
            orderId,
            status: isOrderStatus(status) ? status : undefined,
            type: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [restaurantId, onOrderChange, supabase])
}

export function useOrderStatus(orderId: string, onStatusChange: (status: OrderStatus) => void) {
  const supabase = createClient()

  useEffect(() => {
    if (!orderId) return

    const channel = supabase
      .channel(`order-status:${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const order = readOrderPayload(payload.new)
          if (isOrderStatus(order?.status)) {
            onStatusChange(order.status)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [orderId, onStatusChange, supabase])
}
