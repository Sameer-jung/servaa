import { Invoice } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { formatCurrency, formatDate } from '@/utils/format'

interface InvoiceDetailProps {
  invoice: Invoice | null
  isOpen: boolean
  onClose: () => void
  onMarkPaid?: () => void
  onSendToTable?: () => void
  currency?: string
  sendingInvoiceId?: string | null
  markingPaidInvoiceId?: string | null
}

export function InvoiceDetail({ invoice, isOpen, onClose, onMarkPaid, onSendToTable, currency,  sendingInvoiceId, markingPaidInvoiceId }: InvoiceDetailProps) {
  if (!invoice) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Invoice #${invoice.invoice_number}`}>
      <div className="space-y-4">
        <div className="flex justify-between text-sm">
          <span className="font-medium text-gray-500 dark:text-gray-400">Date</span>
          <span className="font-semibold text-gray-900 dark:text-gray-100">{formatDate(invoice.created_at)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="font-medium text-gray-500 dark:text-gray-400">Status</span>
          <span className={
            invoice.payment_status === 'paid' ? 'font-medium text-emerald-600' : 'font-medium text-amber-600'
          }>
            {invoice.payment_status.toUpperCase()}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="font-medium text-gray-500 dark:text-gray-400">Payment Method</span>
          <span className="font-semibold text-gray-900 dark:text-gray-100">{invoice.payment_method || 'N/A'}</span>
        </div>

        <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
          <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Order Items</h4>
          {invoice.order?.items?.map((item) => (
            <div key={item.id} className="py-1.5">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-gray-600 dark:text-gray-300">
                  {item.quantity}x {item.menu_item?.name || 'Item'}
                </span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrency(item.price_snapshot * item.quantity, currency)}
                </span>
              </div>
              {item.modifiers && item.modifiers.length > 0 && (
                <div className="mt-0.5 space-y-0.5 pl-4">
                  {item.modifiers.map((modifier, index) => (
                    <div key={index} className="flex justify-between text-xs">
                      <span className="text-gray-400 dark:text-gray-500">+ {modifier.name}</span>
                      {modifier.price > 0 && (
                        <span className="text-gray-400 dark:text-gray-500">
                          {formatCurrency(modifier.price, currency)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-gray-100 pt-4 space-y-2 dark:border-gray-800">
          <div className="flex justify-between text-sm">
            <span className="font-medium text-gray-500 dark:text-gray-400">Subtotal</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(invoice.subtotal, currency)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="font-medium text-gray-500 dark:text-gray-400">Tax</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(invoice.tax_amount, currency)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold text-gray-900 dark:text-gray-100">
            <span>Grand Total</span>
            <span>{formatCurrency(invoice.grand_total, currency)}</span>
          </div>
        </div>

        <div className="space-y-2">
          {onSendToTable && (
            <Button variant="outline" className="w-full"     isLoading={sendingInvoiceId === invoice.id} disabled={markingPaidInvoiceId === invoice.id} onClick={onSendToTable}>
              Send to Table
            </Button>
          )}
          {invoice.payment_status === 'unpaid' && onMarkPaid && (
            <Button className="w-full"     isLoading={markingPaidInvoiceId === invoice.id} disabled={sendingInvoiceId === invoice.id} onClick={onMarkPaid}>
              Mark as Paid
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
