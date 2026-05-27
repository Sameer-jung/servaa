'use client'

import {toast} from "react-hot-toast"
import {MESSAGES} from "@/utils/messages"
import { useState, useEffect, useCallback, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestaurant } from '@/hooks/useRestaurant'
import { useRealtimeOrders } from '@/hooks/useRealtime'
import { OrderCard } from '@/components/orders/OrderCard'
import { Tabs } from '@/components/ui/Tabs'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoading } from '@/components/dashboard/PageLoading'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatCurrency, formatTimeAgo } from '@/utils/format'
import { OrderStatus, OrderWithItems } from '@/types'
import { writeAuditLog } from '@/utils/audit'

const tabs = [
  { id: 'active', label: 'Active' },
  { id: 'pending', label: 'Pending' },
  { id: 'completed', label: 'Completed' },
  { id: 'all', label: 'All' },
]

const activeStatuses: OrderStatus[] = ['pending', 'accepted', 'preparing', 'ready']
const completedStatuses: OrderStatus[] = ['completed', 'cancelled']
const pageSize = 20

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

type TableOrderGroup = {
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

function groupOrdersByTable(orders: OrderWithItems[]): TableOrderGroup[] {
  const groups = new Map<string, TableOrderGroup>()

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

interface TableOrderCardProps {
  group: TableOrderGroup
  expanded: boolean
  onToggle: () => void
  onAccept: (orderId: string) => void
  onReject: (orderId: string) => void
  onUpdateStatus: (orderId: string, status: string) => void
  currency?: string
  updatingOrderId?: string | null
}

function TableOrderCard({
  group,
  expanded,
  onToggle,
  onAccept,
  onReject,
  onUpdateStatus,
  currency,
  updatingOrderId,
}: TableOrderCardProps) {
  const activeCount = group.orders.filter((order) => activeStatuses.includes(order.status)).length

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">Table {group.tableNumber}</span>
            <Badge status={group.status}>{group.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {group.orders.length} {group.orders.length === 1 ? 'order' : 'orders'} - {activeCount} active - {formatTimeAgo(group.latestCreatedAt)}
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-lg font-bold text-gray-900">{formatCurrency(group.total, currency)}</p>
          <p className="mt-1 text-xs text-gray-500">{expanded ? 'Hide' : 'View'} orders</p>
        </div>
      </button>

      {expanded && (
        <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
          {group.orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onAccept={() => onAccept(order.id)}
              onReject={() => onReject(order.id)}
              onUpdateStatus={(status) => onUpdateStatus(order.id, status)}
              currency={currency}
              isLoading= {updatingOrderId === order.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function OrdersContent() {
  const [orders, setOrders] = useState<OrderWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('active')
  const [page, setPage] = useState(0)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({})
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const { restaurant, loading: restaurantLoading } = useRestaurant()
  const supabase = createClient()

  const fetchOrders = useCallback(async () => {
    if (!restaurant) {
      setOrders([])
      setLoading(false)
      return
    }

    setLoading(true)
    const from = page * pageSize
    const to = from + pageSize - 1

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

    const { data } = await query.range(from, to)
    const nextOrders = (data as OrderWithItems[]) || []
    setOrders(nextOrders)
    setHasNextPage(nextOrders.length === pageSize)
    setLoading(false)
  }, [restaurant, activeTab, page, supabase])

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

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId)
    setPage(0)
  }

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
    if(updatingOrderId) return
    setUpdatingOrderId(orderId)
    applyOptimisticStatus(orderId, 'accepted')
    const { error } = await supabase.from('orders').update({ status: 'accepted' }).eq('id', orderId)
    if (error) fetchOrders()
    if (!error && restaurant) {
      void writeAuditLog(supabase, {
        restaurantId: restaurant.id,
        action: 'order.status_changed',
        entityType: 'order',
        entityId: orderId,
        metadata: { status: 'accepted' },
      })
      toast.success(MESSAGES.staffOrder.accepted);
    }
    setUpdatingOrderId(null)
  }

  const handleReject = async (orderId: string) => {
    if(updatingOrderId) return 
    setUpdatingOrderId(orderId)
    applyOptimisticStatus(orderId, 'cancelled')
    const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId)
    if (error) fetchOrders()
    if (!error && restaurant) {
      void writeAuditLog(supabase, {
        restaurantId: restaurant.id,
        action: 'order.status_changed',
        entityType: 'order',
        entityId: orderId,
        metadata: { status: 'cancelled' },
      })
      toast.success(MESSAGES.staffOrder.rejected);
    }
    setUpdatingOrderId(null)
  }

  const handleUpdateStatus = async (orderId: string, status: string) => {
    if(updatingOrderId) return
    setUpdatingOrderId(orderId)
    const nextStatus = status as OrderStatus
    applyOptimisticStatus(orderId, nextStatus)
    const { error } = await supabase.from('orders').update({ status: nextStatus }).eq('id', orderId)
    if (error) {
      fetchOrders()
      setUpdatingOrderId(null)
      toast.error(MESSAGES.staffOrder.updateFailed);
      return
    }

    if (restaurant) {
      void writeAuditLog(supabase, {
        restaurantId: restaurant.id,
        action: 'order.status_changed',
        entityType: 'order',
        entityId: orderId,
        metadata: { status: nextStatus },
      })
      if (nextStatus === 'preparing') toast.success(MESSAGES.staffOrder.preparing)
      if (nextStatus === 'ready') toast.success(MESSAGES.staffOrder.ready)
    }

    if (nextStatus === 'completed' && restaurant) {
      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, restaurantId: restaurant.id }),
      })

      if (!response.ok) {
        fetchOrders()
      }
      if (nextStatus === 'completed') toast.success(MESSAGES.staffOrder.completed)
    }
    setUpdatingOrderId(null)
  }

  if (restaurantLoading || loading) {
    return <PageLoading />
  }

  const tableGroups = groupOrdersByTable(orders)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
        <p className="text-sm text-gray-500">Manage incoming orders in real-time</p>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={handleTabChange} />

      {tableGroups.length > 0 ? (
        <div className="space-y-3">
          {tableGroups.map((group) => (
            <TableOrderCard
              key={group.tableId}
              group={group}
              expanded={expandedTables[group.tableId] ?? true}
              onToggle={() => setExpandedTables((current) => ({
                ...current,
                [group.tableId]: !(current[group.tableId] ?? true),
              }))}
              onAccept={handleAccept}
              onReject={handleReject}
              onUpdateStatus={handleUpdateStatus}
              currency={restaurant?.currency}
              updatingOrderId={updatingOrderId}
            />
          ))}
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}
            >
              Previous
            </Button>
            <span className="text-sm text-gray-500">Page {page + 1}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!hasNextPage}
              onClick={() => setPage((currentPage) => currentPage + 1)}
            >
              Next
            </Button>
          </div>
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
