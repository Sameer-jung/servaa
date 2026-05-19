'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CartState, CartItem, MenuItem } from '@/types'

interface CartStore extends CartState {
  restaurantId: string | null
  tableId: string | null
  setRestaurantContext: (restaurantId: string, tableId: string) => void
}

function calculateTotals(items: CartItem[]) {
  return {
    totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
    totalPrice: items.reduce(
      (sum, item) => sum + item.menuItem.price * item.quantity,
      0
    ),
  }
}

function withTotals(items: CartItem[]) {
  return {
    items,
    ...calculateTotals(items),
  }
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      restaurantId: null,
      tableId: null,
      totalItems: 0,
      totalPrice: 0,

      setRestaurantContext: (restaurantId, tableId) => {
        const current = get()
        if (current.restaurantId !== restaurantId || current.tableId !== tableId) {
          set({ restaurantId, tableId, ...withTotals([]) })
        }
      },

      addItem: (menuItem: MenuItem, quantity = 1, notes = '') => {
        set((state) => {
          const existing = state.items.find(
            (item) => item.menuItem.id === menuItem.id
          )

          if (existing) {
            const items = state.items.map((item) =>
              item.menuItem.id === menuItem.id
                ? { ...item, quantity: item.quantity + quantity }
                : item
            )
            return withTotals(items)
          }

          return withTotals([...state.items, { menuItem, quantity, notes }])
        })
      },

      removeItem: (itemId: string) => {
        set((state) => withTotals(
          state.items.filter((item) => item.menuItem.id !== itemId)
        ))
      },

      updateQuantity: (itemId: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(itemId)
          return
        }
        set((state) => withTotals(
          state.items.map((item) =>
            item.menuItem.id === itemId ? { ...item, quantity } : item
          )
        ))
      },

      updateNotes: (itemId: string, notes: string) => {
        set((state) => withTotals(
          state.items.map((item) =>
            item.menuItem.id === itemId ? { ...item, notes } : item
          )
        ))
      },

      clearCart: () => set(withTotals([])),
    }),
    {
      name: 'qr-order-cart',
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<CartStore> | undefined
        const items = Array.isArray(persisted?.items) ? persisted.items : []

        return {
          ...currentState,
          ...persisted,
          ...withTotals(items),
        }
      },
    }
  )
)
