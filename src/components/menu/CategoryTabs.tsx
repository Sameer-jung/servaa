'use client'

import { MenuCategory } from '@/types'
import { cn } from '@/utils/cn'

interface MenuCategoryTabsProps {
  categories: MenuCategory[]
  activeCategory: string | null
  onSelect: (categoryId: string | null) => void
}

export function MenuCategoryTabs({ categories, activeCategory, onSelect }: MenuCategoryTabsProps) {
  return (
    <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-100">
      <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-hide">
        <button
          onClick={() => onSelect(null)}
          className={cn(
            'flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap',
            activeCategory === null
              ? 'bg-brand-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          )}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={cn(
              'flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap',
              activeCategory === cat.id
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {cat.name}
          </button>
        ))}
      </div>
    </div>
  )
}
