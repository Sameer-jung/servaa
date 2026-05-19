'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestaurant } from '@/hooks/useRestaurant'
import { useRealtimeOrders } from '@/hooks/useRealtime'
import { OrderCard } from '@/components/orders/OrderCard'
import { Tabs } from '@/components/ui/Tabs'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoading } from '@/components/dashboard/PageLoading'
import { OrderStatus, OrderWithItems } from '@/types'

const tabs = [
  { id: 'active', label: 'Active' },
  { id: 'pending', label: 'Pending' },
  { id: 'completed', label: 'Completed' },
  { id: 'all', label: 'All' },
]

const activeStatuses: OrderStatus[] = ['pending', 'accepted', 'preparing', 'ready']
const completedStatuses: OrderStatus[] = ['completed', 'cancelled']

function orderMatchesTab(order: OrderWithItems, activeTab: string) {
  if (activeTab === 'active') return activeStatuses.includes(order.status)
  if (activeTab === 'pending') return order.status === 'pending'
  if (activeTab === 'completed') return completedStatuses.includes(order.status)
  return true
}

function sortNewestFirst(orders: OrderWithItems[]) {
  return [...orders].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

function OrdersContent() {
  const [orders, setOrders] = useState<OrderWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('active')
  const { restaurant, loading: restaurantLoading } = useRestaurant()
  const supabase = createClient()

  const fetchOrders = useCallback(async () => {
    if (!restaurant) {
      setOrders([])
      setLoading(false)
      return
    }

    setLoading(true)
    let query = supabase
      .from('orders')
      .select('*, table:tables(table_number), items:order_items(*, menu_item:menu_items(name, price))')
      .eq('restaurant_id', restaurant.id)
      .order('created_at', { ascending: false })

    if (activeTab === 'active') {
      query = query.in('status', ['pending', 'accepted', 'preparing', 'ready'])
    } else if (activeTab === 'pending') {
      query = query.eq('status', 'pending')
    } else if (activeTab === 'completed') {
      query = query.in('status', ['completed', 'cancelled'])
    }

    const { data } = await query
    setOrders((data as OrderWithItems[]) || [])
    setLoading(false)
  }, [restaurant, activeTab, supabase])

  const fetchOrderById = useCallback(async (orderId: string) => {
    if (!restaurant) return null

    const { data } = await supabase
      .from('orders')
      .select('*, table:tables(table_number), items:order_items(*, menu_item:menu_items(name, price))')
      .eq('restaurant_id', restaurant.id)
      .eq('id', orderId)
      .maybeSingle()

    return (data as OrderWithItems | null) || null
  }, [restaurant, supabase])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // Realtime updates
  useRealtimeOrders(restaurant?.id || '', useCallback((update) => {
    if (update.type === 'DELETE') {
      setOrders((prev) => prev.filter((o) => o.id !== update.orderId))
      return
    }

    void fetchOrderById(update.orderId).then((order) => {
      if (!order) {
        setOrders((prev) => prev.filter((o) => o.id !== update.orderId))
        return
      }

      setOrders((prev) => {
        const withoutCurrent = prev.filter((o) => o.id !== order.id)
        if (!orderMatchesTab(order, activeTab)) {
          return withoutCurrent
        }

        return sortNewestFirst([order, ...withoutCurrent])
      })
    })
  }, [activeTab, fetchOrderById]))

  const applyOptimisticStatus = (orderId: string, status: OrderStatus) => {
    setOrders((prev) => {
      const next = prev.map((order) =>
        order.id === orderId ? { ...order, status } : order
      )
      return sortNewestFirst(next.filter((order) => orderMatchesTab(order, activeTab)))
    })
  }

  const handleAccept = async (orderId: string) => {
    applyOptimisticStatus(orderId, 'accepted')
    const { error } = await supabase.from('orders').update({ status: 'accepted' }).eq('id', orderId)
    if (error) fetchOrders()
  }

  const handleReject = async (orderId: string) => {
    applyOptimisticStatus(orderId, 'cancelled')
    const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId)
    if (error) fetchOrders()
  }

  const handleUpdateStatus = async (orderId: string, status: string) => {
    const nextStatus = status as OrderStatus
    applyOptimisticStatus(orderId, nextStatus)
    const { error } = await supabase.from('orders').update({ status: nextStatus }).eq('id', orderId)
    if (error) fetchOrders()
  }

  if (restaurantLoading || loading) {
    return <PageLoading />
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
        <p className="text-sm text-gray-500">Manage incoming orders in real-time</p>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {orders.length > 0 ? (
        <div className="space-y-3">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onAccept={() => handleAccept(order.id)}
              onReject={() => handleReject(order.id)}
              onUpdateStatus={(status) => handleUpdateStatus(order.id, status)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No orders"
          description={`No ${activeTab} orders at the moment.`}
          icon={
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
      )}
    </div>
  )
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <OrdersContent />
    </Suspense>
  )
}
