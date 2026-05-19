export function getServiceRequestLabel(order: { special_instructions?: string | null }) {
  const instruction = order.special_instructions?.trim().toLowerCase()

  if (instruction === 'request: water') return 'Water'
  if (instruction === 'request: bill') return 'Bill'

  return null
}

export function isServiceRequestOrder(order: { special_instructions?: string | null }) {
  return getServiceRequestLabel(order) !== null
}

export function hasBillableItems(order: {
  items?: unknown[] | null
  special_instructions?: string | null
}) {
  return !isServiceRequestOrder(order) && Array.isArray(order.items) && order.items.length > 0
}
