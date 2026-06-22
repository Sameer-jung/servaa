'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatCurrency } from '@/utils/format'
import { hasBillableItems } from '@/utils/orders'
import { useRole } from '@/hooks/useRole'
import type { Bill, OrderWithItems, Restaurant } from '@/types'
import { roundCents } from '@/lib/billing/calculations'
import { buildReceiptData } from '@/lib/billing/receipt'
import { printReceiptInBrowser } from '@/lib/billing/receiptHtml'

const ROUNDING_TOLERANCE = 0.01

type BillSummary = {
  id: string
  status: 'open' | 'paid'
  table_id: string
  created_at: string
  customer_name: string | null
  table_number: string | null
  order_ids: string[]
  total: number
  paid: number
  owed: number
}

interface BillManagerModalProps {
  isOpen: boolean
  onClose: () => void
  restaurant: Restaurant
  tableId: string
  tableNumber: string
}

export function BillManagerModal({ isOpen, onClose, restaurant, tableId, tableNumber }: BillManagerModalProps) {
  const [billSummaries, setBillSummaries] = useState<BillSummary[]>([])
  const [availableOrders, setAvailableOrders] = useState<OrderWithItems[]>([])
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([])
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null)
  const [loading, setLoading] = useState(true)
  const [creatingBill, setCreatingBill] = useState(false)
  const supabase = createClient()
  const { isOwner } = useRole(restaurant.id)

  const billedOrderIds = useMemo(() => new Set(billSummaries.flatMap((b) => b.order_ids)), [billSummaries])
  // Settled bills are done — only uncleared ones are worth surfacing here.
  const openBillSummaries = useMemo(() => billSummaries.filter((b) => b.status === 'open'), [billSummaries])

  const fetchList = useCallback(async () => {
    setLoading(true)
    const [billsRes, ordersRes] = await Promise.all([
      fetch(`/api/billing/bills?restaurantId=${restaurant.id}&tableId=${tableId}`),
      supabase
        .from('orders')
        .select('*, items:order_items(*, menu_item:menu_items(name)), table:tables(*), invoice:invoices(payment_status)')
        .eq('restaurant_id', restaurant.id)
        .eq('table_id', tableId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false }),
    ])

    const billsResult = await billsRes.json().catch(() => null)
    if (billsRes.ok) {
      setBillSummaries(billsResult?.bills || [])
    } else {
      toast.error(billsResult?.error || 'Failed to load bills')
    }

    // Orders already settled through the existing per-order invoice flow
    // (paid before this combine feature existed, or settled without ever
    // being combined) are done — only unpaid/un-invoiced orders are still
    // outstanding and worth offering to combine.
    type OrderRowWithInvoice = OrderWithItems & { invoice?: { payment_status: string } | { payment_status: string }[] | null }
    const allOrders = (ordersRes.data as OrderRowWithInvoice[]) || []
    const outstandingOrders = allOrders.filter((order) => {
      const invoice = Array.isArray(order.invoice) ? order.invoice[0] : order.invoice
      return invoice?.payment_status !== 'paid'
    })

    setAvailableOrders(outstandingOrders)
    setLoading(false)
  }, [restaurant.id, tableId, supabase])

  useEffect(() => {
    if (isOpen) {
      setSelectedBill(null)
      setSelectedOrderIds([])
      fetchList()
    }
  }, [isOpen, fetchList])

  const unbilledOrders = availableOrders.filter(
    (order) => hasBillableItems(order) && !billedOrderIds.has(order.id)
  )

  const openBill = async (billId: string) => {
    const res = await fetch(`/api/billing/bills?restaurantId=${restaurant.id}&billId=${billId}`)
    const result = await res.json().catch(() => null)
    if (!res.ok) {
      toast.error(result?.error || 'Failed to load bill')
      return
    }
    setSelectedBill(result.bill)
  }

  const handleCreateBill = async () => {
    if (selectedOrderIds.length === 0) return
    setCreatingBill(true)
    try {
      const res = await fetch('/api/billing/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId: restaurant.id, tableId, orderIds: selectedOrderIds }),
      })
      const result = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(result?.error || 'Failed to create bill')
        return
      }
      toast.success('Bill created')
      setSelectedOrderIds([])
      await fetchList()
      setSelectedBill(result.bill)
    } finally {
      setCreatingBill(false)
    }
  }

  const handleDeleteBill = async (billId: string) => {
    const res = await fetch(`/api/billing/bills?restaurantId=${restaurant.id}&billId=${billId}`, { method: 'DELETE' })
    const result = await res.json().catch(() => null)
    if (!res.ok) {
      toast.error(result?.error || 'Failed to delete bill')
      return
    }
    toast.success('Bill deleted')
    setSelectedBill(null)
    await fetchList()
  }

  const refreshSelectedBill = async (billId: string) => {
    await openBill(billId)
    await fetchList()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        selectedBill
          ? `Bill - Table ${tableNumber}${selectedBill.customer_name ? ` (${selectedBill.customer_name})` : ''}`
          : `Combine & Split - Table ${tableNumber}`
      }
      className="max-w-2xl"
    >
      {selectedBill ? (
        <BillDetailView
          bill={selectedBill}
          restaurant={restaurant}
          isOwner={isOwner}
          unbilledOrders={unbilledOrders}
          onBack={() => setSelectedBill(null)}
          onRefresh={() => refreshSelectedBill(selectedBill.id)}
          onDelete={() => handleDeleteBill(selectedBill.id)}
        />
      ) : (
        <div className="space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Open Bills</h3>
            {loading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
            ) : openBillSummaries.length === 0 ? (
              <EmptyState title="No open bills" description="Combine completed orders below to start one." />
            ) : (
              <div className="space-y-2">
                {openBillSummaries.map((bill) => (
                  <button
                    key={bill.id}
                    onClick={() => openBill(bill.id)}
                    className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white p-3 text-left hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {bill.order_ids.length} {bill.order_ids.length === 1 ? 'order' : 'orders'} combined
                        {bill.customer_name ? ` — ${bill.customer_name}` : ''}
                      </p>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Owed {formatCurrency(bill.owed, restaurant.currency)}
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                      {bill.status}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Completed Orders to Combine</h3>
              {unbilledOrders.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedOrderIds((prev) =>
                      prev.length === unbilledOrders.length ? [] : unbilledOrders.map((o) => o.id)
                    )
                  }
                  className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                >
                  {selectedOrderIds.length === unbilledOrders.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>
            {unbilledOrders.length === 0 ? (
              <EmptyState title="Nothing to combine" description="Completed orders for this table will show up here." />
            ) : (
              <div className="space-y-2">
                {unbilledOrders.map((order) => {
                  const isSelected = selectedOrderIds.includes(order.id)
                  return (
                    <label
                      key={order.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) =>
                            setSelectedOrderIds((prev) =>
                              e.target.checked ? [...prev, order.id] : prev.filter((id) => id !== order.id)
                            )
                          }
                        />
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {order.items.filter((i) => !i.cancelled).map((i) => `${i.quantity}x ${i.item_name_snapshot || i.menu_item?.name || 'Item'}`).join(', ')}
                          </p>
                        </div>
                      </div>
                      <p className="flex-shrink-0 text-sm font-bold text-gray-900 dark:text-gray-100">
                        {formatCurrency(order.total_amount, restaurant.currency)}
                      </p>
                    </label>
                  )
                })}
                <Button className="w-full" isLoading={creatingBill} disabled={selectedOrderIds.length === 0} onClick={handleCreateBill}>
                  Combine {selectedOrderIds.length > 0 ? `${selectedOrderIds.length} ` : ''}into Bill
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

interface BillDetailViewProps {
  bill: Bill
  restaurant: Restaurant
  isOwner: boolean
  unbilledOrders: OrderWithItems[]
  onBack: () => void
  onRefresh: () => void
  onDelete: () => void
}

function BillDetailView({ bill, restaurant, isOwner, unbilledOrders, onBack, onRefresh, onDelete }: BillDetailViewProps) {
  const [showAddOrders, setShowAddOrders] = useState(false)
  const [addOrderIds, setAddOrderIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [customerName, setCustomerName] = useState(bill.customer_name || '')
  const [savingName, setSavingName] = useState(false)

  useEffect(() => {
    setCustomerName(bill.customer_name || '')
  }, [bill.id, bill.customer_name])

  const handleSaveCustomerName = async () => {
    setSavingName(true)
    try {
      const res = await fetch('/api/billing/bills', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billId: bill.id, restaurantId: restaurant.id, customerName }),
      })
      const result = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(result?.error || 'Failed to save name')
        return
      }
      toast.success('Saved')
      onRefresh()
    } finally {
      setSavingName(false)
    }
  }

  const billableItems = useMemo(
    () => (bill.orders || []).flatMap((o) => (o.items || []).filter((i) => !i.cancelled)),
    [bill.orders]
  )

  const addableOrders = unbilledOrders.filter((o) => !(bill.orders || []).some((bo) => bo.id === o.id))

  const handleAddOrders = async () => {
    if (addOrderIds.length === 0) return
    setBusy(true)
    try {
      const res = await fetch('/api/billing/bills', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billId: bill.id, restaurantId: restaurant.id, addOrderIds }),
      })
      const result = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(result?.error || 'Failed to add orders')
        return
      }
      toast.success('Orders added to bill')
      setAddOrderIds([])
      setShowAddOrders(false)
      onRefresh()
    } finally {
      setBusy(false)
    }
  }

  const printReceipt = () => {
    const data = buildReceiptData(restaurant, bill)
    printReceiptInBrowser(data)
  }

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={onBack}>
        ← Back to bills
      </Button>

      {bill.status === 'open' && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <Input
            label="Tab name (who owes this?)"
            placeholder="e.g. John, Room 4 — optional"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            disabled={savingName}
          />
          {customerName !== (bill.customer_name || '') && (
            <Button size="sm" className="mt-2" isLoading={savingName} onClick={handleSaveCustomerName}>
              Save
            </Button>
          )}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Items</h4>
        <div className="space-y-1">
          {billableItems.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-300">
                {item.quantity}x {item.item_name_snapshot || item.menu_item?.name || 'Item'}
              </span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {formatCurrency(item.price_snapshot * item.quantity, restaurant.currency)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1 border-t border-gray-100 pt-3 dark:border-gray-800">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(bill.subtotal || 0, restaurant.currency)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Tax</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(bill.tax_amount || 0, restaurant.currency)}</span>
          </div>
          <div className="flex justify-between text-base font-bold text-gray-900 dark:text-gray-100">
            <span>Total</span>
            <span>{formatCurrency(bill.total || 0, restaurant.currency)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Paid</span>
            <span className="font-medium text-emerald-600">{formatCurrency(bill.paid || 0, restaurant.currency)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Owed</span>
            <span className="font-semibold text-amber-600">{formatCurrency(bill.owed || 0, restaurant.currency)}</span>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={printReceipt}>
            Print Receipt
          </Button>
          {addableOrders.length > 0 && bill.status === 'open' && (
            <Button size="sm" variant="outline" className="flex-1" onClick={() => setShowAddOrders((v) => !v)}>
              Add Orders
            </Button>
          )}
          {isOwner && bill.status === 'open' && (
            <Button size="sm" variant="danger" onClick={onDelete}>
              Delete
            </Button>
          )}
        </div>

        {showAddOrders && (
          <div className="mt-3 space-y-2 rounded-lg border border-gray-100 p-3 dark:border-gray-800">
            {addableOrders.map((order) => (
              <label key={order.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={addOrderIds.includes(order.id)}
                  onChange={(e) =>
                    setAddOrderIds((prev) => (e.target.checked ? [...prev, order.id] : prev.filter((id) => id !== order.id)))
                  }
                />
                <span>{formatCurrency(order.total_amount, restaurant.currency)} - {order.items.filter((i) => !i.cancelled).length} items</span>
              </label>
            ))}
            <Button size="sm" isLoading={busy} disabled={addOrderIds.length === 0} onClick={handleAddOrders}>
              Add to Bill
            </Button>
          </div>
        )}
      </div>

      {bill.status === 'open' && (bill.owed || 0) > 0 && (
        <SplitByMoneyForm bill={bill} restaurant={restaurant} owed={bill.owed || 0} onRecorded={onRefresh} />
      )}
    </div>
  )
}

interface SplitByMoneyFormProps {
  bill: Bill
  restaurant: Restaurant
  owed: number
  onRecorded: () => void
}

// Lets staff settle a bill across multiple payment methods at once instead
// of recording them one at a time — e.g. part of the total in cash, the rest
// via QR/online — by entering both amounts and submitting in a single action.
function SplitByMoneyForm({ bill, restaurant, owed, onRecorded }: SplitByMoneyFormProps) {
  const [cashAmount, setCashAmount] = useState('')
  const [onlineAmount, setOnlineAmount] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setCashAmount('')
    setOnlineAmount('')
  }, [owed])

  const cash = Math.max(0, Number(cashAmount) || 0)
  const online = Math.max(0, Number(onlineAmount) || 0)
  const totalEntered = roundCents(cash + online)
  const remaining = roundCents(owed - totalEntered)

  const recordOne = async (amount: number, method: string) => {
    const res = await fetch('/api/billing/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billId: bill.id, restaurantId: restaurant.id, amount, method }),
    })
    const result = await res.json().catch(() => null)
    if (!res.ok) throw new Error(result?.error || `Failed to record ${method} payment`)
  }

  const handleSubmit = async () => {
    if (cash <= 0 && online <= 0) {
      toast.error('Enter at least one amount')
      return
    }
    if (totalEntered > owed + ROUNDING_TOLERANCE) {
      toast.error(`Amounts exceed what is owed (${formatCurrency(owed, restaurant.currency)})`)
      return
    }

    setBusy(true)
    try {
      if (cash > 0) await recordOne(cash, 'Cash')
      if (online > 0) await recordOne(online, 'Online')
      toast.success('Payment recorded')
      onRecorded()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to record payment')
      onRecorded()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Split by Money</h4>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Cash"
          type="number"
          step="0.01"
          min="0"
          value={cashAmount}
          onChange={(e) => setCashAmount(e.target.value)}
          disabled={busy}
        />
        <Input
          label="QR / Online"
          type="number"
          step="0.01"
          min="0"
          value={onlineAmount}
          onChange={(e) => setOnlineAmount(e.target.value)}
          disabled={busy}
        />
      </div>
      <div className="flex justify-between text-xs font-medium text-gray-500 dark:text-gray-400">
        <span>Entered: {formatCurrency(totalEntered, restaurant.currency)}</span>
        <span className={remaining > 0.01 ? 'text-amber-600' : remaining < -0.01 ? 'text-red-600' : 'text-emerald-600'}>
          {remaining > 0.01
            ? `Remaining: ${formatCurrency(remaining, restaurant.currency)}`
            : remaining < -0.01
              ? `Over by ${formatCurrency(Math.abs(remaining), restaurant.currency)}`
              : 'Fully covers owed amount'}
        </span>
      </div>
      <Button className="w-full" isLoading={busy} onClick={handleSubmit}>
        Record Payment
      </Button>
    </div>
  )
}
