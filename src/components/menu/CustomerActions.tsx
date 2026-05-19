'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'

interface CustomerActionsProps {
  restaurantId: string
  tableId: string
}

export function CustomerActions({ restaurantId, tableId }: CustomerActionsProps) {
  const [requesting, setRequesting] = useState<'water' | 'bill' | null>(null)
  const [confirmed, setConfirmed] = useState<string | null>(null)
  const supabase = createClient()

  const handleRequest = async (type: 'water' | 'bill') => {
    setRequesting(type)

    const { error } = await supabase.from('orders').insert({
      restaurant_id: restaurantId,
      table_id: tableId,
      status: 'pending',
      total_amount: 0,
      special_instructions: type === 'water' ? 'REQUEST: Water' : 'REQUEST: Bill',
    })

    setRequesting(null)

    if (!error) {
      setConfirmed(type)
      setTimeout(() => setConfirmed(null), 3000)
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white px-3 py-3 shadow-lg sm:px-4">
      <div className="mx-auto grid max-w-lg grid-cols-2 gap-2 sm:gap-3">
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
  )
}
