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
}

export function validateOrderItems(value: unknown): ValidatedOrderItem[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return null

  const items: ValidatedOrderItem[] = []

  for (const item of value) {
    if (!item || typeof item !== 'object') return null

    const record = item as Record<string, unknown>
    const menuItemId = record.menuItemId || record.menu_item_id
    const quantity = clampInteger(record.quantity, 1, 99)

    if (!isUuid(menuItemId) || quantity === null) return null

    items.push({
      menuItemId,
      quantity,
      notes: typeof record.notes === 'string' && record.notes.trim()
        ? record.notes.trim().slice(0, 500)
        : null,
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
