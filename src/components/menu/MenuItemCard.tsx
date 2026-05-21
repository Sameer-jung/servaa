'use client'

/* eslint-disable @next/next/no-img-element */

import { MenuItem } from '@/types'
import { formatCurrency } from '@/utils/format'
import { Button } from '@/components/ui/Button'

interface MenuItemCardProps {
  item: MenuItem
  quantity: number
  currency?: string
  onAdd: () => void
  onRemove: () => void
}

export function MenuItemCard({ item, quantity, currency, onAdd, onRemove }: MenuItemCardProps) {
  const isAvailable = item.available

  return (
    <div className={isAvailable ? 'flex gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm' : 'flex gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 opacity-75 shadow-sm'}>
      <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-300">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-gray-900">{item.name}</h3>
            {!isAvailable && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                Out of Stock
              </span>
            )}
          </div>
          {item.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{item.description}</p>
          )}
        </div>
        <div className="flex items-center justify-between">
          <p className="font-semibold text-gray-900">{formatCurrency(item.price, currency)}</p>
          {!isAvailable ? (
            <Button size="sm" variant="secondary" disabled>
              Out of Stock
            </Button>
          ) : quantity > 0 ? (
            <div className="flex items-center gap-2">
              <button
                onClick={onRemove}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600 active:bg-gray-200"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <span className="min-w-[1.5rem] text-center text-sm font-medium">{quantity}</span>
              <button
                onClick={onAdd}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white active:bg-brand-700"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          ) : (
            <Button size="sm" onClick={onAdd}>
              Add to Order
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
