'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/utils/format'
import { isServiceRequestOrder } from '@/utils/orders'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import {
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

type Period = 'today' | 'week' | 'month'

interface DashboardAnalyticsProps {
  restaurantId: string
  currency?: string
}

interface OrderItem {
  id: string
  quantity: number
  price_snapshot: number | null
  cancelled: boolean | null
  item_name_snapshot?: string | null
  menu_item: {
    id: string
    name: string
    category: { name: string } | null
  } | null
}

interface CompletedOrder {
  id: string
  total_amount: number | null
  created_at: string
  special_instructions?: string | null
  items: OrderItem[]
}

interface AllOrder {
  id: string
  status: string
  special_instructions?: string | null
}

interface TopItem {
  name: string
  qty: number
  revenue: number
}

interface CategoryPoint {
  name: string
  revenue: number
}

const CHART_COLORS = ['#7c3aed', '#2563eb', '#16a34a', '#d97706', '#dc2626', '#0891b2', '#9333ea', '#be185d']

function getPeriodStart(period: Period): Date {
  const now = new Date()
  if (period === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }
  const d = new Date(now)
  d.setDate(d.getDate() - (period === 'week' ? 6 : 29))
  d.setHours(0, 0, 0, 0)
  return d
}

const PERIOD_LABELS: Record<Period, string> = { today: 'Today', week: 'This Week', month: 'This Month' }

export function DashboardAnalytics({ restaurantId, currency = 'NPR' }: DashboardAnalyticsProps) {
  const [period, setPeriod] = useState<Period>('today')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [revenue, setRevenue] = useState(0)
  const [totalOrders, setTotalOrders] = useState(0)
  const [completionRate, setCompletionRate] = useState(0)
  const [topItems, setTopItems] = useState<TopItem[]>([])
  const [categoryData, setCategoryData] = useState<CategoryPoint[]>([])

  const fetchAnalytics = useCallback(async () => {
    setLoading(true)
    setError(false)
    const supabase = createClient()

    const periodStart = getPeriodStart(period)

    const [completedResult, allOrdersResult] = await Promise.all([
      supabase
        .from('orders')
        .select(
          'id, total_amount, created_at, special_instructions, items:order_items(id, quantity, price_snapshot, cancelled, menu_item:menu_items(id, name, category:menu_categories(name)))'
        )
        .eq('restaurant_id', restaurantId)
        .eq('status', 'completed')
        .gte('created_at', periodStart.toISOString()),
      supabase
        .from('orders')
        .select('id, status, special_instructions')
        .eq('restaurant_id', restaurantId)
        .gte('created_at', periodStart.toISOString())
        .in('status', ['completed', 'cancelled']),
    ])

    if (completedResult.error || allOrdersResult.error) {
      console.error('[DashboardAnalytics] fetch error:', completedResult.error ?? allOrdersResult.error)
      setError(true)
      setLoading(false)
      return
    }

    const completed = ((completedResult.data as unknown as CompletedOrder[] | null) ?? []).filter(
      (o) => !isServiceRequestOrder(o)
    )
    const allOrders = ((allOrdersResult.data as unknown as AllOrder[] | null) ?? []).filter(
      (o) => !isServiceRequestOrder(o)
    )

    // A: revenue
    setRevenue(completed.reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0))

    // B: orders + completion rate
    const completedCount = allOrders.filter((o) => o.status === 'completed').length
    const cancelledCount = allOrders.filter((o) => o.status === 'cancelled').length
    const total = completedCount + cancelledCount
    setTotalOrders(total)
    setCompletionRate(total > 0 ? Math.round((completedCount / total) * 100) : 0)

    // C: top 5 items
    const itemMap = new Map<string, TopItem>()
    for (const order of completed) {
      for (const item of order.items) {
        if (item.cancelled) continue
        const name = item.item_name_snapshot || (item.menu_item?.name ?? 'Unknown')
        const itemRevenue = item.quantity * Number(item.price_snapshot ?? 0)
        const existing = itemMap.get(name)
        if (existing) {
          existing.qty += item.quantity
          existing.revenue += itemRevenue
        } else {
          itemMap.set(name, { name, qty: item.quantity, revenue: itemRevenue })
        }
      }
    }
    setTopItems(Array.from(itemMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 5))

    // F: category revenue
    const catMap = new Map<string, number>()
    for (const order of completed) {
      for (const item of order.items) {
        if (item.cancelled) continue
        const cat = item.menu_item?.category?.name ?? 'Uncategorized'
        catMap.set(cat, (catMap.get(cat) ?? 0) + item.quantity * Number(item.price_snapshot ?? 0))
      }
    }
    setCategoryData(Array.from(catMap.entries()).map(([name, rev]) => ({ name, revenue: rev })))

    setLoading(false)
  }, [period, restaurantId])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  const maxItemQty = topItems[0]?.qty ?? 1
  const periodLabel = PERIOD_LABELS[period]
  const totalCatRevenue = categoryData.reduce((s, d) => s + d.revenue, 0)

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-8 text-center dark:border-red-900/40 dark:bg-red-950/20">
        <p className="text-sm font-semibold text-red-600 dark:text-red-400">Failed to load analytics</p>
        <p className="mt-1 text-xs text-red-500 dark:text-red-500">Check your connection and try again.</p>
        <button
          type="button"
          onClick={fetchAnalytics}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* A + B: Revenue and Orders */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* A: Revenue card with period toggle */}
        <Card>
          <CardContent className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Revenue</p>
              <div className="flex overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                {(['today', 'week', 'month'] as Period[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                      period === p
                        ? 'bg-brand-600 text-white'
                        : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                    }`}
                  >
                    {p === 'today' ? 'Today' : p === 'week' ? 'Week' : 'Month'}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {loading ? '…' : formatCurrency(revenue, currency)}
            </p>
            <p className="mt-1 text-xs font-medium text-gray-400 dark:text-gray-500">
              Completed orders · {periodLabel}
            </p>
          </CardContent>
        </Card>

        {/* B: Total orders + completion rate */}
        <Card>
          <CardContent className="p-5">
            <p className="mb-4 text-sm font-semibold text-gray-500 dark:text-gray-400">
              Orders · {periodLabel}
            </p>
            <div className="flex items-end gap-6">
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {loading ? '…' : totalOrders}
                </p>
                <p className="mt-1 text-xs font-medium text-gray-400 dark:text-gray-500">Total</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {loading ? '…' : `${completionRate}%`}
                </p>
                <p className="mt-1 text-xs font-medium text-gray-400 dark:text-gray-500">Completion rate</p>
              </div>
            </div>
            {!loading && (
              <div className="mt-3 h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className="h-1.5 rounded-full bg-green-500 transition-all"
                  style={{ width: `${completionRate}%` }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* C + F: Top items and category donut */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* C: Top 5 selling items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Top 5 Items · {periodLabel}</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {loading ? (
              <div className="flex h-32 items-center justify-center text-sm text-gray-400 dark:text-gray-500">
                Loading…
              </div>
            ) : topItems.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                No sales data for this period.
              </p>
            ) : (
              <div className="space-y-3">
                {topItems.map((item, i) => (
                  <div key={item.name}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate font-medium text-gray-700 dark:text-gray-300">
                        <span className="mr-1.5 font-bold text-brand-600">#{i + 1}</span>
                        {item.name}
                      </span>
                      <span className="flex-shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-400">
                        {item.qty} · {formatCurrency(item.revenue, currency)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                      <div
                        className="h-1.5 rounded-full bg-brand-500 transition-all"
                        style={{ width: `${Math.round((item.qty / maxItemQty) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* F: Category revenue donut */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Category Revenue · {periodLabel}</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {loading ? (
              <div className="flex h-48 items-center justify-center text-sm text-gray-400 dark:text-gray-500">
                Loading…
              </div>
            ) : categoryData.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                No sales data for this period.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="revenue"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [
                      formatCurrency(Number(value), currency),
                      String(name),
                    ]}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Legend
                    iconSize={10}
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(value, entry) => {
                      const rev = (entry as { payload?: { revenue?: number } }).payload?.revenue ?? 0
                      const pct = totalCatRevenue > 0 ? Math.round((rev / totalCatRevenue) * 100) : 0
                      return `${value} · ${pct}% · ${formatCurrency(rev, currency)}`
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
