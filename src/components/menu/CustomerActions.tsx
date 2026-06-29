'use client'

import toast from "react-hot-toast";
import { MESSAGES } from "@/utils/messages";
import { useState } from 'react'
import posthog from 'posthog-js'
import { Droplet, Bell, Receipt, ConciergeBell, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { formatCurrency } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { Modifier } from '@/types'

interface CustomerActionsProps {
  restaurantId: string
  tableId: string
  customerSessionId?: string | null
  tableToken?: string
  currency?: string
}

type OrderItemData = {
  id: string
  quantity: number
  price_snapshot: number
  item_name_snapshot?: string | null
  modifiers?: Modifier[] | null
  menu_item?: { name: string } | null
}

type ActiveBillData = {
  items: OrderItemData[]
  subtotal: number
  total: number
}

export function CustomerActions({ restaurantId, tableId, customerSessionId, tableToken, currency = 'USD' }: CustomerActionsProps) {
  const [requesting, setRequesting] = useState<'water' | 'bill' | 'waiter' | null>(null)
  const [confirmed, setConfirmed] = useState<string | null>(null)
  const [showOrderFirst, setShowOrderFirst] = useState(false)
  const [billData, setBillData] = useState<ActiveBillData | null>(null)
  const [showBillModal, setShowBillModal] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const fetchBillData = async (): Promise<ActiveBillData | null> => {
    const params = new URLSearchParams({ tableId })
    if (customerSessionId) params.set('customerSessionId', customerSessionId)
    if (tableToken) params.set('tableToken', tableToken)

    const res = await fetch(`/api/orders/bill?${params}`)
    if (!res.ok) return null
    const json = await res.json().catch(() => null)
    const data: {
      id: string
      special_instructions?: string | null
      total_amount?: number | null
      items?: { id: string; quantity: number; price_snapshot: number; item_name_snapshot?: string | null; modifiers?: Modifier[] | null; menu_item?: { name: string } | null }[]
      invoices?: { payment_status: string }[] | { payment_status: string } | null
    }[] | null = json?.orders ?? null

    if (!data) return null;

    const items: OrderItemData[] = []
    let total = 0
    let hasRealOrders = false

    data.forEach(order => {
      if (order.special_instructions?.toLowerCase().startsWith('request:')) return;
      
      const orderInvoices = Array.isArray(order.invoices) ? order.invoices : (order.invoices ? [order.invoices] : [])
      const isPaid = orderInvoices.some((inv) => inv.payment_status === 'paid')
      if (isPaid) return;

      hasRealOrders = true;
      total += Number(order.total_amount || 0)

      const orderItems = Array.isArray(order.items) ? order.items : []
      orderItems.forEach((item) => {
        items.push({
          id: item.id,
          quantity: item.quantity,
          price_snapshot: item.price_snapshot,
          modifiers: item.modifiers || [],
          menu_item: Array.isArray(item.menu_item) ? item.menu_item[0] : item.menu_item,
        })
      })
    })

    if (!hasRealOrders) return null;

    return {
      items,
      subtotal: total,
      total
    }
  }

  const handleActionClick = async (type: 'water' | 'bill' | 'waiter') => {
    setIsExpanded(false)
    setRequesting(type)

    if (type === 'bill') {
      if (!customerSessionId) {
        setRequesting(null)
        toast.error("Please refresh the page and try again.");
        return;
      }

      const bill = await fetchBillData()
      if (!bill) {
        setRequesting(null)
        setShowOrderFirst(true)
        toast.error("Please place an order before requesting the bill.");
        return
      }

      setBillData(bill)
      setShowBillModal(true)
      setRequesting(null)
      return
    }

    await performServiceRequest(type)
  }

  const performServiceRequest = async (type: 'water' | 'bill' | 'waiter') => {
    setRequesting(type)

    try {
      const res = await fetch('/api/service-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, tableId, type, customerSessionId, tableToken }),
      })

      if (!res.ok) throw new Error('request failed')

      posthog.capture('service_request_created', {
        restaurant_id: restaurantId,
        table_id: tableId,
        request_type: type,
      })

      setConfirmed(type)
      setTimeout(() => setConfirmed(null), 3000)
      if (type === 'bill') setShowBillModal(false)

      const msg =
        type === 'water'
          ? MESSAGES.serviceRequest.waterSent
          : type === 'waiter'
            ? 'Waiter requested!'
            : MESSAGES.serviceRequest.billSent
      toast.success(msg)
    } catch {
      toast.error(MESSAGES.serviceRequest.sendFailed)
    } finally {
      setRequesting(null)
    }
  }

  return (
    <>
      {isExpanded && (
        <button
          type="button"
          aria-label="Close actions"
          onClick={() => setIsExpanded(false)}
          className="fixed inset-0 z-40 bg-black/10 lg:hidden"
        />
      )}

      {/* z-50 matches StickyCart's floating-button convention — anything
          lower gets hidden behind StickyCart's full-width "Order sent to the
          kitchen" confirmation bar (z-40), which stays up indefinitely after
          an order is placed, the same moment this FAB mounts. */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2 lg:hidden">
        <div
          className={cn(
            'flex flex-col items-end gap-2 transition-all duration-200',
            isExpanded
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-2 opacity-0',
          )}
        >
          <button
            type="button"
            onClick={() => handleActionClick('water')}
            disabled={requesting !== null}
            className="flex items-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-lg ring-1 ring-gray-100 active:bg-gray-50 disabled:opacity-60"
          >
            <Droplet className="h-4 w-4 flex-shrink-0 text-brand-600" />
            {confirmed === 'water' ? 'Requested!' : 'Water'}
          </button>
          <button
            type="button"
            onClick={() => handleActionClick('waiter')}
            disabled={requesting !== null}
            className="flex items-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-lg ring-1 ring-gray-100 active:bg-gray-50 disabled:opacity-60"
          >
            <Bell className="h-4 w-4 flex-shrink-0 text-brand-600" />
            {confirmed === 'waiter' ? 'Requested!' : 'Waiter'}
          </button>
          <button
            type="button"
            onClick={() => handleActionClick('bill')}
            disabled={requesting !== null}
            className="flex items-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-lg ring-1 ring-gray-100 active:bg-gray-50 disabled:opacity-60"
          >
            <Receipt className="h-4 w-4 flex-shrink-0 text-brand-600" />
            {confirmed === 'bill' ? 'Requested!' : 'Bill'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((open) => !open)}
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-2xl shadow-brand-600/30 transition-transform active:scale-95"
          aria-label={isExpanded ? 'Close actions' : 'Need help?'}
          aria-expanded={isExpanded}
        >
          <span
            className={cn(
              'absolute transition-all duration-200',
              isExpanded ? 'rotate-90 opacity-0' : 'rotate-0 opacity-100',
            )}
          >
            <ConciergeBell className="h-6 w-6" />
          </span>
          <span
            className={cn(
              'absolute transition-all duration-200',
              isExpanded ? 'rotate-0 opacity-100' : '-rotate-90 opacity-0',
            )}
          >
            <X className="h-6 w-6" />
          </span>
        </button>
      </div>

      <Modal isOpen={showOrderFirst} onClose={() => setShowOrderFirst(false)} title="Order something first">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Order something first</p>
          <Button className="w-full" onClick={() => setShowOrderFirst(false)}>
            OK
          </Button>
        </div>
      </Modal>

      <Modal isOpen={showBillModal} onClose={() => setShowBillModal(false)} title="Live Bill">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          {billData && billData.items.length > 0 && (
            <div className="space-y-2 border-t border-gray-100 pt-4">
              {billData.items.map((item, idx) => (
                <div key={item.id + idx} className="space-y-0.5 text-sm">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                    <span className="min-w-0 break-words text-gray-600">
                      {item.quantity}x {item.item_name_snapshot || item.menu_item?.name || 'Item'}
                    </span>
                    <span className="font-medium text-gray-900">
                      {formatCurrency(item.price_snapshot * item.quantity, currency)}
                    </span>
                  </div>
                  {(item.modifiers || []).length > 0 && (
                    <div className="pl-5 text-xs text-gray-500">
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
          )}

          {billData && (
            <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span>{formatCurrency(billData.subtotal, currency)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold text-gray-900">
                <span>Total</span>
                <span>{formatCurrency(billData.total, currency)}</span>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-gray-100 mt-4">
             <Button className="w-full" isLoading={requesting === 'bill'} onClick={() => performServiceRequest('bill')}>
               Request Bill
             </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
