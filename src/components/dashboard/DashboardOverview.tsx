'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatCard } from '@/components/dashboard/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { DashboardAnalytics } from '@/components/dashboard/DashboardAnalytics'
import { useDebouncedRealtimeRefresh, useRealtimeOrders } from '@/hooks/useRealtime'
import { formatCurrency, formatDate, formatTimeAgo } from '@/utils/format'
import { isServiceRequestOrder } from '@/utils/orders'
import { OrderStatus, OrderWithItems } from '@/types'

interface DashboardOverviewProps {
  restaurantId: string
  currency?: string
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

const pageSize = 20

type TableSummary = {
  tableId: string
  tableNumber: string
  orders: OrderWithItems[]
  status: OrderStatus
  total: number
  latestCreatedAt: string
}

const tableStatusPriority: OrderStatus[] = ['pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled']

function getTableStatus(orders: OrderWithItems[]): OrderStatus {
  return tableStatusPriority.find((status) => orders.some((order) => order.status === status)) || 'completed'
}

function groupOrdersByTable(orders: OrderWithItems[]): TableSummary[] {
  const groups = new Map<string, TableSummary>()

  for (const order of orders) {
    const tableId = order.table_id || 'unknown'
    const existing = groups.get(tableId)

    if (existing) {
      existing.orders.push(order)
      existing.total += Number(order.total_amount || 0)
      if (new Date(order.created_at).getTime() > new Date(existing.latestCreatedAt).getTime()) {
        existing.latestCreatedAt = order.created_at
      }
      existing.status = getTableStatus(existing.orders)
      continue
    }

    groups.set(tableId, {
      tableId,
      tableNumber: order.table?.table_number || 'Unknown',
      orders: [order],
      status: order.status,
      total: Number(order.total_amount || 0),
      latestCreatedAt: order.created_at,
    })
  }

  return Array.from(groups.values()).sort(
    (a, b) => new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime()
  )
}

export function DashboardOverview({ restaurantId, currency }: DashboardOverviewProps) {
  const [activeTab, setActiveTab] = useState<'orders' | 'analytics'>('orders')
  const [stats, setStats] = useState<DashboardStats>(emptyStats)
  const [recentOrders, setRecentOrders] = useState<OrderWithItems[]>([])
  const [recentPage, setRecentPage] = useState(0)
  const [hasNextRecentPage, setHasNextRecentPage] = useState(false)
  const [selectedTable, setSelectedTable] = useState<TableSummary | null>(null)
  const [tableHistory, setTableHistory] = useState<OrderWithItems[]>([])
  const [tableHistoryPage, setTableHistoryPage] = useState(0)
  const [hasNextTableHistoryPage, setHasNextTableHistoryPage] = useState(false)
  const [loadingTableHistory, setLoadingTableHistory] = useState(false)
  const [loading, setLoading] = useState(true)
  const realtimeHealthyRef = useRef(false)
  const supabase = createClient()

  const fetchOverview = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)

    const from = recentPage * pageSize
    const to = from + pageSize - 1

    const [
      statsResult,
      recentOrdersResult,
    ] = await Promise.all([
      supabase
        .rpc('get_dashboard_stats', { p_restaurant_id: restaurantId }),
      supabase
        .from('orders')
        .select('*, table:tables(table_number), items:order_items(*, menu_item:menu_items(name, price)), invoices(payment_status, payment_method)')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .range(from, to),
    ])

    const dashboardStats = Array.isArray(statsResult.data) ? statsResult.data[0] : null

    setStats({
      activeOrders: Number(dashboardStats?.active_orders || 0),
      activeTables: Number(dashboardStats?.active_tables || 0),
      todaySales: Number(dashboardStats?.today_sales || 0),
      pendingOrders: Number(dashboardStats?.pending_orders || 0),
    })

    const nextRecentOrders = (recentOrdersResult.data as OrderWithItems[] | null) || []
    setRecentOrders(nextRecentOrders)
    setHasNextRecentPage(nextRecentOrders.length === pageSize)
    setLoading(false)
  }, [recentPage, restaurantId, supabase])

  useEffect(() => {
    fetchOverview()
  }, [fetchOverview])

  const refreshSoon = useDebouncedRealtimeRefresh(() => fetchOverview(false))

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
        () => refreshSoon()
      )
      .subscribe((status) => {
        realtimeHealthyRef.current = status === 'SUBSCRIBED'
      })

    const interval = window.setInterval(() => {
      if (!realtimeHealthyRef.current) {
        fetchOverview(false)
      }
    }, 15000)

    return () => {
      window.clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [fetchOverview, refreshSoon, restaurantId, supabase])

  useRealtimeOrders(restaurantId, useCallback((update) => {
    refreshSoon()

    if (update.type === 'DELETE') {
      setRecentOrders((prev) => prev.filter((order) => order.id !== update.orderId))
    }
  }, [refreshSoon]))

  const recentTableSummaries = useMemo(
    () => groupOrdersByTable(recentOrders.filter((order) => !isServiceRequestOrder(order))).slice(0, 5),
    [recentOrders]
  )

  const fetchTableHistory = useCallback(async (table: TableSummary, page: number) => {
    const from = page * pageSize
    const to = from + pageSize - 1

    setLoadingTableHistory(true)

    const { data } = await supabase
      .from('orders')
      .select('*, table:tables(table_number), items:order_items(*, menu_item:menu_items(name, price)), invoices(payment_status, payment_method)')
      .eq('restaurant_id', restaurantId)
      .eq('table_id', table.tableId)
      .order('created_at', { ascending: false })
      .range(from, to)

    const nextHistory = ((data as OrderWithItems[] | null) || []).filter((order) => !isServiceRequestOrder(order))

    setTableHistory(nextHistory)
    setHasNextTableHistoryPage(nextHistory.length === pageSize)
    setLoadingTableHistory(false)
  }, [restaurantId, supabase])

  const openTableHistory = async (table: TableSummary) => {
    setSelectedTable(table)
    setTableHistory(table.orders)
    setTableHistoryPage(0)
    setLoadingTableHistory(true)
    await fetchTableHistory(table, 0)
  }

  const closeTableHistory = () => {
    setSelectedTable(null)
    setTableHistory([])
    setTableHistoryPage(0)
    setHasNextTableHistoryPage(false)
    setLoadingTableHistory(false)
  }

  const changeTableHistoryPage = async (nextPage: number) => {
    if (!selectedTable) return

    setTableHistoryPage(nextPage)
    await fetchTableHistory(selectedTable, nextPage)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Overview of your restaurant</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Active Orders" value={loading ? '...' : stats.activeOrders} icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>} />
        <StatCard title="Active Tables" value={loading ? '...' : stats.activeTables} icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>} />
        <StatCard title="Today Sales" value={loading ? '...' : formatCurrency(stats.todaySales, currency)} subtitle="Completed orders" icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard title="Pending" value={loading ? '...' : stats.pendingOrders} icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
      </div>

      <div>
        <Tabs
          tabs={[
            { id: 'orders', label: 'Recent Orders' },
            { id: 'analytics', label: 'Analytics' },
          ]}
          activeTab={activeTab}
          onChange={(id) => setActiveTab(id as 'orders' | 'analytics')}
        />

        {activeTab === 'analytics' ? (
          <div className="mt-4">
            <DashboardAnalytics restaurantId={restaurantId} currency={currency} />
          </div>
        ) : recentTableSummaries.length > 0 ? (
          <div className="mt-4 space-y-3">
            {recentTableSummaries.map((table) => (
              <button
                key={table.tableId}
                type="button"
                onClick={() => openTableHistory(table)}
                className="block w-full rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                        Table {table.tableNumber}
                      </span>
                      <Badge status={table.status}>{table.status}</Badge>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{formatTimeAgo(table.latestCreatedAt)}</span>
                    </div>
                    <p className="mt-2 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {table.orders.length} {table.orders.length === 1 ? 'order' : 'orders'} for this table
                    </p>
                    <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">Click to view full order history</p>
                  </div>
                  <p className="flex-shrink-0 text-sm font-bold text-gray-900 dark:text-gray-100">
                    {formatCurrency(table.total, currency)}
                  </p>
                </div>
              </button>
            ))}
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={recentPage === 0}
                onClick={() => setRecentPage((page) => Math.max(0, page - 1))}
              >
                Previous
              </Button>
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Page {recentPage + 1}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasNextRecentPage}
                onClick={() => setRecentPage((page) => page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : (
          <EmptyState className="mt-4" title="No orders yet" description="Orders will appear here when customers start ordering." icon={<svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>} />
        )}
      </div>

      <Modal
        isOpen={Boolean(selectedTable)}
        onClose={closeTableHistory}
        title={selectedTable ? `Table ${selectedTable.tableNumber} Order History` : 'Order History'}
        className="max-h-[85vh] overflow-y-auto"
      >
        <div className="space-y-4">
          {loadingTableHistory && (
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Loading order history...</p>
          )}

          {!loadingTableHistory && tableHistory.length === 0 && (
            <EmptyState title="No order history" description="This table has no food orders yet." />
          )}

          {!loadingTableHistory && tableHistory.length > 0 && (
            <div className="space-y-4">
              <div className="space-y-3">
                {tableHistory.map((order) => (
                <div key={order.id} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          Order #{order.id.slice(0, 8)}
                        </span>
                        <Badge status={order.status}>{order.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Placed {formatDate(order.created_at)}
                      </p>
                      {(() => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const orderAny = order as any;
                        const orderInvoices = Array.isArray(orderAny.invoices) ? orderAny.invoices : (orderAny.invoices ? [orderAny.invoices] : []);
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const paidInvoice = orderInvoices.find((inv: any) => inv.payment_status === 'paid');
                        if (paidInvoice?.payment_method) {
                          return (
                            <p className="mt-1 text-xs font-medium text-gray-600 dark:text-gray-300">
                              Payment Method: <span className="font-semibold">{paidInvoice.payment_method}</span>
                            </p>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    <p className="flex-shrink-0 text-sm font-bold text-gray-900 dark:text-gray-100">
                      {formatCurrency(order.total_amount || 0, currency)}
                    </p>
                  </div>

                  {order.items?.length > 0 ? (
                    <div className="mt-3 space-y-1 border-t border-gray-100 pt-3 dark:border-gray-800">
                      {order.items.map((item) => (
                        <div key={item.id} className="space-y-0.5">
                          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2 text-sm">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{item.quantity}x</span>
                            <span className="min-w-0 break-words font-medium text-gray-600 dark:text-gray-300">
                              {item.menu_item?.name || 'Item'}
                            </span>
                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                              {formatCurrency((item.price_snapshot || 0) * item.quantity, currency)}
                            </span>
                          </div>
                          {item.notes && (
                            <p className="pl-6 text-xs font-medium text-red-600">
                              Note: {item.notes}
                            </p>
                          )}
                          {(item.modifiers || []).length > 0 && (
                            <div className="pl-6 text-xs font-medium text-gray-500 dark:text-gray-400">
                              {item.modifiers?.map((modifier) => (
                                <p key={modifier.id} className="break-words">
                                  + {modifier.name}
                                  {modifier.price > 0 ? ` (${formatCurrency(modifier.price, currency)})` : ''}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 border-t border-gray-100 pt-3 text-sm font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400">
                      No items recorded for this order.
                    </p>
                  )}
                </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={tableHistoryPage === 0}
                  onClick={() => changeTableHistoryPage(Math.max(0, tableHistoryPage - 1))}
                >
                  Previous
                </Button>
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Page {tableHistoryPage + 1}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!hasNextTableHistoryPage}
                  onClick={() => changeTableHistoryPage(tableHistoryPage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
