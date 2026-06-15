'use client'

import { useCallback, useEffect, useRef } from 'react'
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

export function useDebouncedRealtimeRefresh(callback: () => void, delayMs = 400) {
  const callbackRef = useRef(callback)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null
      callbackRef.current()
    }, delayMs)
  }, [delayMs])
}

// Polls /api/orders/[orderId]/status every 5 seconds instead of using a
// Supabase Realtime subscription, which required orders_select_by_table: USING (true).
export function useOrderStatus(
  orderId: string,
  onStatusChange: (status: OrderStatus) => void,
  credentials?: { customerSessionId?: string | null; tableToken?: string }
) {
  const onStatusChangeRef = useRef(onStatusChange)
  const currentStatusRef = useRef<OrderStatus | null>(null)

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange
  }, [onStatusChange])

  useEffect(() => {
    if (!orderId) return

    const poll = async () => {
      try {
        const params = new URLSearchParams()
        if (credentials?.customerSessionId) {
          params.set('customerSessionId', credentials.customerSessionId)
        }
        if (credentials?.tableToken) {
          params.set('tableToken', credentials.tableToken)
        }
        const res = await fetch(`/api/orders/${orderId}/status?${params}`)
        if (!res.ok) return
        const data = await res.json()
        const newStatus = data?.status
        if (isOrderStatus(newStatus) && newStatus !== currentStatusRef.current) {
          currentStatusRef.current = newStatus
          onStatusChangeRef.current(newStatus)
        }
      } catch {
        // silently ignore transient poll errors
      }
    }

    poll()
    const intervalId = window.setInterval(poll, 5000)
    return () => window.clearInterval(intervalId)
  }, [orderId, credentials?.customerSessionId, credentials?.tableToken])
}
