export function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
}

export function clampInteger(value: unknown, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return null
  return Math.min(max, Math.max(min, parsed))
}

export function readTrimmedString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

export type ValidatedOrderItem = {
  menuItemId: string
  quantity: number
  notes: string | null
  modifiers: {
    id: string
    name?: string
    price?: number
    group_is_required?: boolean
    group_is_multiselect?: boolean
  }[]
}

export function validateOrderItems(value: unknown): ValidatedOrderItem[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return null

  const items: ValidatedOrderItem[] = []

  for (const item of value) {
    if (!item || typeof item !== 'object') return null

    const record = item as Record<string, unknown>
    const menuItemId = record.menuItemId || record.menu_item_id
    const quantity = clampInteger(record.quantity, 1, 99)
    const modifiersValue = record.modifiers
    const modifiers: ValidatedOrderItem['modifiers'] = []

    if (!isUuid(menuItemId) || quantity === null) return null

    if (modifiersValue !== undefined) {
      if (!Array.isArray(modifiersValue) || modifiersValue.length > 50) return null

      for (const modifierValue of modifiersValue) {
        if (!modifierValue || typeof modifierValue !== 'object') return null

        const modifierRecord = modifierValue as Record<string, unknown>
        if (!isUuid(modifierRecord.id)) return null

        const price = validatePrice(modifierRecord.price)

        modifiers.push({
          id: modifierRecord.id,
          name: typeof modifierRecord.name === 'string'
            ? modifierRecord.name.trim().slice(0, 100)
            : undefined,
          price: price ?? undefined,
          group_is_required: typeof modifierRecord.group_is_required === 'boolean'
            ? modifierRecord.group_is_required
            : undefined,
          group_is_multiselect: typeof modifierRecord.group_is_multiselect === 'boolean'
            ? modifierRecord.group_is_multiselect
            : undefined,
        })
      }
    }

    items.push({
      menuItemId,
      quantity,
      notes: typeof record.notes === 'string' && record.notes.trim()
        ? record.notes.trim().slice(0, 500)
        : null,
      modifiers,
    })
  }

  return items
}

export function validateEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  if (trimmed.length === 0 || trimmed.length > 254) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null
  return trimmed
}

export function validatePassword(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (value.length < 8 || value.length > 72) return null
  return value
}

export function validateRestaurantName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length < 2 || trimmed.length > 100) return null
  return trimmed
}

export function validatePrice(value: unknown): number | null {
  const parsed = typeof value === 'string' && value.trim()
    ? Number(value)
    : typeof value === 'number'
      ? value
      : null

  if (parsed === null || !Number.isFinite(parsed)) return null
  if (parsed < 0 || parsed > 99999999.99) return null
  return Math.round(parsed * 100) / 100
}

const inventoryUnits = ['kg', 'g', 'l', 'ml', 'piece', 'bottle', 'packet', 'other'] as const
const stockMovementTypes = ['purchase', 'usage', 'wastage', 'adjustment', 'count'] as const
const expenseCategories = [
  'ingredients',
  'supplies',
  'rent',
  'salaries',
  'utilities',
  'equipment',
  'marketing',
  'other',
] as const

export function validateInventoryUnit(value: unknown): (typeof inventoryUnits)[number] | null {
  return typeof value === 'string' && inventoryUnits.includes(value as (typeof inventoryUnits)[number])
    ? (value as (typeof inventoryUnits)[number])
    : null
}

export function validateStockMovementType(value: unknown): (typeof stockMovementTypes)[number] | null {
  return typeof value === 'string' && stockMovementTypes.includes(value as (typeof stockMovementTypes)[number])
    ? (value as (typeof stockMovementTypes)[number])
    : null
}

export function validateExpenseCategory(value: unknown): (typeof expenseCategories)[number] | null {
  return typeof value === 'string' && expenseCategories.includes(value as (typeof expenseCategories)[number])
    ? (value as (typeof expenseCategories)[number])
    : null
}

// Non-negative quantity rounded to 3 decimals (stock levels, thresholds, counts).
export function validateQuantity(value: unknown): number | null {
  const parsed = typeof value === 'string' && value.trim()
    ? Number(value)
    : typeof value === 'number'
      ? value
      : null

  if (parsed === null || !Number.isFinite(parsed)) return null
  if (parsed < 0 || parsed > 99999999.999) return null
  return Math.round(parsed * 1000) / 1000
}

// Signed quantity delta rounded to 3 decimals (manual adjustments).
export function validateSignedQuantity(value: unknown): number | null {
  const parsed = typeof value === 'string' && value.trim()
    ? Number(value)
    : typeof value === 'number'
      ? value
      : null

  if (parsed === null || !Number.isFinite(parsed)) return null
  if (Math.abs(parsed) > 99999999.999) return null
  return Math.round(parsed * 1000) / 1000
}

// YYYY-MM-DD date string (expense_date). Returns the normalized string or null.
export function validateDateString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  const date = new Date(`${trimmed}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  return trimmed
}

export function validateTableNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 32) return null
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(trimmed)) return null
  return trimmed
}

export function validateSlug(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  if (trimmed.length < 2 || trimmed.length > 100) return null
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) return null
  return trimmed
}
