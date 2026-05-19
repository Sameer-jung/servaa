import { Invoice } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatCurrency, formatDate } from '@/utils/format'

interface InvoiceCardProps {
  invoice: Invoice
  onMarkPaid?: () => void
  onView?: () => void
  onSendToTable?: () => void
}

export function InvoiceCard({ invoice, onMarkPaid, onView, onSendToTable }: InvoiceCardProps) {
  const tableNumber = invoice.order?.table?.table_number || 'Unknown'

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">
              #{invoice.invoice_number}
            </span>
            <Badge status={invoice.payment_status}>{invoice.payment_status}</Badge>
          </div>
          <p className="mt-1 text-sm font-medium text-gray-700">
            Table {tableNumber}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {formatDate(invoice.created_at)}
          </p>
        </div>
        <p className="text-lg font-bold text-gray-900">
          {formatCurrency(invoice.grand_total)}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-gray-50 p-2">
          <p className="text-gray-500">Subtotal</p>
          <p className="font-medium text-gray-900">{formatCurrency(invoice.subtotal)}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-2">
          <p className="text-gray-500">Tax</p>
          <p className="font-medium text-gray-900">{formatCurrency(invoice.tax_amount)}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-2">
          <p className="text-gray-500">Total</p>
          <p className="font-medium text-gray-900">{formatCurrency(invoice.grand_total)}</p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={onView}>
          View
        </Button>
        {onSendToTable && (
          <Button size="sm" variant="outline" className="flex-1" onClick={onSendToTable}>
            Send to Table
          </Button>
        )}
        {invoice.payment_status === 'unpaid' && onMarkPaid && (
          <Button size="sm" className="flex-1" onClick={onMarkPaid}>
            Mark Paid
          </Button>
        )}
      </div>
    </div>
  )
}
