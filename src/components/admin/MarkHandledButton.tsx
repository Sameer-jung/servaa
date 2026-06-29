'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'

export function MarkHandledButton({ messageId }: { messageId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleClick = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/messages/${messageId}`, {
        method: 'PATCH',
      })

      if (!response.ok) {
        const result = await response.json().catch(() => null)
        toast.error(result?.error || 'Unable to mark message handled.')
        return
      }

      toast.success('Message marked handled.')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="secondary" size="sm" isLoading={loading} onClick={handleClick}>
      Mark handled
    </Button>
  )
}
