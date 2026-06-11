'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/utils/format'
import { OrderWithItems } from '@/types'

interface CurrentBillModalProps {
  isOpen: boolean
  onClose: () => void
  tableId: string
  customerSessionId?: string | null
  restaurantId: string
  currency: string
}

export function CurrentBillModal({
  isOpen,
  onClose,
  tableId,
  customerSessionId,
  restaurantId,
  currency,
}: CurrentBillModalProps) {
  const [orders, setOrders] = useState<OrderWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!isOpen) return

    const fetchBill = async () => {
      setLoading(true)
      
      // Fetch all orders for this table that aren't cancelled
      const { data } = await supabase
        .from('orders')
        .select('*, items:order_items(*, menu_item:menu_items(name)), invoices(payment_status)')
        .eq('table_id', tableId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true })

      if (data) {
        // Filter out legacy service request orders and orders that are already paid
        const validOrders = data.filter((order) => {
          const isLegacy = order.special_instructions?.toLowerCase().startsWith('request:')
          const isPaid = order.invoices?.some((inv: any) => inv.payment_status === 'paid')
          return !isLegacy && !isPaid
        })
        setOrders(validOrders as OrderWithItems[])
      }
      
      setLoading(false)
    }

    fetchBill()
  }, [isOpen, tableId, supabase])

  const allItems = orders.flatMap(order => order.items || [])
  const subtotal = allItems.reduce((sum, item) => sum + (item.price_snapshot * item.quantity), 0)

  // Fetch restaurant tax rate
  const [taxRate, setTaxRate] = useState(0)
  useEffect(() => {
    if (!isOpen) return
    supabase.from('restaurants').select('tax_rate').eq('id', restaurantId).single().then(({ data }) => {
      if (data) setTaxRate(data.tax_rate)
    })
  }, [isOpen, restaurantId, supabase])

  const taxAmount = (subtotal * taxRate) / 100
  const grandTotal = subtotal + taxAmount

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Your Table's Bill">
      <div className="space-y-4">
        {loading ? (
          <p className="text-sm text-gray-500">Calculating your bill...</p>
        ) : allItems.length === 0 ? (
          <p className="text-sm text-gray-500">You haven't ordered anything yet.</p>
        ) : (
          <>
            <div className="max-h-60 overflow-y-auto pr-2 space-y-2">
              {allItems.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    {item.quantity}x {item.menu_item?.name || 'Item'}
                  </span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(item.price_snapshot * item.quantity, currency)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span>{formatCurrency(subtotal, currency)}</span>
              </div>
              {taxRate > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Tax ({taxRate}%)</span>
                  <span>{formatCurrency(taxAmount, currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold text-gray-900">
                <span>Total</span>
                <span>{formatCurrency(grandTotal, currency)}</span>
              </div>
            </div>
            
            <p className="text-center text-xs text-gray-400 mt-2">
              A waiter will be with you shortly to collect payment.
            </p>
          </>
        )}

        <Button className="w-full mt-4" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  )
}
