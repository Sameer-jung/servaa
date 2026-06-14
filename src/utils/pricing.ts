import { Modifier } from '@/types'
import { validatePrice } from '@/utils/validation'

type PriceModifier = Partial<Pick<Modifier, 'price' | 'group_is_required' | 'group_is_multiselect'>> | {
  price?: number | string
  group_is_required?: boolean
  group_is_multiselect?: boolean
}

export function calculateItemTotal(
  basePrice: number | null | undefined, 
  modifiers: PriceModifier[] | null | undefined
): number {
  const safeBasePrice = validatePrice(basePrice) || 0
  if (!modifiers || modifiers.length === 0) return safeBasePrice

  const replacementModifiers = modifiers.filter(
    (mod) => mod.group_is_required && !mod.group_is_multiselect
  )
  const baseTotal = replacementModifiers.length > 0
    ? replacementModifiers.reduce((sum, mod) => sum + (validatePrice(mod.price) || 0), 0)
    : safeBasePrice
  const modifiersTotal = modifiers.reduce((sum, mod) => {
    if (mod.group_is_required && !mod.group_is_multiselect) return sum
    return sum + (validatePrice(mod.price) || 0)
  }, 0)

  return baseTotal + modifiersTotal
}
