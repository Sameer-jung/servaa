'use client'

import { OrderWithItems } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatCurrency, formatTimeAgo } from '@/utils/format'

interface OrderCardProps {
  order: OrderWithItems
  onAccept?: () => void
  onReject?: () => void
  onUpdateStatus?: (status: string) => void
  compact?: boolean
  currency?: string
}

const statusActions: Record<string, { next: string; label: string; color: string }> = {
  pending: { next: 'accepted', label: 'Accept', color: 'bg-blue-600' },
  accepted: { next: 'preparing', label: 'Start Preparing', color: 'bg-purple-600' },
  preparing: { next: 'ready', label: 'Mark Ready', color: 'bg-emerald-600' },
  ready: { next: 'completed', label: 'Complete', color: 'bg-gray-600' },
}

function getItemSummary(order: OrderWithItems) {
  if (!order.items?.length) return 'No items'

  const visibleItems = order.items.slice(0, 2).map((item) => (
    `${item.quantity}x ${item.menu_item?.name || 'Unknown Item'}`
  ))
  const remaining = order.items.length - visibleItems.length

  return remaining > 0
    ? `${visibleItems.join(', ')} +${remaining} more`
    : visibleItems.join(', ')
}

export function OrderCard({ order, onAccept, onReject, onUpdateStatus, compact, currency }: OrderCardProps) {
  const action = statusActions[order.status]
  const tableNumber = order.table?.table_number || 'Unknown'

  if (compact) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                Table {tableNumber}
              </span>
              <Badge status={order.status}>{order.status}</Badge>
              <span className="text-xs text-gray-500">{formatTimeAgo(order.created_at)}</span>
            </div>
            <p className="mt-2 truncate text-sm font-medium text-gray-900">
              {getItemSummary(order)}
            </p>
          </div>
          <p className="flex-shrink-0 text-sm font-bold text-gray-900">
            {formatCurrency(order.total_amount || 0, currency)}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900">
              Order #{order.id.slice(0, 8)}
            </span>
            <Badge status={order.status}>{order.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Table {tableNumber} - {formatTimeAgo(order.created_at)}
          </p>
        </div>
        <p className="text-lg font-bold text-gray-900 flex-shrink-0">
          {formatCurrency(order.total_amount || 0, currency)}
        </p>
      </div>

      {!compact && order.items && order.items.length > 0 && (
        <div className="mt-3 space-y-1">
          {order.items.map((item) => (
            <div key={item.id} className="space-y-0.5 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-gray-600">
                  {item.quantity}x {item.menu_item?.name || 'Unknown Item'}
                </span>
                <span className="text-gray-500">
                  {formatCurrency((item.price_snapshot || 0) * item.quantity, currency)}
                </span>
              </div>
              {item.notes && (
                <p className="text-xs font-medium text-red-600">
                  Note: {item.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {order.special_instructions && (
        <p className="mt-2 text-xs text-amber-600">
          Note: {order.special_instructions}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        {order.status === 'pending' && (
          <>
            <Button size="sm" className="flex-1" onClick={onAccept}>
              Accept
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={onReject}>
              Reject
            </Button>
          </>
        )}
        {action && order.status !== 'pending' && onUpdateStatus && (
          <Button
            size="sm"
            className={`flex-1 ${action.color}`}
            onClick={() => onUpdateStatus(action.next)}
          >
            {action.label}
          </Button>
        )}
      </div>
    </div>
  )
}
