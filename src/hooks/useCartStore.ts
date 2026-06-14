'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CartState, CartItem, MenuItem, Modifier } from '@/types'
import { calculateItemTotal } from '@/utils/pricing'

interface CartStore extends CartState {
  restaurantId: string | null
  tableId: string | null
  setRestaurantContext: (restaurantId: string, tableId: string) => void
}

function calculateTotals(items: CartItem[]) {
  return {
    totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
    totalPrice: items.reduce(
      (sum, item) => sum + calculateItemTotal(item.menuItem.price, item.modifiers) * item.quantity,
      0
    ),
  }
}

function createCartItemId(menuItemId: string, modifiers: Modifier[] = []) {
  const modifierKey = modifiers
    .map((modifier) => modifier.id)
    .sort()
    .join('.')

  return modifierKey ? `${menuItemId}-${modifierKey}` : menuItemId
}

function normalizeCartItem(item: CartItem): CartItem {
  return {
    ...item,
    cartItemId: item.cartItemId || createCartItemId(item.menuItem.id, item.modifiers),
    modifiers: item.modifiers || [],
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

      addItem: (menuItem: MenuItem, quantity = 1, notes = '', modifiers: Modifier[] = []) => {
        set((state) => {
          const cartItemId = createCartItemId(menuItem.id, modifiers)
          const existing = state.items.find(
            (item) => item.cartItemId === cartItemId
          )

          if (existing) {
            const items = state.items.map((item) =>
              item.cartItemId === cartItemId
                ? { ...item, quantity: item.quantity + quantity }
                : item
            )
            return withTotals(items)
          }

          return withTotals([...state.items, { cartItemId, menuItem, quantity, notes, modifiers }])
        })
      },

      removeItem: (cartItemId: string) => {
        set((state) => withTotals(
          state.items.filter((item) => item.cartItemId !== cartItemId)
        ))
      },

      updateQuantity: (cartItemId: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(cartItemId)
          return
        }
        set((state) => withTotals(
          state.items.map((item) =>
            item.cartItemId === cartItemId ? { ...item, quantity } : item
          )
        ))
      },

      updateNotes: (cartItemId: string, notes: string) => {
        set((state) => withTotals(
          state.items.map((item) =>
            item.cartItemId === cartItemId ? { ...item, notes } : item
          )
        ))
      },

      clearCart: () => set(withTotals([])),
    }),
    {
      name: 'qr-order-cart',
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<CartStore> | undefined
        const items = Array.isArray(persisted?.items)
          ? persisted.items.map((item) => normalizeCartItem(item))
          : []

        return {
          ...currentState,
          ...persisted,
          ...withTotals(items),
        }
      },
    }
  )
)
