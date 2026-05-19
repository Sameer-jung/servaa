'use client'

import { useEffect, useState } from 'react'
import { OrderStatus } from '@/types'
import { useOrderStatus } from '@/hooks/useRealtime'
import { cn } from '@/utils/cn'

const statusSteps: { status: OrderStatus; label: string }[] = [
  { status: 'pending', label: 'Received' },
  { status: 'accepted', label: 'Accepted' },
  { status: 'preparing', label: 'Preparing' },
  { status: 'ready', label: 'Ready' },
  { status: 'completed', label: 'Served' },
]

interface OrderTrackerProps {
  orderId: string
  initialStatus?: OrderStatus
}

export function OrderTracker({ orderId, initialStatus = 'pending' }: OrderTrackerProps) {
  const [status, setStatus] = useState<OrderStatus>(initialStatus)

  useOrderStatus(orderId, (newStatus) => {
    if (newStatus) setStatus(newStatus)
  })

  const currentIndex = statusSteps.findIndex((s) => s.status === status)

  if (status === 'cancelled') {
    return (
      <div className="rounded-xl bg-red-50 p-4 text-center">
        <p className="font-medium text-red-700">Order Cancelled</p>
        <p className="text-sm text-red-500">Please contact staff for assistance.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
      <p className="mb-3 text-sm font-medium text-gray-500">Order Status</p>
      <div className="flex items-center justify-between">
        {statusSteps.map((step, index) => {
          const isActive = index <= currentIndex
          const isCurrent = index === currentIndex

          return (
            <div key={step.status} className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors',
                  isActive
                    ? isCurrent
                      ? 'bg-brand-600 text-white ring-4 ring-brand-100'
                      : 'bg-brand-600 text-white'
                    : 'bg-gray-100 text-gray-400'
                )}
              >
                {isActive ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              <span
                className={cn(
                  'mt-1 text-[10px] font-medium',
                  isActive ? 'text-gray-900' : 'text-gray-400'
                )}
              >
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
