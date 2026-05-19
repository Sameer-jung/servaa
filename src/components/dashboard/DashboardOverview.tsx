'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatCard } from '@/components/dashboard/StatCard'
import { OrderCard } from '@/components/orders/OrderCard'
import { useRealtimeOrders } from '@/hooks/useRealtime'
import { formatCurrency } from '@/utils/format'
import { isServiceRequestOrder } from '@/utils/orders'
import { OrderWithItems } from '@/types'

interface DashboardOverviewProps {
  restaurantId: string
}

interface DashboardStats {
  activeOrders: number
  activeTables: number
  todaySales: number
  pendingOrders: number
}

const emptyStats: DashboardStats = {
  activeOrders: 0,
  activeTables: 0,
  todaySales: 0,
  pendingOrders: 0,
}

function startOfTodayIso() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date.toISOString()
}

export function DashboardOverview({ restaurantId }: DashboardOverviewProps) {
  const [stats, setStats] = useState<DashboardStats>(emptyStats)
  const [recentOrders, setRecentOrders] = useState<OrderWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchOverview = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)

    const today = startOfTodayIso()

    const [
      activeOrdersResult,
      activeTablesResult,
      todayOrdersResult,
      pendingOrdersResult,
      recentOrdersResult,
    ] = await Promise.all([
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurantId)
        .in('status', ['pending', 'accepted', 'preparing', 'ready']),
      supabase
        .from('tables')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true),
      supabase
        .from('orders')
        .select('total_amount')
        .eq('restaurant_id', restaurantId)
        .gte('created_at', today)
        .eq('status', 'completed'),
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurantId)
        .eq('status', 'pending'),
      supabase
        .from('orders')
        .select('*, table:tables(table_number), items:order_items(*, menu_item:menu_items(name, price))')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    const todaySales = (todayOrdersResult.data || []).reduce(
      (sum, order) => sum + Number(order.total_amount || 0),
      0
    )

    setStats({
      activeOrders: activeOrdersResult.count || 0,
      activeTables: activeTablesResult.count || 0,
      todaySales,
      pendingOrders: pendingOrdersResult.count || 0,
    })

    setRecentOrders((recentOrdersResult.data as OrderWithItems[] | null) || [])
    setLoading(false)
  }, [restaurantId, supabase])

  useEffect(() => {
    fetchOverview()
  }, [fetchOverview])

  useEffect(() => {
    const channel = supabase
      .channel(`dashboard-overview-items:${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_items',
        },
        () => {
          fetchOverview(false)
        }
      )
      .subscribe()

    const interval = window.setInterval(() => {
      fetchOverview(false)
    }, 15000)

    return () => {
      window.clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [fetchOverview, restaurantId, supabase])

  useRealtimeOrders(restaurantId, useCallback((update) => {
    fetchOverview(false)

    if (update.type === 'DELETE') {
      setRecentOrders((prev) => prev.filter((order) => order.id !== update.orderId))
    }
  }, [fetchOverview]))

  const billableRecentOrders = useMemo(
    () => recentOrders.filter((order) => !isServiceRequestOrder(order)).slice(0, 5),
    [recentOrders]
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">Overview of your restaurant</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Active Orders" value={loading ? '...' : stats.activeOrders} icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>} />
        <StatCard title="Active Tables" value={loading ? '...' : stats.activeTables} icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>} />
        <StatCard title="Today Sales" value={loading ? '...' : formatCurrency(stats.todaySales)} subtitle="Completed orders" icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard title="Pending" value={loading ? '...' : stats.pendingOrders} icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Recent Orders</h2>
        {billableRecentOrders.length > 0 ? (
          <div className="space-y-3">
            {billableRecentOrders.map((order) => (
              <OrderCard key={order.id} order={order} compact />
            ))}
          </div>
        ) : (
          <EmptyState title="No orders yet" description="Orders will appear here when customers start ordering." icon={<svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>} />
        )}
      </div>
    </div>
  )
}
