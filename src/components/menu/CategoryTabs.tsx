'use client'

import { useEffect, useRef } from 'react'
import {
  LayoutGrid,
  Coffee,
  IceCream,
  Pizza,
  Sandwich,
  Salad,
  Soup,
  Egg,
  Beef,
  Fish,
  Wine,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import { MenuCategory } from '@/types'
import { cn } from '@/utils/cn'

interface MenuCategoryTabsProps {
  categories: MenuCategory[]
  activeCategory: string | null
  onSelect: (categoryId: string | null) => void
}

// No restaurant-supplied category icons exist in the schema — this maps
// common category-name keywords to a generic icon (same fallback-icon
// pattern as the reference design), defaulting to a plate icon otherwise.
// Word-bounded so short tokens like "tea" or "bar" can't false-positive
// inside unrelated words (e.g. "Steak" contains "tea", "Barbecue" contains
// "bar") — unanchored substring matching was mislabeling both.
const CATEGORY_ICON_RULES: [RegExp, LucideIcon][] = [
  [/\b(coffee|teas?|drinks?|beverages?|juices?)\b/i, Coffee],
  [/\b(desserts?|sweets?|cakes?|ice ?creams?)\b/i, IceCream],
  [/\bpizzas?\b/i, Pizza],
  [/\b(burgers?|sandwich(es)?|wraps?)\b/i, Sandwich],
  [/\bsalads?\b/i, Salad],
  [/\bsoups?\b/i, Soup],
  [/\b(breakfast|eggs?)\b/i, Egg],
  [/\b(meats?|beef|steaks?|bbq)\b/i, Beef],
  [/\b(fish|seafood)\b/i, Fish],
  [/\b(wine|cocktails?|bar|alcohol)\b/i, Wine],
]

function getCategoryIcon(name: string): LucideIcon {
  const match = CATEGORY_ICON_RULES.find(([pattern]) => pattern.test(name))
  return match ? match[1] : UtensilsCrossed
}

export function MenuCategoryTabs({ categories, activeCategory, onSelect }: MenuCategoryTabsProps) {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  // Keep the active tab scrolled into view as it changes — either from a
  // direct tap or from scroll-spy highlighting a different section while
  // browsing "All". `block: 'nearest'` keeps this to horizontal movement
  // only, since the tab row is the nearest scrollable ancestor.
  useEffect(() => {
    const key = activeCategory ?? "all"
    tabRefs.current[key]?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    })
  }, [activeCategory])

  return (
    <div className="border-t border-gray-100 bg-white">
      <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-hide">
        <button
          ref={(el) => {
            tabRefs.current.all = el
          }}
          onClick={() => onSelect(null)}
          className={cn(
            "flex flex-shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap",
            activeCategory === null
              ? "bg-brand-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200",
          )}
        >
          <LayoutGrid className="h-3.5 w-3.5 flex-shrink-0" />
          All
        </button>
        {categories.map((cat) => {
          const Icon = getCategoryIcon(cat.name)
          return (
            <button
              key={cat.id}
              ref={(el) => {
                tabRefs.current[cat.id] = el
              }}
              onClick={() => onSelect(cat.id)}
              className={cn(
                "flex flex-shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                activeCategory === cat.id
                  ? "bg-brand-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200",
              )}
            >
              <Icon className="h-3.5 w-3.5 flex-shrink-0" />
              {cat.name}
            </button>
          )
        })}
      </div>
    </div>
  );
}
