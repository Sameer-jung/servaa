'use client'

import toast from "react-hot-toast";
import { MESSAGES } from "@/utils/messages";
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { formatCurrency } from '@/utils/format'
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

  const supabase = createClient()

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
      items?: { id: string; quantity: number; price_snapshot: number; modifiers?: Modifier[] | null; menu_item?: { name: string } | null }[]
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
    
    const serviceRequest = await supabase
      .from('service_requests')
      .insert({
        restaurant_id: restaurantId,
        table_id: tableId,
        request_type: type,
        status: 'pending',
        customer_session_id: customerSessionId,
      })
      .select('id')
      .maybeSingle()

    const { data: legacyOrder, error } = await supabase.from('orders').insert({
      restaurant_id: restaurantId,
      table_id: tableId,
      status: 'pending',
      total_amount: 0,
      special_instructions: type === 'water' ? 'REQUEST: Water' : type === 'waiter' ? 'REQUEST: Waiter' : 'REQUEST: Bill',
      customer_session_id: customerSessionId,
    }).select('id').maybeSingle()
  
    if (serviceRequest.data?.id && legacyOrder?.id) {
      await supabase
        .from('service_requests')
        .update({ legacy_order_id: legacyOrder.id })
        .eq('id', serviceRequest.data.id)
    }

    setRequesting(null)

    if (!error || serviceRequest.data) {
      setConfirmed(type)
      setTimeout(() => setConfirmed(null), 3000)
      if (type === 'bill') setShowBillModal(false)
      
      const msg = type === 'water' ? MESSAGES.serviceRequest.waterSent : type === 'waiter' ? 'Waiter requested!' : MESSAGES.serviceRequest.billSent;
      toast.success(msg);
    } else {
      toast.error(MESSAGES.serviceRequest.sendFailed);
    }
  }

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white px-3 py-3 shadow-lg sm:px-4">
        <div className="mx-auto grid max-w-lg grid-cols-3 gap-2 sm:gap-3">
          <Button
            variant="outline"
            className="min-w-0 gap-1.5 px-2 text-sm sm:gap-2 sm:px-4"
            isLoading={requesting === 'water'}
            onClick={() => handleActionClick('water')}
          >
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <span className="truncate">{confirmed === 'water' ? 'Requested!' : 'Water'}</span>
          </Button>
          <Button
            variant="outline"
            className="min-w-0 gap-1.5 px-2 text-sm sm:gap-2 sm:px-4"
            isLoading={requesting === 'waiter'}
            onClick={() => handleActionClick('waiter')}
          >
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span className="truncate">{confirmed === 'waiter' ? 'Requested!' : 'Waiter'}</span>
          </Button>
          <Button
            variant="outline"
            className="min-w-0 gap-1.5 px-2 text-sm sm:gap-2 sm:px-4"
            isLoading={requesting === 'bill'}
            onClick={() => handleActionClick('bill')}
          >
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span className="truncate">{confirmed === 'bill' ? 'Requested!' : 'Bill'}</span>
          </Button>
        </div>
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
