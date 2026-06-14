'use client'

import { useState, useMemo } from 'react'
import { MenuItem, Modifier } from '@/types'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { formatCurrency } from '@/utils/format'
import { calculateItemTotal } from '@/utils/pricing'

interface ModifierModalProps {
  item: MenuItem | null
  isOpen: boolean
  onClose: () => void
  onAdd: (item: MenuItem, modifiers: Modifier[]) => void
  currency?: string
}

export function ModifierModal({ item, isOpen, onClose, onAdd, currency }: ModifierModalProps) {
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, string[]>>({})

  // Reset state when a new item is selected
  useMemo(() => {
    if (item) setSelectedModifiers({})
  }, [item])

  if (!item || !item.modifier_groups) return null

  const handleToggle = (groupId: string, modifierId: string, isMultiselect: boolean) => {
    setSelectedModifiers(prev => {
      const groupSelections = prev[groupId] || []
      
      if (!isMultiselect) {
        return { ...prev, [groupId]: [modifierId] }
      }
      
      if (groupSelections.includes(modifierId)) {
        return { ...prev, [groupId]: groupSelections.filter(id => id !== modifierId) }
      } else {
        return { ...prev, [groupId]: [...groupSelections, modifierId] }
      }
    })
  }

  // Validate requirements
  const isValid = item.modifier_groups.every(group => {
    if (!group.is_required) return true
    const selections = selectedModifiers[group.id]
    return selections && selections.length > 0
  })

  const getSelectedModifierRecords = () => {
    const allSelectedModifiers: Modifier[] = []
    
    Object.values(selectedModifiers).flat().forEach(modId => {
      for (const group of item.modifier_groups!) {
        const mod = group.modifiers?.find(m => m.id === modId)
        if (mod) {
          allSelectedModifiers.push({
            ...mod,
            group_is_required: group.is_required,
            group_is_multiselect: group.is_multiselect,
          })
        }
      }
    })

    return allSelectedModifiers
  }

  const finalPrice = calculateItemTotal(item.price, getSelectedModifierRecords())

  const handleAddToCart = () => {
    if (!isValid) return
    const allSelectedModifiers = getSelectedModifierRecords()

    onAdd(item, allSelectedModifiers)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={item.name}>
      <div className="space-y-6 max-h-[70vh] overflow-y-auto pb-6">
        {item.modifier_groups.map((group) => {
          const selections = selectedModifiers[group.id] || []
          const isMissingRequired = group.is_required && selections.length === 0

          return (
            <div key={group.id} className={`p-4 rounded-xl border ${isMissingRequired ? 'border-amber-300 bg-amber-50/50' : 'border-gray-100 bg-gray-50'}`}>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-gray-900">{group.name}</h4>
                {group.is_required && (
                  <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">Required</span>
                )}
                {!group.is_required && (
                  <span className="text-xs font-medium text-gray-500">Optional</span>
                )}
              </div>

              <div className="space-y-2">
                {group.modifiers?.map(mod => {
                  const isSelected = selections.includes(mod.id)
                  
                  return (
                    <label 
                      key={mod.id} 
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white hover:border-brand-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input 
                          type={group.is_multiselect ? "checkbox" : "radio"}
                          name={`group-${group.id}`}
                          checked={isSelected}
                          onChange={() => handleToggle(group.id, mod.id, group.is_multiselect)}
                          className={`text-brand-600 focus:ring-brand-500 ${group.is_multiselect ? 'rounded border-gray-300' : 'border-gray-300'}`}
                        />
                        <span className={`text-sm font-medium ${isSelected ? 'text-brand-900' : 'text-gray-900'}`}>
                          {mod.name}
                        </span>
                      </div>
                      {mod.price > 0 && (
                        <span className="text-sm text-gray-500">
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
      </div>

      <div className="pt-4 border-t border-gray-200 mt-4">
        <Button 
          className="w-full h-12 text-lg" 
          disabled={!isValid} 
          onClick={handleAddToCart}
        >
          Add to Cart - {formatCurrency(finalPrice, currency)}
        </Button>
      </div>
    </Modal>
  )
}
