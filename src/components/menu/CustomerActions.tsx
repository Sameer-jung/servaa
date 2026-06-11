'use client'

import toast from "react-hot-toast";
import { MESSAGES } from "@/utils/messages";
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { CurrentBillModal } from '@/components/menu/CurrentBillModal'

interface CustomerActionsProps {
  restaurantId: string
  tableId: string
  customerSessionId?: string | null
  currency?: string
}

export function CustomerActions({ restaurantId, tableId, customerSessionId, currency = 'NPR' }: CustomerActionsProps) {
  const [requesting, setRequesting] = useState<'water' | 'bill' | 'waiter' | null>(null)
  const [confirmed, setConfirmed] = useState<string | null>(null)
  const [showOrderFirst, setShowOrderFirst] = useState(false)
  const [showBillModal, setShowBillModal] = useState(false)
  const supabase = createClient()

  const tableHasOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select('id, special_instructions, items:order_items(id), invoices(payment_status)')
      .eq('table_id', tableId)
      .eq('customer_session_id', customerSessionId)
      .order('created_at', { ascending: false })
      .limit(25)

    return (data || []).some((order) => {
      const items = Array.isArray(order.items) ? order.items : []
      const isLegacy = order.special_instructions?.toLowerCase().startsWith('request:')
      const isPaid = order.invoices?.some(
        (inv: { payment_status: string }) => inv.payment_status === 'paid'
      )

      return items.length > 0 && !isLegacy && !isPaid
    })
  }

  const handleRequest = async (type: 'water' | 'bill' | 'waiter') => {
    setRequesting(type)

    if (type === 'bill') {
      if (!customerSessionId) {
        setRequesting(null)
        toast.error("Please refresh the page and try again.");
        return;
      }

      const hasOrders = await tableHasOrders()
      if (!hasOrders) {
        setRequesting(null)
        setShowOrderFirst(true)
        toast.error("Please place an order before requesting the bill.");
        return
      }
    }

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

    const specialInstructions =
      type === 'water' ? 'REQUEST: Water' :
        type === 'waiter' ? 'REQUEST: Waiter' : 'REQUEST: Bill';

    const { data: legacyOrder, error } = await supabase.from('orders').insert({
      restaurant_id: restaurantId,
      table_id: tableId,
      status: 'pending',
      total_amount: 0,
      special_instructions: specialInstructions,
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

      if (type === "water") toast.success(MESSAGES.serviceRequest.waterSent);
      else if (type === "waiter") toast.success(MESSAGES.serviceRequest.waiterSent);
      else toast.success(MESSAGES.serviceRequest.billSent);

      if (type === 'bill') {
        setShowBillModal(true);
      }
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
            onClick={() => handleRequest('water')}
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
            onClick={() => handleRequest('waiter')}
          >
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="truncate">{confirmed === 'waiter' ? 'Requested!' : 'Waiter'}</span>
          </Button>
          <Button
            variant="outline"
            className="min-w-0 gap-1.5 px-2 text-sm sm:gap-2 sm:px-4"
            isLoading={requesting === 'bill'}
            onClick={() => handleRequest('bill')}
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

      <CurrentBillModal
        isOpen={showBillModal}
        onClose={() => setShowBillModal(false)}
        tableId={tableId}
        customerSessionId={customerSessionId}
        restaurantId={restaurantId}
        currency={currency}
      />
    </>
  )
}
