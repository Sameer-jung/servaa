'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

export function SuspendToggleButton({ restaurantId, isActive }: { restaurantId: string; isActive: boolean }) {
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const router = useRouter()

  const performToggle = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/restaurants/${restaurantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive }),
      })

      if (!response.ok) {
        const result = await response.json().catch(() => null)
        toast.error(result?.error || 'Unable to update restaurant status.')
        return
      }

      toast.success(isActive ? 'Restaurant suspended.' : 'Restaurant activated.')
      setConfirmOpen(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  // Activating is the reversible "undo" path, so it goes straight through.
  // Suspending immediately stops a restaurant from taking orders — that's
  // the one with real blast radius, so it gets a confirmation step.
  const handleClick = () => {
    if (isActive) {
      setConfirmOpen(true)
      return
    }
    performToggle()
  }

  return (
    <>
      <Button variant={isActive ? 'danger' : 'primary'} isLoading={loading} onClick={handleClick}>
        {isActive ? 'Suspend restaurant' : 'Activate restaurant'}
      </Button>

      <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title="Suspend this restaurant?">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Customers will see a &quot;temporarily unavailable&quot; menu and new orders will be rejected immediately.
          This takes effect right away.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" isLoading={loading} onClick={performToggle}>
            Suspend
          </Button>
        </div>
      </Modal>
    </>
  )
}
