'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestaurant } from '@/hooks/useRestaurant'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoading } from '@/components/dashboard/PageLoading'
import { InvoiceDetail } from '@/components/billing/InvoiceDetail'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatCurrency, formatDate } from '@/utils/format'
import { Invoice } from '@/types'

const pageSize = 20

type TableInvoiceGroup = {
  tableId: string
  tableNumber: string
  invoices: Invoice[]
  total: number
  latestCreatedAt: string
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
  group: TableInvoiceGroup
  onView: (invoice: Invoice) => void
  onMarkPaid?: (invoiceId: string) => void
  onSendToTable: (invoiceId: string) => void
}

function BillingTableGroup({ group, onView, onMarkPaid, onSendToTable }: BillingTableGroupProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">Table {group.tableNumber}</p>
          <p className="mt-1 text-xs text-gray-500">
            {group.invoices.length} {group.invoices.length === 1 ? 'invoice' : 'invoices'} · latest {formatDate(group.latestCreatedAt)}
          </p>
        </div>
        <p className="flex-shrink-0 text-lg font-bold text-gray-900">
          {formatCurrency(group.total)}
        </p>
      </div>

      <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
        {group.invoices.map((invoice) => (
          <div key={invoice.id} className="rounded-lg bg-gray-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">#{invoice.invoice_number}</span>
                  <Badge status={invoice.payment_status}>{invoice.payment_status}</Badge>
                </div>
                <p className="mt-1 text-xs text-gray-500">{formatDate(invoice.created_at)}</p>
              </div>
              <p className="flex-shrink-0 text-sm font-bold text-gray-900">
                {formatCurrency(invoice.grand_total)}
              </p>
            </div>

            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => onView(invoice)}>
                View
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => onSendToTable(invoice.id)}>
                Send to Table
              </Button>
              {invoice.payment_status === 'unpaid' && onMarkPaid && (
                <Button size="sm" className="flex-1" onClick={() => onMarkPaid(invoice.id)}>
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

function BillingContent() {
  const [unpaidInvoices, setUnpaidInvoices] = useState<Invoice[]>([])
  const [paidInvoices, setPaidInvoices] = useState<Invoice[]>([])
  const [unpaidPage, setUnpaidPage] = useState(0)
  const [paidPage, setPaidPage] = useState(0)
  const [hasNextUnpaidPage, setHasNextUnpaidPage] = useState(false)
  const [hasNextPaidPage, setHasNextPaidPage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [message, setMessage] = useState('')
  const { restaurant, loading: restaurantLoading } = useRestaurant()
  const supabase = createClient()

  const fetchData = useCallback(async () => {
    if (!restaurant) {
      setUnpaidInvoices([])
      setPaidInvoices([])
      setLoading(false)
      return
    }

    setLoading(true)
    const [unpaidResponse, paidResponse] = await Promise.all([
      fetch(`/api/invoices?restaurantId=${encodeURIComponent(restaurant.id)}&paymentStatus=unpaid&page=${unpaidPage}&pageSize=${pageSize}`),
      fetch(`/api/invoices?restaurantId=${encodeURIComponent(restaurant.id)}&paymentStatus=paid&page=${paidPage}&pageSize=${pageSize}`),
    ])

    const unpaidResult = await unpaidResponse.json().catch(() => null)
    const paidResult = await paidResponse.json().catch(() => null)

    if (!unpaidResponse.ok || !paidResponse.ok) {
      setMessage(unpaidResult?.error || paidResult?.error || 'Failed to load invoices')
      setUnpaidInvoices([])
      setPaidInvoices([])
      setLoading(false)
      return
    }

    const nextUnpaidInvoices = (unpaidResult?.invoices as Invoice[] | undefined) || []
    const nextPaidInvoices = (paidResult?.invoices as Invoice[] | undefined) || []

    setUnpaidInvoices(nextUnpaidInvoices)
    setPaidInvoices(nextPaidInvoices)
    setHasNextUnpaidPage(nextUnpaidInvoices.length === pageSize)
    setHasNextPaidPage(nextPaidInvoices.length === pageSize)
    setLoading(false)
  }, [paidPage, restaurant, supabase, unpaidPage])

  useEffect(() => {
    fetchData()
  }, [fetchData])

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
        () => {
          fetchData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchData, restaurant, supabase])

  const handleMarkPaid = async (invoiceId: string) => {
    await fetch('/api/invoices', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId, payment_status: 'paid' }),
    })
    fetchData()
    setShowDetail(false)
  }

  const handleSendToTable = async (invoiceId: string) => {
    setMessage('')
    const response = await fetch('/api/invoices/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId }),
    })
    const result = await response.json().catch(() => null)
    if (!response.ok) {
      setMessage(result?.error || 'Failed to send invoice')
      return
    }
    setMessage('Invoice sent to table')
    fetchData()
  }

  const unpaidInvoiceGroups = groupInvoicesByTable(unpaidInvoices)
  const paidInvoiceGroups = groupInvoicesByTable(paidInvoices)

  if (restaurantLoading || loading) {
    return <PageLoading />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <p className="text-sm text-gray-500">Manage invoices and payments</p>
      </div>

      {message && (
        <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
          {message}
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Unpaid Invoices</h2>
        {unpaidInvoiceGroups.length > 0 ? (
          <div className="space-y-3">
            {unpaidInvoiceGroups.map((group) => (
              <BillingTableGroup
                key={group.tableId}
                group={group}
                onView={(invoice) => { setSelectedInvoice(invoice); setShowDetail(true) }}
                onMarkPaid={handleMarkPaid}
                onSendToTable={handleSendToTable}
              />
            ))}
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={unpaidPage === 0}
                onClick={() => setUnpaidPage((page) => Math.max(0, page - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-gray-500">Page {unpaidPage + 1}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasNextUnpaidPage}
                onClick={() => setUnpaidPage((page) => page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : (
          <EmptyState title="No unpaid invoices" description="All caught up!" />
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Paid / Completed Invoices</h2>
        {paidInvoiceGroups.length > 0 ? (
          <div className="space-y-3">
            {paidInvoiceGroups.map((group) => (
              <BillingTableGroup
                key={group.tableId}
                group={group}
                onView={(invoice) => { setSelectedInvoice(invoice); setShowDetail(true) }}
                onSendToTable={handleSendToTable}
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
              <span className="text-sm text-gray-500">Page {paidPage + 1}</span>
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
          <EmptyState title="No paid invoices" description="Paid invoices will appear here." />
        )}
      </div>

      <InvoiceDetail
        invoice={selectedInvoice}
        isOpen={showDetail}
        onClose={() => setShowDetail(false)}
        onMarkPaid={selectedInvoice?.payment_status === 'unpaid' ? () => handleMarkPaid(selectedInvoice.id) : undefined}
        onSendToTable={selectedInvoice ? () => handleSendToTable(selectedInvoice.id) : undefined}
      />
    </div>
  )
}

export default function BillingPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <BillingContent />
    </Suspense>
  )
}
