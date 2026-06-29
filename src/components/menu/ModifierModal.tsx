'use client'

import { useState, useEffect } from 'react'
import { MenuItem, Modifier } from '@/types'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { formatCurrency } from '@/utils/format'
import { calculateItemTotal } from '@/utils/pricing'
import {
  getSelectedModifierRecords,
  isModifierSelectionValid,
  updateModifierSelection,
  type ModifierSelections,
} from '@/utils/modifiers'

interface ModifierModalProps {
  item: MenuItem | null
  isOpen: boolean
  onClose: () => void
  onAdd: (item: MenuItem, modifiers: Modifier[], quantity: number, notes: string) => void
  currency?: string
}

export function ModifierModal({ item, isOpen, onClose, onAdd, currency }: ModifierModalProps) {
  const [selectedModifiers, setSelectedModifiers] = useState<ModifierSelections>({})
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')

  // Reset state when a new item is selected
  useEffect(() => {
    if (item) {
      setSelectedModifiers({})
      setQuantity(1)
      setNotes('')
    }
  }, [item])

  if (!item || !item.modifier_groups) return null

  const handleToggle = (groupId: string, modifierId: string, isMultiselect: boolean) => {
    setSelectedModifiers(prev => updateModifierSelection(prev, groupId, modifierId, isMultiselect))
  }

  const isValid = isModifierSelectionValid(item, selectedModifiers)
  const selectedModifierRecords = getSelectedModifierRecords(item, selectedModifiers)
  const finalPrice = calculateItemTotal(item.price, selectedModifierRecords) * quantity

  const handleAddToCart = () => {
    if (!isValid) return

    onAdd(item, selectedModifierRecords, quantity, notes)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={item.name}
      className="fixed bottom-0 left-0 right-0 max-h-[90vh] max-w-none rounded-b-none p-0 sm:relative sm:left-auto sm:right-auto sm:bottom-auto sm:max-w-lg sm:rounded-xl sm:p-6"
      titleClassName="px-4 pt-4 sm:px-0 sm:pt-0"
    >
      <div className="max-h-[calc(90vh-9rem)] space-y-4 overflow-y-auto overscroll-contain px-4 pb-4 sm:max-h-[60vh] sm:px-0">
        {item.modifier_groups.map((group) => {
          const selections = selectedModifiers[group.id] || []
          const isMissingRequired = group.is_required && selections.length === 0

          return (
            <div key={group.id} className={`rounded-xl border p-4 ${isMissingRequired ? 'border-amber-300 bg-amber-50/50' : 'border-gray-100 bg-gray-50'}`}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <h4 className="min-w-0 break-words font-semibold text-gray-900">{group.name}</h4>
                {group.is_required && (
                  <span className="flex-shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-600">Required</span>
                )}
                {!group.is_required && (
                  <span className="flex-shrink-0 text-xs font-medium text-gray-500">Optional</span>
                )}
              </div>

              <div className="space-y-2">
                {group.modifiers?.map(mod => {
                  const isSelected = selections.includes(mod.id)
                  
                  return (
                    <label 
                      key={mod.id} 
                      className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 transition-colors ${
                        isSelected ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white hover:border-brand-300'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <input 
                          type={group.is_multiselect ? "checkbox" : "radio"}
                          name={`group-${group.id}`}
                          checked={isSelected}
                          onChange={() => handleToggle(group.id, mod.id, group.is_multiselect)}
                          className={`h-5 w-5 flex-shrink-0 text-brand-600 focus:ring-brand-500 ${group.is_multiselect ? 'rounded border-gray-300' : 'border-gray-300'}`}
                        />
                        <span className={`min-w-0 break-words text-sm font-medium ${isSelected ? 'text-brand-900' : 'text-gray-900'}`}>
                          {mod.name}
                        </span>
                      </div>
                      {mod.price > 0 && (
                        <span className="flex-shrink-0 text-sm text-gray-500">
                          {group.is_required && !group.is_multiselect
                            ? formatCurrency(mod.price, currency)
                            : `+${formatCurrency(mod.price, currency)}`}
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })}

        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <h4 className="mb-3 font-semibold text-gray-900">Cooking note</h4>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="E.g. no onions, extra spicy..."
            rows={2}
            className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
      </div>

      <div className="sticky bottom-0 mt-0 flex items-center gap-2 border-t border-gray-200 bg-white p-4 sm:static sm:mt-4 sm:p-0 sm:pt-4">
        <div className="flex flex-shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-white px-1 py-1">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold text-gray-700 active:bg-gray-100"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="min-w-[1.75rem] text-center text-base font-bold text-gray-900">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity((q) => q + 1)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold text-gray-700 active:bg-gray-100"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>

        <Button
          className="h-12 flex-1 text-base"
          disabled={!isValid}
          onClick={handleAddToCart}
        >
          Add to Cart - {formatCurrency(finalPrice, currency)}
        </Button>
      </div>
    </Modal>
  )
}
