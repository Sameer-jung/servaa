'use client'

import { Modal } from './Modal'
import { Button } from './Button'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  description: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  isLoading?: boolean
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = 'Yes, Cancel',
  onConfirm,
  onCancel,
  isLoading,
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title} className="max-w-sm">
      <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
      <div className="mt-5 flex gap-3">
        <Button variant="outline" className="flex-1" disabled={isLoading} onClick={onCancel}>
          Go Back
        </Button>
        <Button variant="danger" className="flex-1" isLoading={isLoading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
