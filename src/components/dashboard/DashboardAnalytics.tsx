'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/utils/format'
import { isServiceRequestOrder } from '@/utils/orders'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

type Period = 'today' | 'week' | 'month' | 'custom'

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

// Brand palette (tailwind.config.ts `brand` + `status` scales) — reused for PDF report styling
const PDF_COLORS = {
  brand600: [22, 163, 74] as [number, number, number],
  brand700: [21, 128, 61] as [number, number, number],
  gray500: [107, 114, 128] as [number, number, number],
  gray900: [17, 24, 39] as [number, number, number],
  cancelledRed: [239, 68, 68] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
}

interface DateRange {
  start: Date | null
  end: Date | null
}

function getPeriodRange(period: Period, range: DateRange): { start: Date; end: Date } {
  const now = new Date()

  if (period === 'custom' && range.start) {
    const start = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate())
    const endSource = range.end ?? range.start
    const end = new Date(endSource.getFullYear(), endSource.getMonth(), endSource.getDate())
    end.setDate(end.getDate() + 1)
    return { start, end }
  }

  if (period === 'today') {
    return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate()), end: now }
  }

  const start = new Date(now)
  start.setDate(start.getDate() - (period === 'week' ? 6 : 29))
  start.setHours(0, 0, 0, 0)
  return { start, end: now }
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDayLabel(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

const PERIOD_LABELS: Record<Period, string> = { today: 'Today', week: 'This Week', month: 'This Month', custom: '' }

function getPeriodLabel(period: Period, range: DateRange): string {
  if (period === 'custom' && range.start) {
    if (range.end && range.end.getTime() !== range.start.getTime()) {
      return `${formatDayLabel(range.start)} – ${formatDayLabel(range.end)}`
    }
    return formatDayLabel(range.start)
  }
  return PERIOD_LABELS[period]
}

export function DashboardAnalytics({ restaurantId, currency = 'NPR' }: DashboardAnalyticsProps) {
  const [period, setPeriod] = useState<Period>('today')
  const [customRange, setCustomRange] = useState<DateRange>({ start: null, end: null })
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [restaurantName, setRestaurantName] = useState('')
  const [error, setError] = useState(false)
  const [revenue, setRevenue] = useState(0)
  const [totalOrders, setTotalOrders] = useState(0)
  const [cancelledOrders, setCancelledOrders] = useState(0)
  const [completionRate, setCompletionRate] = useState(0)
  const [topItems, setTopItems] = useState<TopItem[]>([])
  const [categoryData, setCategoryData] = useState<CategoryPoint[]>([])
  const [completedOrders, setCompletedOrders] = useState<CompletedOrder[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('restaurants')
      .select('name')
      .eq('id', restaurantId)
      .maybeSingle()
      .then(({ data }) => setRestaurantName(data?.name ?? ''))
  }, [restaurantId])

  const fetchAnalytics = useCallback(async () => {
    setLoading(true)
    setError(false)
    const supabase = createClient()

    const { start: periodStart, end: periodEnd } = getPeriodRange(period, customRange)

    const [completedResult, allOrdersResult] = await Promise.all([
      supabase
        .from('orders')
        .select(
          'id, total_amount, created_at, special_instructions, items:order_items(id, quantity, price_snapshot, cancelled, menu_item:menu_items(id, name, category:menu_categories(name)))'
        )
        .eq('restaurant_id', restaurantId)
        .eq('status', 'completed')
        .gte('created_at', periodStart.toISOString())
        .lt('created_at', periodEnd.toISOString()),
      supabase
        .from('orders')
        .select('id, status, special_instructions')
        .eq('restaurant_id', restaurantId)
        .gte('created_at', periodStart.toISOString())
        .lt('created_at', periodEnd.toISOString())
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

    setCompletedOrders(completed)

    // A: revenue
    setRevenue(completed.reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0))

    // B: orders + completion rate
    const completedCount = allOrders.filter((o) => o.status === 'completed').length
    const cancelledCount = allOrders.filter((o) => o.status === 'cancelled').length
    const total = completedCount + cancelledCount
    setTotalOrders(total)
    setCancelledOrders(cancelledCount)
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
  }, [period, customRange, restaurantId])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  const handlePresetPeriod = (p: 'today' | 'week' | 'month') => {
    setCustomRange({ start: null, end: null })
    setPeriod(p)
  }

  const parseDateInput = (value: string): Date | null => {
    if (!value) return null
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  const handleRangeStart = (value: string) => {
    const date = parseDateInput(value)
    if (!date) return
    setCustomRange((prev) => ({
      start: date,
      end: prev.end && prev.end < date ? date : prev.end,
    }))
    setPeriod('custom')
  }

  const handleRangeEnd = (value: string) => {
    const date = parseDateInput(value)
    if (!date) return
    setCustomRange((prev) => ({
      start: prev.start && prev.start > date ? date : prev.start,
      end: date,
    }))
    setPeriod('custom')
  }

  const handleDownloadReport = () => {
    setDownloading(true)
    try {
      const label = getPeriodLabel(period, customRange)
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      let y = 14

      doc.setFillColor(...PDF_COLORS.brand600)
      doc.rect(0, 0, pageWidth, 4, 'F')
      y += 10

      doc.setTextColor(...PDF_COLORS.gray900)
      doc.setFontSize(16)
      doc.text(restaurantName || 'Sales Report', 14, y)
      y += 7
      doc.setFontSize(11)
      doc.setTextColor(...PDF_COLORS.gray500)
      doc.text(`Sales Report · ${label}`, 14, y)
      doc.text(`Generated ${formatDayLabel(new Date())}`, pageWidth - 14, y, { align: 'right' })
      doc.setTextColor(...PDF_COLORS.gray900)
      y += 8

      const headStyles = { fillColor: PDF_COLORS.brand600, textColor: PDF_COLORS.white }

      autoTable(doc, {
        startY: y,
        head: [['Metric', 'Value']],
        body: [
          ['Revenue', formatCurrency(revenue, currency)],
          ['Total Orders (food & drink)', String(totalOrders)],
          [
            'Cancelled Orders',
            { content: String(cancelledOrders), styles: { textColor: PDF_COLORS.cancelledRed } },
          ],
          [
            'Completion Rate',
            { content: `${completionRate}%`, styles: { textColor: PDF_COLORS.brand700 } },
          ],
        ],
        theme: 'grid',
        headStyles,
        margin: { left: 14, right: 14 },
      })
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10

      if (topItems.length > 0) {
        doc.setTextColor(...PDF_COLORS.gray900)
        doc.setFontSize(12)
        doc.text('Top Selling Items', 14, y)
        autoTable(doc, {
          startY: y + 4,
          head: [['#', 'Item', 'Qty Sold', 'Revenue']],
          body: topItems.map((item, i) => [String(i + 1), item.name, String(item.qty), formatCurrency(item.revenue, currency)]),
          theme: 'striped',
          headStyles,
          margin: { left: 14, right: 14 },
        })
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
      }

      if (categoryData.length > 0) {
        doc.setTextColor(...PDF_COLORS.gray900)
        doc.setFontSize(12)
        doc.text('Category Revenue', 14, y)
        autoTable(doc, {
          startY: y + 4,
          head: [['Category', 'Revenue', '% of Sales']],
          body: categoryData.map((c) => [
            c.name,
            formatCurrency(c.revenue, currency),
            totalCatRevenue > 0 ? `${Math.round((c.revenue / totalCatRevenue) * 100)}%` : '0%',
          ]),
          theme: 'striped',
          headStyles,
          margin: { left: 14, right: 14 },
        })
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
      }

      if (completedOrders.length > 0) {
        doc.setTextColor(...PDF_COLORS.gray900)
        doc.setFontSize(12)
        doc.text('Order Details', 14, y)
        autoTable(doc, {
          startY: y + 4,
          head: [['Order #', 'Date & Time', 'Items', 'Amount']],
          body: completedOrders.map((order) => [
            order.id.slice(0, 8),
            formatDate(order.created_at),
            order.items
              .filter((item) => !item.cancelled)
              .map((item) => `${item.quantity}x ${item.menu_item?.name ?? 'Item'}`)
              .join(', '),
            formatCurrency(Number(order.total_amount ?? 0), currency),
          ]),
          theme: 'striped',
          headStyles,
          columnStyles: { 2: { cellWidth: 80 } },
          margin: { left: 14, right: 14 },
        })
      }

      const fileSuffix =
        period === 'custom' && customRange.start
          ? `${toDateInputValue(customRange.start)}_to_${toDateInputValue(customRange.end ?? customRange.start)}`
          : period
      doc.save(`sales-report-${fileSuffix}.pdf`)
    } finally {
      setDownloading(false)
    }
  }

  const maxItemQty = topItems[0]?.qty ?? 1
  const periodLabel = getPeriodLabel(period, customRange)
  const totalCatRevenue = categoryData.reduce((s, d) => s + d.revenue, 0)
  const todayInputValue = useMemo(() => toDateInputValue(new Date()), [])

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            {(['today', 'week', 'month'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handlePresetPeriod(p)}
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
          <div
            className={`flex items-center gap-1 rounded-lg border px-1.5 py-0.5 transition-colors ${
              period === 'custom'
                ? 'border-brand-600 bg-brand-50 dark:bg-brand-950'
                : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            <input
              type="date"
              aria-label="Custom range start date"
              max={todayInputValue}
              value={customRange.start ? toDateInputValue(customRange.start) : ''}
              onChange={(e) => handleRangeStart(e.target.value)}
              className={`w-[110px] border-none bg-transparent px-1 py-1 text-xs font-medium focus:outline-none focus:ring-0 ${
                period === 'custom' ? 'text-brand-700 dark:text-brand-300' : 'text-gray-600 dark:text-gray-400'
              }`}
            />
            <span className="text-xs text-gray-400 dark:text-gray-500">–</span>
            <input
              type="date"
              aria-label="Custom range end date"
              max={todayInputValue}
              value={customRange.end ? toDateInputValue(customRange.end) : ''}
              onChange={(e) => handleRangeEnd(e.target.value)}
              className={`w-[110px] border-none bg-transparent px-1 py-1 text-xs font-medium focus:outline-none focus:ring-0 ${
                period === 'custom' ? 'text-brand-700 dark:text-brand-300' : 'text-gray-600 dark:text-gray-400'
              }`}
            />
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          isLoading={downloading}
          disabled={loading || downloading}
          onClick={handleDownloadReport}
        >
          Download PDF Report
        </Button>
      </div>

      {/* A + B: Revenue and Orders */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* A: Revenue card */}
        <Card>
          <CardContent className="p-5">
            <p className="mb-4 text-sm font-semibold text-gray-500 dark:text-gray-400">Revenue</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {loading ? '…' : formatCurrency(revenue, currency)}
            </p>
            <p className="mt-1 text-xs font-medium text-gray-400 dark:text-gray-500">
              Completed orders · {periodLabel}
            </p>
          </CardContent>
        </Card>

        {/* B: Total orders + cancelled + completion rate */}
        <Card>
          <CardContent className="p-5">
            <p className="mb-4 text-sm font-semibold text-gray-500 dark:text-gray-400">
              Orders · {periodLabel}
            </p>
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {loading ? '…' : totalOrders}
                </p>
                <p className="mt-1 text-xs font-medium text-gray-400 dark:text-gray-500">Total</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {loading ? '…' : cancelledOrders}
                </p>
                <p className="mt-1 text-xs font-medium text-gray-400 dark:text-gray-500">Cancelled</p>
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
