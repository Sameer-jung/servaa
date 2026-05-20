'use client'

import { useCallback, useEffect, useState } from 'react'
import { Invoice } from '@/types'
import { Button } from '@/components/ui/Button'
import { formatCurrency } from '@/utils/format'

interface TableInvoiceProps {
  tableId: string
  tableToken?: string
  currency: string
}

export function TableInvoice({ tableId, tableToken, currency }: TableInvoiceProps) {
  const [invoice, setInvoice] = useState<Invoice | null>(null)

  const fetchInvoice = useCallback(async () => {
    const params = new URLSearchParams({ tableId })
    if (tableToken) params.set('tableToken', tableToken)

    const response = await fetch(`/api/invoices/table?${params.toString()}`)
    if (!response.ok) return

    const result = await response.json().catch(() => null)
    const nextInvoice = (result?.invoice as Invoice | null) || null

    setInvoice(nextInvoice)
  }, [tableId, tableToken])

  const handleGotIt = async () => {
    if (!invoice) return

    const invoiceId = invoice.id
    setInvoice(null)

    await fetch('/api/invoices/table', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId, tableId, tableToken }),
    })

    fetchInvoice()
  }

  useEffect(() => {
    fetchInvoice()
    const interval = window.setInterval(fetchInvoice, 5000)
    return () => window.clearInterval(interval)
  }, [fetchInvoice])

  if (!invoice) return null

  const items = invoice.order?.items || []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-bold text-gray-900">Invoice #{invoice.invoice_number}</p>
            <p className="mt-1 text-sm text-gray-500">Please pay at your table.</p>
          </div>
          <button
            type="button"
            onClick={handleGotIt}
            className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
          >
            Close
          </button>
        </div>

        {items.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
            {items.map((item) => (
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
        )}

        <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Subtotal</span>
            <span>{formatCurrency(invoice.subtotal, currency)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Tax</span>
            <span>{formatCurrency(invoice.tax_amount, currency)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold text-gray-900">
            <span>Total</span>
            <span>{formatCurrency(invoice.grand_total, currency)}</span>
          </div>
        </div>

        <Button
          className="mt-5 w-full"
          onClick={handleGotIt}
        >
          Got it
        </Button>
      </div>
    </div>
  )
}
