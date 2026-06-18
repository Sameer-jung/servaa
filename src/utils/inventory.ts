// Shared inventory category helpers. Categories are a per-restaurant
// extensible list: a fixed set of defaults that always appear, plus any custom
// categories the restaurant has added (stored in the inventory_categories
// table). Used by both the inventory page (dropdown) and the inventory API
// route (canonicalisation + persistence on item save).

// The default stockroom categories every restaurant starts with. "Other" is NOT
// in this list — it is a UI action that reveals a free-text input, not a
// storable category.
export const DEFAULT_INVENTORY_CATEGORIES = [
  'Vegetables',
  'Fruits',
  'Meat & Poultry',
  'Seafood',
  'Dairy & Eggs',
  'Grains & Staples',
  'Spices & Condiments',
  'Oils & Sauces',
  'Beverages',
  'Alcohol',
  'Packaging & Disposables',
  'Cleaning & Supplies',
] as const

// Case-insensitive lookup of `name` against a list of candidate categories.
// Returns the candidate using its canonical (stored) casing, or null if absent.
export function findCanonicalCategory(name: string, candidates: string[]): string | null {
  const target = name.trim().toLowerCase()
  if (!target) return null
  return candidates.find((c) => c.trim().toLowerCase() === target) ?? null
}

// Build the dropdown's category list: defaults first (in their canonical order),
// then any custom categories not already covered by a default, de-duped
// case-insensitively and sorted alphabetically.
export function mergeInventoryCategories(custom: string[]): string[] {
  const seen = new Set(DEFAULT_INVENTORY_CATEGORIES.map((c) => c.toLowerCase()))
  const extras: string[] = []
  for (const raw of custom) {
    const name = raw.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    extras.push(name)
  }
  extras.sort((a, b) => a.localeCompare(b))
  return [...DEFAULT_INVENTORY_CATEGORIES, ...extras]
}
