'use client'

import { useState } from 'react'
import { OrderWithItems } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { formatCurrency, formatTimeAgo } from '@/utils/format'

interface OrderCardProps {
  order: OrderWithItems
  onAccept?: () => void
  onReject?: () => void
  onUpdateStatus?: (status: string) => void
  onSkipToCompleted?: () => void
  onCancelItem?: (itemId: string) => void
  compact?: boolean
  currency?: string
  isLoading?: boolean
  cancellingItemId?: string | null
}

const statusActions: Record<string, { next: string; label: string; color: string }> = {
  pending: { next: 'accepted', label: 'Accept', color: 'bg-blue-600' },
  accepted: { next: 'preparing', label: 'Start Preparing', color: 'bg-purple-600' },
  preparing: { next: 'ready', label: 'Mark Ready', color: 'bg-emerald-600' },
  ready: { next: 'completed', label: 'Complete', color: 'bg-gray-600' },
}

const cancellableStatuses = new Set(['pending', 'accepted', 'preparing', 'ready'])

type ConfirmState =
  | { type: 'item'; itemId: string; itemName: string }
  | { type: 'order' }
  | null

function getItemSummary(order: OrderWithItems) {
  const activeItems = order.items?.filter((item) => !item.cancelled) || []
  if (!activeItems.length) return 'No items'

  const visibleItems = activeItems.slice(0, 2).map((item) => (
    `${item.quantity}x ${item.item_name_snapshot || item.menu_item?.name || 'Unknown Item'}`
  ))
  const remaining = activeItems.length - visibleItems.length

  return remaining > 0
    ? `${visibleItems.join(', ')} +${remaining} more`
    : visibleItems.join(', ')
}

export function OrderCard({ order, onAccept, onReject, onUpdateStatus, onSkipToCompleted, onCancelItem, compact, currency, isLoading = false, cancellingItemId }: OrderCardProps) {
  const [confirmState, setConfirmState] = useState<ConfirmState>(null)
  const action = statusActions[order.status]
  const tableNumber = order.table?.table_number || 'Unknown'
  const isCancellable = cancellableStatuses.has(order.status)

  const handleConfirm = () => {
    if (!confirmState) return
    if (confirmState.type === 'item') {
      onCancelItem?.(confirmState.itemId)
    } else {
      onReject?.()
    }
    setConfirmState(null)
  }

  if (compact) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                Table {tableNumber}
              </span>
              <Badge status={order.status}>{order.status}</Badge>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{formatTimeAgo(order.created_at)}</span>
            </div>
            <p className="mt-2 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
              {getItemSummary(order)}
            </p>
          </div>
          <p className="flex-shrink-0 text-sm font-bold text-gray-900 dark:text-gray-100">
            {formatCurrency(order.total_amount || 0, currency)}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Order #{order.id.slice(0, 8)}
            </span>
            <Badge status={order.status}>{order.status}</Badge>
          </div>
          <p className="mt-1 text-sm font-medium text-gray-500 dark:text-gray-400">
            Table {tableNumber} - {formatTimeAgo(order.created_at)}
          </p>
        </div>
        <p className="text-lg font-bold text-gray-900 flex-shrink-0 dark:text-gray-100">
          {formatCurrency(order.total_amount || 0, currency)}
        </p>
      </div>

      {order.items && order.items.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {order.items.map((item) => {
            const isCancelled = Boolean(item.cancelled)
            const isCancellingThis = cancellingItemId === item.id

            return (
              <div key={item.id} className={`space-y-0.5 text-sm rounded-lg px-2 py-1.5 transition-colors ${isCancelled ? 'bg-red-50 dark:bg-red-950/20' : ''}`}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 items-start">
                  <span className={`min-w-0 break-words font-medium ${isCancelled ? 'line-through text-gray-400 dark:text-gray-600' : 'text-gray-600 dark:text-gray-300'}`}>
                    {item.quantity}x {item.item_name_snapshot || item.menu_item?.name || 'Unknown Item'}
                    {isCancelled && (
                      <span className="ml-1.5 text-xs font-semibold text-red-500 no-underline" style={{ textDecoration: 'none' }}>(Cancelled)</span>
                    )}
                  </span>
                  <span className={`font-medium whitespace-nowrap ${isCancelled ? 'line-through text-gray-400 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'}`}>
                    {formatCurrency((item.price_snapshot || 0) * item.quantity, currency)}
                  </span>
                  {isCancellable && onCancelItem && !isCancelled && (
                    <button
                      type="button"
                      onClick={() => setConfirmState({ type: 'item', itemId: item.id, itemName: item.item_name_snapshot || item.menu_item?.name || 'this item' })}
                      disabled={isCancellingThis || isLoading}
                      title="Cancel this item"
                      className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-gray-300 hover:bg-red-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors"
                    >
                      {isCancellingThis ? (
                        <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </button>
                  )}
                  {(isCancelled || !isCancellable || !onCancelItem) && (
                    <span className="w-5" />
                  )}
                </div>
                {item.notes && (
                  <p className={`pl-0 text-xs font-medium ${isCancelled ? 'text-gray-400 dark:text-gray-600' : 'text-red-600'}`}>
                    Note: {item.notes}
                  </p>
                )}
                {(item.modifiers || []).length > 0 && (
                  <div className="pl-4 text-xs font-medium text-gray-500 dark:text-gray-400">
                    {item.modifiers?.map((modifier) => (
                      <p key={modifier.id} className={`break-words ${isCancelled ? 'text-gray-400 dark:text-gray-600' : ''}`}>
                        + {modifier.name}
                        {modifier.price > 0 ? ` (${formatCurrency(modifier.price, currency)})` : ''}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
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
            <Button size="sm" className="flex-1" isLoading={isLoading} onClick={onAccept}>
              Accept
            </Button>
            <Button size="sm" variant="outline" className="flex-1" disabled={isLoading} onClick={onReject}>
              Reject
            </Button>
          </>
        )}
        {action && order.status !== 'pending' && onUpdateStatus && (
          <Button
            size="sm"
            className={`flex-1 ${action.color}`}
            disabled={isLoading}
            onClick={() => onUpdateStatus(action.next)}
          >
            {action.label}
          </Button>
        )}
        {(order.status === 'accepted' || order.status === 'preparing') && onSkipToCompleted && (
          <Button
            size="sm"
            variant="outline"
            className="flex-shrink-0 border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
            disabled={isLoading}
            onClick={onSkipToCompleted}
            title="Skip preparing/ready and mark this order completed"
          >
            Skip to Completed
          </Button>
        )}
        {isCancellable && order.status !== 'pending' && onReject && (
          <Button
            size="sm"
            variant="outline"
            className="flex-shrink-0 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
            disabled={isLoading}
            onClick={() => setConfirmState({ type: 'order' })}
          >
            Cancel Order
          </Button>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmState !== null}
        title={confirmState?.type === 'item' ? 'Cancel Item?' : 'Cancel Order?'}
        description={
          confirmState?.type === 'item'
            ? `Remove "${confirmState.itemName}" from this order? This cannot be undone.`
            : `Cancel order #${order.id.slice(0, 8)} for Table ${tableNumber}? This cannot be undone.`
        }
        onConfirm={handleConfirm}
        onCancel={() => setConfirmState(null)}
        isLoading={confirmState?.type === 'item' ? cancellingItemId === confirmState.itemId : isLoading}
      />
    </div>
  )
}
