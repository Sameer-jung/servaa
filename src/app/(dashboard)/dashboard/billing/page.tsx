'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestaurant } from '@/hooks/useRestaurant'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoading } from '@/components/dashboard/PageLoading'
import { InvoiceCard } from '@/components/billing/InvoiceCard'
import { InvoiceDetail } from '@/components/billing/InvoiceDetail'
import { Invoice } from '@/types'

function BillingContent() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [message, setMessage] = useState('')
  const { restaurant, loading: restaurantLoading } = useRestaurant()
  const supabase = createClient()

  const fetchData = useCallback(async () => {
    if (!restaurant) {
      setInvoices([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data: invs } = await supabase
      .from('invoices')
      .select('*, order:orders(*, table:tables(table_number), items:order_items(*, menu_item:menu_items(name)))')
      .eq('restaurant_id', restaurant.id)
      .order('created_at', { ascending: false })

    setInvoices((invs as Invoice[] | null) || [])
    setLoading(false)
  }, [restaurant, supabase])

  const reconcileMissingInvoices = useCallback(async () => {
    if (!restaurant) return

    const [{ data: completedOrders }, { data: existingInvoices }] = await Promise.all([
      supabase
        .from('orders')
        .select('id, items:order_items(id)')
        .eq('restaurant_id', restaurant.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('invoices')
        .select('order_id')
        .eq('restaurant_id', restaurant.id),
    ])

    const invoicedOrderIds = new Set((existingInvoices || []).map((invoice) => invoice.order_id))
    const missingInvoiceOrders = (completedOrders || []).filter((order) => {
      const items = Array.isArray(order.items) ? order.items : []
      return items.length > 0 && !invoicedOrderIds.has(order.id)
    })

    if (missingInvoiceOrders.length === 0) return

    await Promise.all(
      missingInvoiceOrders.map((order) =>
        fetch('/api/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: order.id, restaurantId: restaurant.id }),
        })
      )
    )
  }, [restaurant, supabase])

  useEffect(() => {
    if (!restaurant) {
      fetchData()
      return
    }

    let cancelled = false

    async function loadBilling() {
      setLoading(true)
      await reconcileMissingInvoices()
      if (!cancelled) {
        await fetchData()
      }
    }

    loadBilling()

    return () => {
      cancelled = true
    }
  }, [fetchData, reconcileMissingInvoices, restaurant])

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
    await supabase.from('invoices').update({ payment_status: 'paid', paid_at: new Date().toISOString() }).eq('id', invoiceId)
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

  const unpaidInvoices = invoices.filter((i) => i.payment_status === 'unpaid')
  const paidInvoices = invoices.filter((i) => i.payment_status === 'paid')

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
        {unpaidInvoices.length > 0 ? (
          <div className="space-y-3">
            {unpaidInvoices.map((invoice) => (
              <InvoiceCard
                key={invoice.id}
                invoice={invoice}
                onView={() => { setSelectedInvoice(invoice); setShowDetail(true) }}
                onMarkPaid={() => handleMarkPaid(invoice.id)}
                onSendToTable={() => handleSendToTable(invoice.id)}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No unpaid invoices" description="All caught up!" />
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Paid / Completed Invoices</h2>
        {paidInvoices.length > 0 ? (
          <div className="space-y-3">
            {paidInvoices.map((invoice) => (
              <InvoiceCard
                key={invoice.id}
                invoice={invoice}
                onView={() => { setSelectedInvoice(invoice); setShowDetail(true) }}
                onSendToTable={() => handleSendToTable(invoice.id)}
              />
            ))}
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
