'use client'

import { useState, useEffect } from 'react'
import { useCartStore } from '@/hooks/useCartStore'
import { MenuCategoryTabs } from '@/components/menu/CategoryTabs'
import { MenuItemCard } from '@/components/menu/MenuItemCard'
import { StickyCart } from '@/components/menu/StickyCart'
import { CustomerActions } from '@/components/menu/CustomerActions'
import { OrderTracker } from '@/components/menu/OrderTracker'
import { TableInvoice } from '@/components/menu/TableInvoice'
import { ModifierModal } from '@/components/menu/ModifierModal'
import { Restaurant, Table, MenuCategory, MenuItem, Order, Modifier } from '@/types'

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
  const cart = useCartStore()
  const hasCartItems = cart.totalItems > 0

  useEffect(() => {
    if (table) {
      cart.setRestaurantContext(restaurant.id, table.id)
    }
  }, [restaurant.id, table, cart])

  useEffect(() => {
    if (!table) return;

    const key = `servaa:customer-session:${table.id}`;
    const existing = localStorage.getItem(key);

    if (existing) {
      setCustomerSessionId(existing);
      return;
    }

    const nextSessionId = crypto.randomUUID();
    localStorage.setItem(key, nextSessionId);
    setCustomerSessionId(nextSessionId);
  }, [table]);

  useEffect(() => {
    if (!table || !customerSessionId) return;

    const fetchSessionOrder = async () => {
      const params = new URLSearchParams({
        tableId: table.id,
        customerSessionId,
      });

      const response = await fetch(`/api/orders/session?${params.toString()}`);
      if (!response.ok) return;

      const result = await response.json().catch(() => null);
      setTrackedOrder(result?.order || null);
    };

    fetchSessionOrder();
  }, [table, customerSessionId]);

  const filteredItems = activeCategory
    ? items.filter((item) => item.category_id === activeCategory)
    : items

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

  const handleAddItemWithModifiers = (item: MenuItem, modifiers: Modifier[]) => {
    cart.addItem(item, 1, '', modifiers)
  }

  return (
    <div
      className={
        hasCartItems
          ? "min-h-screen bg-gray-50 pb-80"
          : "min-h-screen bg-gray-50 pb-32"
      }
    >
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
              currency={restaurant.currency}
              onAdd={() => handleAddItem(item)}
              onRemove={() => {
                const cartItem = [...cart.items].reverse().find((i) => i.menuItem.id === item.id)
                if (cartItem) cart.updateQuantity(cartItem.cartItemId, cartItem.quantity - 1)
              }}
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
              currency={restaurant.currency}
            />
          )}
          <TableInvoice
            tableId={table.id}
            tableToken={tableToken}
            currency={restaurant.currency}
          />
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
  );
}
