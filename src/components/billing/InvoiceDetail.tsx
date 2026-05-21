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
}

export function InvoiceDetail({ invoice, isOpen, onClose, onMarkPaid, onSendToTable, currency }: InvoiceDetailProps) {
  if (!invoice) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Invoice #${invoice.invoice_number}`}>
      <div className="space-y-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Date</span>
          <span className="font-medium">{formatDate(invoice.created_at)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Status</span>
          <span className={
            invoice.payment_status === 'paid' ? 'font-medium text-emerald-600' : 'font-medium text-amber-600'
          }>
            {invoice.payment_status.toUpperCase()}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Payment Method</span>
          <span className="font-medium">{invoice.payment_method || 'N/A'}</span>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <h4 className="mb-2 text-sm font-medium text-gray-900">Order Items</h4>
          {invoice.order?.items?.map((item) => (
            <div key={item.id} className="flex justify-between py-1 text-sm">
              <span className="text-gray-600">
                {item.quantity}x {item.menu_item?.name || 'Item'}
              </span>
              <span className="text-gray-900">{formatCurrency(item.price_snapshot * item.quantity, currency)}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-100 pt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Subtotal</span>
            <span>{formatCurrency(invoice.subtotal, currency)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Tax</span>
            <span>{formatCurrency(invoice.tax_amount, currency)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold">
            <span>Grand Total</span>
            <span>{formatCurrency(invoice.grand_total, currency)}</span>
          </div>
        </div>

        <div className="space-y-2">
          {onSendToTable && (
            <Button variant="outline" className="w-full" onClick={onSendToTable}>
              Send to Table
            </Button>
          )}
          {invoice.payment_status === 'unpaid' && onMarkPaid && (
            <Button className="w-full" onClick={onMarkPaid}>
              Mark as Paid
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
