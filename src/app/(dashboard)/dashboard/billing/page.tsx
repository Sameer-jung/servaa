'use client'

import toast from "react-hot-toast";
import { MESSAGES } from "@/utils/messages"; 
import { useState, useEffect, useCallback, Suspense, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestaurant } from '@/hooks/useRestaurant'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoading } from '@/components/dashboard/PageLoading'
import { InvoiceDetail } from '@/components/billing/InvoiceDetail'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { formatCurrency, formatDate } from '@/utils/format'
import { useDebouncedRealtimeRefresh } from '@/hooks/useRealtime'
import { Invoice, OrderWithItems, Table } from '@/types'
import { hasBillableItems } from '@/utils/orders'

const pageSize = 20

type TableInvoiceGroup = {
  tableId: string
  tableNumber: string
  invoices: Invoice[]
  total: number
  latestCreatedAt: string
}

type DayGroup = {
  label: string
  dateKey: string
  invoices: Invoice[]
  subtotal: number
}

function groupInvoicesByDay(invoices: Invoice[]): DayGroup[] {
  const now = new Date()
  const todayKey = now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = yesterday.toDateString()

  const map = new Map<string, DayGroup>()

  for (const invoice of invoices) {
    const date = new Date(invoice.created_at)
    const key = date.toDateString()
    let label: string
    if (key === todayKey) {
      label = 'Today'
    } else if (key === yesterdayKey) {
      label = 'Yesterday'
    } else {
      label = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    }
    const existing = map.get(key)
    if (existing) {
      existing.invoices.push(invoice)
      existing.subtotal += Number(invoice.grand_total || 0)
    } else {
      map.set(key, { label, dateKey: key, invoices: [invoice], subtotal: Number(invoice.grand_total || 0) })
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.invoices[0].created_at).getTime() - new Date(a.invoices[0].created_at).getTime()
  )
}

function getItemsSummary(invoice: Invoice): string {
  const items = invoice.order?.items?.filter(item => !item.cancelled)
  if (!items || items.length === 0) return '—'
  return items.map(item => `${item.quantity}× ${item.item_name_snapshot || item.menu_item?.name || 'Item'}`).join(', ')
}

function groupInvoicesByTable(invoices: Invoice[]): TableInvoiceGroup[] {
  const groups = new Map<string, TableInvoiceGroup>()

  for (const invoice of invoices) {
    const tableId = invoice.order?.table_id || 'unknown'
    const existing = groups.get(tableId)

    if (existing) {
      existing.invoices.push(invoice)
      existing.total += Number(invoice.grand_total || 0)
      if (new Date(invoice.created_at).getTime() > new Date(existing.latestCreatedAt).getTime()) {
        existing.latestCreatedAt = invoice.created_at
      }
      continue
    }

    groups.set(tableId, {
      tableId,
      tableNumber: invoice.order?.table?.table_number || 'Unknown',
      invoices: [invoice],
      total: Number(invoice.grand_total || 0),
      latestCreatedAt: invoice.created_at,
    })
  }

  return Array.from(groups.values()).sort(
    (a, b) => new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime()
  )
}

interface BillingTableGroupProps {
  group: TableInvoiceGroup;
  onView: (invoice: Invoice) => void;
  onMarkPaid?: (invoiceId: string) => void;
  onMarkAllPaid?: (invoiceIds: string[]) => void;
  onSendToTable: (invoiceId: string) => void;
  currency?: string;
  isSending?: (invoiceId: string) => boolean;
  isMarkingPaid?: (invoiceId: string) => boolean;
}

function BillingTableGroup({ group, onView, onMarkPaid, onMarkAllPaid, onSendToTable, currency, isSending, isMarkingPaid }: BillingTableGroupProps) {
  const isUnpaid = group.invoices.some(i => i.payment_status === 'unpaid');
  const unpaidInvoiceIds = group.invoices.filter(i => i.payment_status === 'unpaid').map(i => i.id);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Table {group.tableNumber}</p>
          <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
            {group.invoices.length} {group.invoices.length === 1 ? 'invoice' : 'invoices'} - latest {formatDate(group.latestCreatedAt)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <p className="flex-shrink-0 text-lg font-bold text-gray-900 dark:text-gray-100">
            {formatCurrency(group.total, currency)}
          </p>
          {isUnpaid && onMarkAllPaid && (
            <Button size="sm" variant="outline" onClick={() => onMarkAllPaid(unpaidInvoiceIds)}>
              Mark All Paid
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-2 border-t border-gray-100 pt-3 dark:border-gray-800">
        {group.invoices.map((invoice) => (
          <div key={invoice.id} className="rounded-lg bg-gray-50 p-3 dark:bg-gray-950">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">#{invoice.invoice_number}</span>
                  <Badge status={invoice.payment_status}>
                    {invoice.payment_status}
                    {invoice.payment_method ? ` (${invoice.payment_method})` : ''}
                  </Badge>
                </div>
                <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">{formatDate(invoice.created_at)}</p>
              </div>
              <p className="flex-shrink-0 text-sm font-bold text-gray-900 dark:text-gray-100">
                {formatCurrency(invoice.grand_total, currency)}
              </p>
            </div>

            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => onView(invoice)}>
                View
              </Button>
              <Button size="sm" variant="outline" className="flex-1" isLoading={Boolean(isSending?.(invoice.id))} disabled={Boolean(isMarkingPaid?.(invoice.id))} onClick={() => onSendToTable(invoice.id)}>
                Send to Table
              </Button>
              {invoice.payment_status === 'unpaid' && onMarkPaid && (
                <Button size="sm" className="flex-1" isLoading={Boolean(isMarkingPaid?.(invoice.id))} disabled={Boolean(isSending?.(invoice.id))} onClick={() => onMarkPaid(invoice.id)}>
                  Mark Paid
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TableCard({
  table,
  isActive,
  outstandingAmount,
  openItemsCount,
  onClick,
  currency
}: {
  table: Table | { id: string, table_number: string };
  isActive: boolean;
  outstandingAmount: number;
  openItemsCount: number;
  onClick: () => void;
  currency?: string;
}) {
  if (isActive) {
    return (
      <button
        onClick={onClick}
        className="text-left w-full rounded-xl bg-brand-600 p-4 shadow-sm transition-transform hover:shadow-md hover:-translate-y-0.5 flex flex-col justify-between min-h-[140px]"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <span className="font-semibold text-lg">Table {table.table_number}</span>
          </div>
          <span className="rounded-full bg-brand-500 px-2.5 py-0.5 text-xs font-semibold text-white">Active</span>
        </div>
        <hr className="border-brand-500/50 my-3" />
        <div>
          <p className="text-xl font-bold text-white">{formatCurrency(outstandingAmount, currency)} Outstanding</p>
          <p className="text-sm text-brand-100 font-medium mt-0.5">{openItemsCount} {openItemsCount === 1 ? 'Open Item' : 'Open Items'}</p>
        </div>
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      className="text-left w-full rounded-xl border-2 border-brand-500 bg-white p-4 shadow-sm transition-transform hover:shadow-md hover:-translate-y-0.5 flex flex-col justify-between min-h-[140px] dark:bg-gray-900"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
          <svg className="h-5 w-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          <span className="font-semibold text-lg">Table {table.table_number}</span>
        </div>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">Inactive</span>
      </div>
      <hr className="border-gray-100 my-3 dark:border-gray-800" />
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Inactive</p>
        <p className="text-xs text-gray-500 font-medium mt-0.5 dark:text-gray-400">No Active Bills</p>
      </div>
    </button>
  )
}

function BillingContent() {
  const [activeTab, setActiveTab] = useState<'overview' | 'paid' | 'payments'>('overview')
  const [paymentSubTab, setPaymentSubTab] = useState<'Online' | 'Cash'>('Online')
  const [tables, setTables] = useState<Table[]>([])
  const [activeOrders, setActiveOrders] = useState<OrderWithItems[]>([])
  const [unpaidInvoices, setUnpaidInvoices] = useState<Invoice[]>([])
  const [paidInvoices, setPaidInvoices] = useState<Invoice[]>([])
  const [unpaidPage] = useState(0)
  const [paidPage, setPaidPage] = useState(0)
  const [hasNextPaidPage, setHasNextPaidPage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [message, setMessage] = useState('')
  const [sendingInvoiceId, setSendingInvoiceId] = useState<string | null>(null)
  const [markingPaidInvoiceId, setMarkingPaidInvoiceId] = useState<string | null>(null)
  const [paymentModalInfo, setPaymentModalInfo] = useState<{ invoiceIds: string[] } | null>(null)
  
  const [selectedTableGroupId, setSelectedTableGroupId] = useState<string | null>(null)

  const realtimeHealthyRef = useRef(false)
  const { restaurant, loading: restaurantLoading } = useRestaurant()
  const supabase = createClient()

  const fetchData = useCallback(async () => {
    if (!restaurant) {
      setUnpaidInvoices([])
      setPaidInvoices([])
      setTables([])
      setActiveOrders([])
      setLoading(false)
      return
    }

    setLoading(true)
    const [unpaidResponse, paidResponse, tablesResult, ordersResult] = await Promise.all([
      fetch(`/api/invoices?restaurantId=${encodeURIComponent(restaurant.id)}&paymentStatus=unpaid&page=${unpaidPage}&pageSize=${pageSize}`),
      fetch(`/api/invoices?restaurantId=${encodeURIComponent(restaurant.id)}&paymentStatus=paid&page=${paidPage}&pageSize=${pageSize}`),
      supabase.from('tables').select('*').eq('restaurant_id', restaurant.id).order('table_number'),
      supabase.from('orders').select('*, items:order_items(*)').eq('restaurant_id', restaurant.id).in('status', ['pending', 'accepted', 'preparing', 'ready'])
    ])

    const unpaidResult = await unpaidResponse.json().catch(() => null)
    const paidResult = await paidResponse.json().catch(() => null)

    if (!unpaidResponse.ok || !paidResponse.ok) {
      setMessage(unpaidResult?.error || paidResult?.error || 'Failed to load invoices')
      toast.error(MESSAGES.billing.loadFailed)
      setUnpaidInvoices([])
      setPaidInvoices([])
      setTables([])
      setActiveOrders([])
      setLoading(false)
      return
    }

    const nextUnpaidInvoices = (unpaidResult?.invoices as Invoice[] | undefined) || []
    const nextPaidInvoices = (paidResult?.invoices as Invoice[] | undefined) || []

    setUnpaidInvoices(nextUnpaidInvoices)
    setPaidInvoices(nextPaidInvoices)
    setTables(tablesResult.data || [])
    setActiveOrders((ordersResult.data as OrderWithItems[]) || [])
    
    setHasNextPaidPage(nextPaidInvoices.length === pageSize)
    setLoading(false)
  }, [paidPage, restaurant, unpaidPage, supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const refreshSoon = useDebouncedRealtimeRefresh(fetchData)

  useEffect(() => {
    if (!restaurant) return

    const channel = supabase
      .channel(`billing-invoices:${restaurant.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invoices',
          filter: `restaurant_id=eq.${restaurant.id}`,
        },
        () => refreshSoon()
      )
      .subscribe((status) => {
        realtimeHealthyRef.current = status === 'SUBSCRIBED'
      })

    const interval = window.setInterval(() => {
      if (!realtimeHealthyRef.current) {
        fetchData()
      }
    }, 30000)

    return () => {
      window.clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [fetchData, refreshSoon, restaurant, supabase])

  const handleConfirmPayment = async (method: string) => {
    if (!paymentModalInfo) return;
    const { invoiceIds } = paymentModalInfo;
    setMarkingPaidInvoiceId('multiple');
    
    try {
      await Promise.all(invoiceIds.map(invoiceId => 
        fetch('/api/invoices', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceId, payment_status: 'paid', payment_method: method }),
        })
      ))
      await fetchData();
      setShowDetail(false);
      setPaymentModalInfo(null);
      toast.success(MESSAGES.billing.markPaidSuccess);
    } finally {
      setMarkingPaidInvoiceId(null);
    }
  }

  const handleSendToTable = async (invoiceId: string) => {
    if (sendingInvoiceId || markingPaidInvoiceId) return;
    setMessage('')
    setSendingInvoiceId(invoiceId)

    try {
      const response = await fetch("/api/invoices/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(result?.error || "Failed to send invoice");
        toast.error(MESSAGES.billing.sendFailed);
        return;
      }
      setMessage("Invoice sent to table");
      toast.success(MESSAGES.billing.invoiceSentToTable);
      await fetchData();
    } finally {
      setSendingInvoiceId(null);
    }
  }

  const unpaidInvoiceGroups = groupInvoicesByTable(unpaidInvoices)
  const paidInvoiceGroups = groupInvoicesByTable(paidInvoices)

  if (restaurantLoading || loading) {
    return <PageLoading />
  }

  // Calculate table cards
  const allTables = [...tables]
  unpaidInvoiceGroups.forEach(group => {
    if (!allTables.find(t => t.id === group.tableId)) {
      allTables.push({ id: group.tableId, table_number: group.tableNumber } as Table)
    }
  })
  
  activeOrders.forEach(order => {
    if (!allTables.find(t => t.id === order.table_id)) {
      allTables.push({ id: order.table_id, table_number: order.table?.table_number || 'Unknown' } as Table)
    }
  })

  // To avoid duplicate rendering due to duplicate pushes, deduplicate:
  const uniqueTables = Array.from(new Map(allTables.map(item => [item.id, item])).values())

  const activeCards: { table: Table | { id: string; table_number: string }; isActive: boolean; outstandingAmount: number; openItemsCount: number; group: TableInvoiceGroup | undefined }[] = []
  const inactiveCards: { table: Table | { id: string; table_number: string }; isActive: boolean; outstandingAmount: number; openItemsCount: number; group: TableInvoiceGroup | undefined }[] = []

  uniqueTables.forEach(table => {
    const group = unpaidInvoiceGroups.find(g => g.tableId === table.id)
    const tOrders = activeOrders.filter(o => o.table_id === table.id && hasBillableItems(o))
    
    const hasUnpaidInvoices = !!group
    const hasActiveOrders = tOrders.length > 0
    const isActive = hasUnpaidInvoices || hasActiveOrders
    
    // As per user instruction: Use invoice totals only.
    const outstandingAmount = group?.total || 0
    
    const openItemsCount = (group?.invoices.reduce((acc, inv) => acc + (inv.order?.items?.filter(i => !i.cancelled).length || 0), 0) || 0) +
                           tOrders.reduce((acc, o) => acc + o.items.filter(i => !i.cancelled).length, 0)
                           
    const cardData = {
      table,
      isActive,
      outstandingAmount,
      openItemsCount,
      group
    }
    
    if (isActive) activeCards.push(cardData)
    else inactiveCards.push(cardData)
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Billing Overview</h1>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Manage invoices and active tables</p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-lg dark:bg-gray-800 self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${activeTab === 'overview' ? 'bg-white shadow-sm text-gray-900 dark:bg-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
          >
            Table Overview
          </button>
          <button
            onClick={() => setActiveTab('paid')}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${activeTab === 'paid' ? 'bg-white shadow-sm text-gray-900 dark:bg-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
          >
            Paid / Completed
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${activeTab === 'payments' ? 'bg-white shadow-sm text-gray-900 dark:bg-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
          >
            Payments
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm font-medium text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
          {message}
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="space-y-8">
          <div>
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
              Active Tables
            </h2>
            {activeCards.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {activeCards.map(({ table, isActive, outstandingAmount, openItemsCount }) => (
                  <TableCard
                    key={table.id}
                    table={table}
                    isActive={isActive}
                    outstandingAmount={outstandingAmount}
                    openItemsCount={openItemsCount}
                    onClick={() => setSelectedTableGroupId(table.id)}
                    currency={restaurant?.currency}
                  />
                ))}
              </div>
            ) : (
              <EmptyState title="No active tables" description="All caught up!" />
            )}
          </div>

          <div>
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
              Inactive Tables
            </h2>
            {inactiveCards.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 opacity-80">
                {inactiveCards.map(({ table, isActive, outstandingAmount, openItemsCount }) => (
                  <TableCard
                    key={table.id}
                    table={table}
                    isActive={isActive}
                    outstandingAmount={outstandingAmount}
                    openItemsCount={openItemsCount}
                    onClick={() => {}}
                    currency={restaurant?.currency}
                  />
                ))}
              </div>
            ) : (
              <EmptyState title="No inactive tables" description="All tables are currently active." />
            )}
          </div>
        </div>
      )}

      {activeTab === 'paid' && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Paid / Completed Invoices
          </h2>
          {paidInvoiceGroups.length > 0 ? (
            <div className="space-y-3">
              {paidInvoiceGroups.map((group) => (
                <BillingTableGroup
                  key={group.tableId}
                  group={group}
                  onView={(invoice) => {
                    setSelectedInvoice(invoice);
                    setShowDetail(true);
                  }}
                  onSendToTable={handleSendToTable}
                  currency={restaurant?.currency}
                  isSending={(invoiceId) => sendingInvoiceId === invoiceId}
                  isMarkingPaid={(invoiceId) =>
                    markingPaidInvoiceId === invoiceId
                  }
                />
              ))}
              <div className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={paidPage === 0}
                  onClick={() => setPaidPage((page) => Math.max(0, page - 1))}
                >
                  Previous
                </Button>
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Page {paidPage + 1}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!hasNextPaidPage}
                  onClick={() => setPaidPage((page) => page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No paid invoices"
              description="Paid invoices will appear here."
            />
          )}
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="space-y-6">
          <div className="flex bg-gray-200 p-0.5 rounded-lg dark:bg-gray-700 self-start">
            <button
              onClick={() => setPaymentSubTab('Online')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${paymentSubTab === 'Online' ? 'bg-white shadow-sm text-gray-900 dark:bg-gray-800 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
            >
              Online Payment
            </button>
            <button
              onClick={() => setPaymentSubTab('Cash')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${paymentSubTab === 'Cash' ? 'bg-white shadow-sm text-gray-900 dark:bg-gray-800 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
            >
              Cash Payment
            </button>
          </div>

          {(() => {
            const filtered = paidInvoices.filter(inv => inv.payment_method === paymentSubTab)
            const dayGroups = groupInvoicesByDay(filtered)

            if (dayGroups.length === 0) {
              return (
                <EmptyState
                  title={paymentSubTab === 'Online' ? 'No online payments yet' : 'No cash payments yet'}
                  description={`${paymentSubTab} payments will appear here once invoices are marked paid.`}
                />
              )
            }

            return (
              <div className="space-y-6">
                {dayGroups.map(group => (
                  <div key={group.dateKey}>
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {group.label}
                    </h3>
                    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden dark:border-gray-800 dark:bg-gray-900">
                      <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {group.invoices.map(invoice => (
                          <div key={invoice.id} className="flex items-start gap-3 p-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                  Table {invoice.order?.table?.table_number || '—'}
                                </span>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                  paymentSubTab === 'Online'
                                    ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                }`}>
                                  {paymentSubTab}
                                </span>
                              </div>
                              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">
                                {getItemsSummary(invoice)}
                              </p>
                              <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                                {formatDate(invoice.created_at)}
                              </p>
                            </div>
                            <p className="flex-shrink-0 text-sm font-bold text-gray-900 dark:text-gray-100">
                              {formatCurrency(invoice.grand_total, restaurant?.currency)}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                          {group.invoices.length} {group.invoices.length === 1 ? 'payment' : 'payments'}
                        </span>
                        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                          {formatCurrency(group.subtotal, restaurant?.currency)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      )}

      <Modal isOpen={Boolean(selectedTableGroupId)} onClose={() => setSelectedTableGroupId(null)} title={`Table ${selectedTableGroupId ? uniqueTables.find(t => t.id === selectedTableGroupId)?.table_number : ''} Bills`}>
        {(() => {
          if (!selectedTableGroupId) return null
          const group = unpaidInvoiceGroups.find(g => g.tableId === selectedTableGroupId)
          if (!group) {
             return (
               <div className="py-6 text-center">
                 <p className="text-gray-500 dark:text-gray-400">This table has active orders being prepared, but no invoices have been generated yet.</p>
               </div>
             )
          }
          return (
            <BillingTableGroup
              group={group}
              onView={(invoice) => {
                setSelectedInvoice(invoice);
                setShowDetail(true);
              }}
              onMarkPaid={(invoiceId) => setPaymentModalInfo({ invoiceIds: [invoiceId] })}
              onMarkAllPaid={(invoiceIds) => setPaymentModalInfo({ invoiceIds })}
              onSendToTable={handleSendToTable}
              currency={restaurant?.currency}
              isSending={(invoiceId) => sendingInvoiceId === invoiceId}
              isMarkingPaid={(invoiceId) =>
                markingPaidInvoiceId === invoiceId || markingPaidInvoiceId === 'multiple'
              }
            />
          )
        })()}
      </Modal>

      <InvoiceDetail
        invoice={selectedInvoice}
        isOpen={showDetail}
        onClose={() => setShowDetail(false)}
        onMarkPaid={
          selectedInvoice?.payment_status === "unpaid"
            ? () => setPaymentModalInfo({ invoiceIds: [selectedInvoice.id] })
            : undefined
        }
        onSendToTable={
          selectedInvoice
            ? () => handleSendToTable(selectedInvoice.id)
            : undefined
        }
        currency={restaurant?.currency}
        sendingInvoiceId={sendingInvoiceId}
        markingPaidInvoiceId={markingPaidInvoiceId} 
      />

      <Modal isOpen={Boolean(paymentModalInfo)} onClose={() => setPaymentModalInfo(null)} title="Select Payment Method">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">How did the customer pay?</p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={() => handleConfirmPayment('Cash')} isLoading={Boolean(markingPaidInvoiceId)}>
              Cash
            </Button>
            <Button variant="outline" onClick={() => handleConfirmPayment('Online')} isLoading={Boolean(markingPaidInvoiceId)}>
              Online
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <BillingContent />
    </Suspense>
  )
}
