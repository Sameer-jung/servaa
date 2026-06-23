'use client'

import { useState, useEffect } from 'react'
import posthog from 'posthog-js'
import { useCartStore } from '@/hooks/useCartStore'
import { MenuCategoryTabs } from '@/components/menu/CategoryTabs'
import { MenuItemCard } from '@/components/menu/MenuItemCard'
import { StickyCart } from '@/components/menu/StickyCart'
import { CustomerActions } from '@/components/menu/CustomerActions'
import { OrderTracker } from '@/components/menu/OrderTracker'
import { ModifierModal } from '@/components/menu/ModifierModal'
import { OrderSidebar } from '@/components/menu/OrderSidebar'
import { Restaurant, Table, MenuCategory, MenuItem, Order, Modifier } from '@/types'
import { cn } from '@/utils/cn'

interface MenuClientProps {
  restaurant: Restaurant
  table: Table | null
  categories: MenuCategory[]
  items: MenuItem[]
  activeOrder: Order | null
  tableToken?: string
}

export function MenuClient({ restaurant, table, categories, items, activeOrder, tableToken }: MenuClientProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [trackedOrder, setTrackedOrder] = useState<Order | null>(activeOrder)
  const [customerSessionId, setCustomerSessionId] = useState<string | null>(null)
  const [selectedItemForModal, setSelectedItemForModal] = useState<MenuItem | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const cart = useCartStore()
  const hasCartItems = cart.totalItems > 0

  useEffect(() => {
    if (table) {
      cart.setRestaurantContext(restaurant.id, table.id)
    }
  }, [restaurant.id, table, cart])

  useEffect(() => {
    if (table) {
      posthog.group('restaurant', restaurant.id)
      posthog.capture('qr_scanned', { restaurant_id: restaurant.id, table_id: table.id })
    }
    posthog.capture('menu_viewed', { restaurant_id: restaurant.id, table_id: table?.id ?? null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!table) return

    const key = `servaa:customer-session:${table.id}`
    const existing = localStorage.getItem(key)

    if (existing) {
      setCustomerSessionId(existing)
      return
    }

    const nextSessionId = crypto.randomUUID()
    localStorage.setItem(key, nextSessionId)
    setCustomerSessionId(nextSessionId)
  }, [table])

  useEffect(() => {
    if (!table || !customerSessionId) return

    const fetchSessionOrder = async () => {
      const params = new URLSearchParams({
        tableId: table.id,
        customerSessionId,
      })

      const response = await fetch(`/api/orders/session?${params.toString()}`)
      if (!response.ok) return

      const result = await response.json().catch(() => null)
      setTrackedOrder(result?.order || null)
    }

    fetchSessionOrder()
  }, [table, customerSessionId])

  const getItemQuantity = (itemId: string) => {
    return cart.items
      .filter((i) => i.menuItem.id === itemId)
      .reduce((sum, item) => sum + item.quantity, 0)
  }

  const handleAddItem = (item: MenuItem) => {
    if (item.modifier_groups?.length) {
      setSelectedItemForModal(item)
      return
    }
    cart.addItem(item)
  }

  const handleRemoveItem = (item: MenuItem) => {
    const cartItem = [...cart.items].reverse().find((i) => i.menuItem.id === item.id)
    if (cartItem) cart.updateQuantity(cartItem.cartItemId, cartItem.quantity - 1)
  }

  const handleAddItemWithModifiers = (item: MenuItem, modifiers: Modifier[]) => {
    cart.addItem(item, 1, '', modifiers)
  }

  // Derived state for what to show
  const hasFilter = Boolean(searchQuery || activeCategory)

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description || '').toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = !activeCategory || item.category_id === activeCategory
    return matchesSearch && matchesCategory
  })

  const categoryGroups = categories
    .map((cat) => ({
      category: cat,
      items: items.filter((item) => item.category_id === cat.id),
    }))
    .filter((g) => g.items.length > 0)

  const itemCardProps = (item: MenuItem) => ({
    item,
    quantity: getItemQuantity(item.id),
    currency: restaurant.currency,
    onAdd: () => handleAddItem(item),
    onRemove: () => handleRemoveItem(item),
  })

  return (
    <div
      className={cn(
        'min-h-screen bg-gray-50',
        hasCartItems ? 'pb-80 lg:pb-0' : 'pb-32 lg:pb-0',
      )}
    >
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{restaurant.name}</h1>
            {table && (
              <p className="text-xs text-gray-500">
                Table {table.table_number}
                {' · '}
                <span className="font-medium text-green-500">Open</span>
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Active Order Tracker */}
      {trackedOrder && table && (
        <div className="px-4 pt-3">
          <OrderTracker
            orderId={trackedOrder.id}
            initialStatus={trackedOrder.status}
            items={trackedOrder.items || []}
            totalAmount={trackedOrder.total_amount || 0}
            currency={restaurant.currency}
            customerSessionId={customerSessionId}
            tableToken={tableToken}
          />
        </div>
      )}

      {/* Desktop: two-column layout */}
      <div className="lg:flex lg:items-start lg:gap-0">
        {/* Left: menu column */}
        <div className="min-w-0 flex-1">
          {/* Search bar */}
          <div className="px-4 pt-3">
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="search"
                placeholder="Search dishes, drinks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          </div>

          {/* Category Tabs */}
          <MenuCategoryTabs
            categories={categories}
            activeCategory={activeCategory}
            onSelect={(cat) => {
              setActiveCategory(cat)
              setSearchQuery('')
            }}
          />

          {/* Menu items: category sections or filtered grid */}
          {!hasFilter ? (
            <div className="px-4 py-4">
              <div className="space-y-5">
                {categoryGroups.map(({ category, items: catItems }) => (
                  <section key={category.id}>
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-base font-bold text-gray-900">{category.name}</h2>
                      {catItems.length > 4 && (
                        <button
                          onClick={() => setActiveCategory(category.id)}
                          className="text-sm font-medium text-brand-600 hover:underline"
                        >
                          View all
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {catItems.slice(0, 4).map((item) => (
                        <MenuItemCard key={item.id} {...itemCardProps(item)} variant="grid" />
                      ))}
                    </div>
                  </section>
                ))}

                {categoryGroups.length === 0 && (
                  <div className="py-12 text-center">
                    <p className="text-gray-500">No items available</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="px-4 py-4">
              {filteredItems.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {filteredItems.map((item) => (
                    <MenuItemCard key={item.id} {...itemCardProps(item)} variant="grid" />
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <p className="text-gray-500">No items found</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: order sidebar (desktop only) */}
        {table && (
          <div className="hidden w-80 flex-shrink-0 border-l border-gray-200 bg-white lg:block xl:w-96">
            <div className="sticky top-[57px] max-h-[calc(100vh-57px)] overflow-y-auto p-4">
              <OrderSidebar
                restaurantId={restaurant.id}
                tableId={table.id}
                tableToken={tableToken}
                currency={restaurant.currency}
                taxRate={restaurant.tax_rate}
                customerSessionId={customerSessionId}
                onOrderPlaced={setTrackedOrder}
              />
            </div>
          </div>
        )}
      </div>

      {/* Modals + mobile controls */}
      {table && (
        <>
          <ModifierModal
            item={selectedItemForModal}
            isOpen={Boolean(selectedItemForModal)}
            onClose={() => setSelectedItemForModal(null)}
            onAdd={handleAddItemWithModifiers}
            currency={restaurant.currency}
          />
          <StickyCart
            restaurantId={restaurant.id}
            tableId={table.id}
            tableToken={tableToken}
            currency={restaurant.currency}
            customerSessionId={customerSessionId}
            onOrderPlaced={setTrackedOrder}
          />
          {!hasCartItems && (
            <CustomerActions
              restaurantId={restaurant.id}
              tableId={table.id}
              customerSessionId={customerSessionId}
              tableToken={tableToken}
              currency={restaurant.currency}
            />
          )}
        </>
      )}

      {/* No Table Warning */}
      {!table && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-amber-200 bg-amber-50 p-4">
          <p className="text-center text-sm text-amber-700">
            Please scan the QR code at your table to order.
          </p>
        </div>
      )}
    </div>
  )
}
