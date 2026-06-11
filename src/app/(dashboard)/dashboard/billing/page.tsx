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
  group: TableInvoiceGroup;
  onView: (invoice: Invoice) => void;
  onMarkPaid?: (invoiceIds: string[]) => void;
  onSendToTable: (invoiceId: string) => void;
  currency?: string;
  isSending?: (invoiceId: string) => boolean;
  isMarkingPaid?: (invoiceId: string) => boolean;
}

function BillingTableGroup({ group, onView, onMarkPaid, onSendToTable, currency, isSending, isMarkingPaid  }: BillingTableGroupProps) {
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
          {group.invoices.some(i => i.payment_status === 'unpaid') && onMarkPaid && (
            <Button size="sm" onClick={() => onMarkPaid(group.invoices.filter(i => i.payment_status === 'unpaid').map(i => i.id))}>
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
                  <Badge status={invoice.payment_status}>{invoice.payment_status}</Badge>
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
                <Button size="sm" className="flex-1" isLoading={Boolean(isMarkingPaid?.(invoice.id))} disabled={Boolean(isSending?.(invoice.id))} onClick={() => onMarkPaid([invoice.id])}>
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
  const [sendingInvoiceId, setSendingInvoiceId] = useState<string | null>(null)
  const [markingPaidInvoiceId, setMarkingPaidInvoiceId] = useState<string | null>(null)
  const [paymentMethodModal, setPaymentMethodModal] = useState<{ invoiceIds: string[] } | null>(null)
  const realtimeHealthyRef = useRef(false)
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
      toast.error(MESSAGES.billing.loadFailed)
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
  }, [paidPage, restaurant, unpaidPage])

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

  const handleMarkPaid = async (invoiceIds: string[], paymentMethod: string) => {
      if (markingPaidInvoiceId || sendingInvoiceId) return;
      setMarkingPaidInvoiceId(invoiceIds[0]);
      setPaymentMethodModal(null);
  try {
      await Promise.all(invoiceIds.map(id => fetch('/api/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: id, payment_status: 'paid', payment_method: paymentMethod }),
      })));
      await fetchData();
      setShowDetail(false);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Billing</h1>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Manage invoices and payments</p>
      </div>

      {message && (
        <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm font-medium text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
          {message}
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Unpaid Invoices
        </h2>
        {unpaidInvoiceGroups.length > 0 ? (
          <div className="space-y-3">
            {unpaidInvoiceGroups.map((group) => (
              <BillingTableGroup
                key={group.tableId}
                group={group}
                onView={(invoice) => {
                  setSelectedInvoice(invoice);
                  setShowDetail(true);
                }}
                onMarkPaid={(invoiceIds) => setPaymentMethodModal({ invoiceIds })}
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
                disabled={unpaidPage === 0}
                onClick={() => setUnpaidPage((page) => Math.max(0, page - 1))}
              >
                Previous
              </Button>
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Page {unpaidPage + 1}
              </span>
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
        <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
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

      <InvoiceDetail
        invoice={selectedInvoice}
        isOpen={showDetail}
        onClose={() => setShowDetail(false)}
        onMarkPaid={
          selectedInvoice?.payment_status === "unpaid"
            ? () => setPaymentMethodModal({ invoiceIds: [selectedInvoice.id] })
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

      <Modal 
        isOpen={Boolean(paymentMethodModal)} 
        onClose={() => setPaymentMethodModal(null)} 
        title="Select Payment Method"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">How was this invoice paid?</p>
          <div className="flex gap-3">
            <Button 
              className="flex-1 gap-2" 
              variant="outline"
              onClick={() => paymentMethodModal && handleMarkPaid(paymentMethodModal.invoiceIds, 'cash')}
            >
              💵 Cash
            </Button>
            <Button 
              className="flex-1 gap-2" 
              variant="outline"
              onClick={() => paymentMethodModal && handleMarkPaid(paymentMethodModal.invoiceIds, 'online')}
            >
              📱 Online
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
