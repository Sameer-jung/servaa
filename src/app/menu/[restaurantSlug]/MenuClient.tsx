'use client'

import { useState, useEffect } from 'react'
import { useCartStore } from '@/hooks/useCartStore'
import { MenuCategoryTabs } from '@/components/menu/CategoryTabs'
import { MenuItemCard } from '@/components/menu/MenuItemCard'
import { StickyCart } from '@/components/menu/StickyCart'
import { CustomerActions } from '@/components/menu/CustomerActions'
import { OrderTracker } from '@/components/menu/OrderTracker'
import { TableInvoice } from '@/components/menu/TableInvoice'
import { Restaurant, Table, MenuCategory, MenuItem, Order } from '@/types'

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
  const cart = useCartStore()
  const hasCartItems = cart.totalItems > 0

  useEffect(() => {
    if (table) {
      cart.setRestaurantContext(restaurant.id, table.id)
    }
  }, [restaurant.id, table, cart])

  const filteredItems = activeCategory
    ? items.filter((item) => item.category_id === activeCategory)
    : items

  const getItemQuantity = (itemId: string) => {
    const cartItem = cart.items.find((i) => i.menuItem.id === itemId)
    return cartItem?.quantity || 0
  }

  return (
    <div className={hasCartItems ? 'min-h-screen bg-gray-50 pb-80' : 'min-h-screen bg-gray-50 pb-32'}>
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/95 backdrop-blur-sm">
        <div className="px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">{restaurant.name}</h1>
          {table && (
            <p className="text-xs text-gray-500">Table {table.table_number}</p>
          )}
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
          />
        </div>
      )}

      {/* Category Tabs */}
      <MenuCategoryTabs
        categories={categories}
        activeCategory={activeCategory}
        onSelect={setActiveCategory}
      />

      {/* Menu Items */}
      <div className="px-4 py-3 space-y-3">
        {filteredItems.length > 0 ? (
          filteredItems.map((item) => (
            <MenuItemCard
              key={item.id}
              item={item}
              quantity={getItemQuantity(item.id)}
              onAdd={() => cart.addItem(item)}
              onRemove={() => cart.updateQuantity(item.id, getItemQuantity(item.id) - 1)}
            />
          ))
        ) : (
          <div className="py-12 text-center">
            <p className="text-gray-500">No items available</p>
          </div>
        )}
      </div>

      {/* Sticky Cart */}
      {table && (
        <>
          <StickyCart
            restaurantId={restaurant.id}
            tableId={table.id}
            tableToken={tableToken}
            onOrderPlaced={setTrackedOrder}
          />
          {!hasCartItems && <CustomerActions restaurantId={restaurant.id} tableId={table.id} tableToken={tableToken} />}
          <TableInvoice tableId={table.id} tableToken={tableToken} currency={restaurant.currency} />
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
