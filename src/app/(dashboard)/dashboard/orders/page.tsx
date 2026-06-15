'use client'

import {toast} from "react-hot-toast"
import {MESSAGES} from "@/utils/messages"
import { useState, useEffect, useCallback, Suspense } from 'react'
import { ArrowLeft, Minus, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRestaurant } from '@/hooks/useRestaurant'
import { useRealtimeOrders } from '@/hooks/useRealtime'
import { OrderCard } from '@/components/orders/OrderCard'
import { Tabs } from '@/components/ui/Tabs'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoading } from '@/components/dashboard/PageLoading'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatCurrency, formatTimeAgo } from '@/utils/format'
import { isServiceRequestOrder } from '@/utils/orders'
import { MenuCategory, MenuItem, Modifier, OrderStatus, OrderWithItems, Restaurant, Table } from '@/types'
import { writeAuditLog } from '@/utils/audit'
import { calculateItemTotal } from '@/utils/pricing'
import {
  getSelectedModifierRecords,
  isModifierSelectionValid,
  updateModifierSelection,
  type ModifierSelections,
} from '@/utils/modifiers'

const tabs = [
  { id: 'active', label: 'Active' },
  { id: 'pending', label: 'Pending' },
  { id: 'completed', label: 'Completed' },
  { id: 'all', label: 'All' },
]

const activeStatuses: OrderStatus[] = ['pending', 'accepted', 'preparing', 'ready']
const completedStatuses: OrderStatus[] = ['completed', 'cancelled']
const pageSize = 20

function orderMatchesTab(order: OrderWithItems, activeTab: string) {
  if (activeTab === 'active') return activeStatuses.includes(order.status)
  if (activeTab === 'pending') return order.status === 'pending'
  if (activeTab === 'completed') return completedStatuses.includes(order.status)
  return true
}

function sortNewestFirst(orders: OrderWithItems[]) {
  return [...orders].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

type TableOrderGroup = {
  tableId: string
  tableNumber: string
  orders: OrderWithItems[]
  status: OrderStatus
  total: number
  latestCreatedAt: string
}

const tableStatusPriority: OrderStatus[] = ['pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled']

function getTableStatus(orders: OrderWithItems[]): OrderStatus {
  return tableStatusPriority.find((status) => orders.some((order) => order.status === status)) || 'completed'
}

function groupOrdersByTable(orders: OrderWithItems[]): TableOrderGroup[] {
  const groups = new Map<string, TableOrderGroup>()

  for (const order of orders) {
    const tableId = order.table_id || 'unknown'
    const existing = groups.get(tableId)

    if (existing) {
      existing.orders.push(order)
      existing.total += Number(order.total_amount || 0)
      if (new Date(order.created_at).getTime() > new Date(existing.latestCreatedAt).getTime()) {
        existing.latestCreatedAt = order.created_at
      }
      existing.status = getTableStatus(existing.orders)
      continue
    }

    groups.set(tableId, {
      tableId,
      tableNumber: order.table?.table_number || 'Unknown',
      orders: [order],
      status: order.status,
      total: Number(order.total_amount || 0),
      latestCreatedAt: order.created_at,
    })
  }

  return Array.from(groups.values()).sort(
    (a, b) => new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime()
  )
}

type PosCartItem = {
  cartItemId: string
  menuItem: MenuItem
  quantity: number
  modifiers: Modifier[]
}

interface StaffPosOrderEntryProps {
  restaurant: Restaurant
  onBack: () => void
  onOrderCreated: () => void
}

function StaffPosOrderEntry({ restaurant, onBack, onOrderCreated }: StaffPosOrderEntryProps) {
  const [tables, setTables] = useState<Table[]>([])
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [selectedTableId, setSelectedTableId] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [cartItems, setCartItems] = useState<PosCartItem[]>([])
  const [customizingItemId, setCustomizingItemId] = useState<string | null>(null)
  const [modifierSelections, setModifierSelections] = useState<ModifierSelections>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const supabase = createClient()

  const fetchPosData = useCallback(async () => {
    setLoading(true)

    const [{ data: tableData }, { data: categoryData }, { data: menuItemData }] = await Promise.all([
      supabase
        .from('tables')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('is_active', true)
        .order('table_number'),
      supabase
        .from('menu_categories')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('sort_order'),
      supabase
        .from('menu_items')
        .select('*, modifier_groups(*, modifiers(*))')
        .eq('restaurant_id', restaurant.id)
        .eq('available', true)
        .order('sort_order'),
    ])

    const nextTables = (tableData as Table[] | null) || []
    setTables(nextTables)
    setCategories((categoryData as MenuCategory[] | null) || [])
    setItems((menuItemData as MenuItem[] | null) || [])
    setSelectedTableId((current) => current || nextTables[0]?.id || '')
    setLoading(false)
  }, [restaurant.id, supabase])

  useEffect(() => {
    fetchPosData()
  }, [fetchPosData])

  const createCartItemId = (menuItem: MenuItem, modifiers: Modifier[]) => {
    const modifierKey = modifiers.map((modifier) => modifier.id).sort().join(',')
    return `${menuItem.id}:${modifierKey}`
  }

  const addItemToCart = (menuItem: MenuItem, modifiers: Modifier[] = []) => {
    const cartItemId = createCartItemId(menuItem, modifiers)

    setCartItems((current) => {
      const existing = current.find((item) => item.cartItemId === cartItemId)
      if (existing) {
        return current.map((item) =>
          item.cartItemId === cartItemId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }

      return [...current, { cartItemId, menuItem, quantity: 1, modifiers }]
    })
  }

  const addItem = (menuItem: MenuItem) => {
    if (menuItem.modifier_groups?.length) {
      setCustomizingItemId((current) => current === menuItem.id ? null : menuItem.id)
      setModifierSelections({})
      return
    }

    addItemToCart(menuItem)
  }

  const confirmCustomizedItem = (menuItem: MenuItem) => {
    if (!isModifierSelectionValid(menuItem, modifierSelections)) return

    addItemToCart(menuItem, getSelectedModifierRecords(menuItem, modifierSelections))
    setCustomizingItemId(null)
    setModifierSelections({})
  }

  const updateQuantity = (cartItemId: string, quantity: number) => {
    setCartItems((current) => {
      if (quantity <= 0) {
        return current.filter((item) => item.cartItemId !== cartItemId)
      }

      return current.map((item) =>
        item.cartItemId === cartItemId ? { ...item, quantity } : item
      )
    })
  }

  const removeItem = (cartItemId: string) => {
    setCartItems((current) => current.filter((item) => item.cartItemId !== cartItemId))
  }

  const getItemQuantity = (menuItemId: string) => {
    return cartItems
      .filter((item) => item.menuItem.id === menuItemId)
      .reduce((total, item) => total + item.quantity, 0)
  }

  const cartTotal = cartItems.reduce(
    (total, item) => total + calculateItemTotal(item.menuItem.price, item.modifiers) * item.quantity,
    0
  )
  const cartCount = cartItems.reduce((total, item) => total + item.quantity, 0)
  const normalizedSearch = searchQuery.trim().toLowerCase()
  const filteredItems = items.filter((item) => {
    const matchesCategory = activeCategory ? item.category_id === activeCategory : true
    const matchesSearch = normalizedSearch
      ? item.name.toLowerCase().includes(normalizedSearch) ||
        (item.description || '').toLowerCase().includes(normalizedSearch)
      : true

    return matchesCategory && matchesSearch
  })

  const handleSubmit = async () => {
    if (!selectedTableId) {
      toast.error('Select a table first.')
      return
    }

    if (cartItems.length === 0) {
      toast.error('Add at least one item.')
      return
    }

    setSubmitting(true)

    const clientRequestId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'staff',
          restaurantId: restaurant.id,
          tableId: selectedTableId,
          clientRequestId,
          items: cartItems.map((item) => ({
            menuItemId: item.menuItem.id,
            quantity: item.quantity,
            notes: null,
            modifiers: item.modifiers || [],
          })),
        }),
      })

      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.order) {
        toast.error(result?.error || MESSAGES.customerOrder.placeFailed)
        return
      }

      setCartItems([])
      toast.success('Order created and sent to active orders.')
      onOrderCreated()
    } catch (error) {
      console.error('[StaffPosOrderEntry] order request error:', error)
      toast.error(MESSAGES.common.networkError)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <PageLoading />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Orders
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Create Order</h1>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Manual staff entry using the same kitchen order flow</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-gray-200">Table</label>
            <select
              value={selectedTableId}
              onChange={(event) => setSelectedTableId(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-base text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            >
              {tables.length === 0 ? (
                <option value="">No active tables</option>
              ) : (
                tables.map((table) => (
                  <option key={table.id} value={table.id}>
                    Table {table.table_number}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveCategory(null)}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                    activeCategory === null
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  All
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setActiveCategory(category.id)}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                      activeCategory === category.id
                        ? 'bg-brand-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>

              <div className="relative sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search menu"
                  className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                />
              </div>
            </div>

            {filteredItems.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredItems.map((item) => {
                  const quantity = getItemQuantity(item.id)
                  const baseCartItemId = createCartItemId(item, [])
                  const hasModifiers = Boolean(item.modifier_groups?.length)
                  const isCustomizing = customizingItemId === item.id
                  const customSelectionValid = isModifierSelectionValid(item, modifierSelections)
                  const selectedModifiers = getSelectedModifierRecords(item, modifierSelections)
                  const selectedPrice = calculateItemTotal(item.price, selectedModifiers)

                  return (
                    <div
                      key={item.id}
                      className="flex min-h-32 flex-col justify-between rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950"
                    >
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 flex-1 break-words text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {item.name}
                          </p>
                          <p className="flex-shrink-0 text-sm font-bold text-gray-900 dark:text-gray-100">
                            {formatCurrency(item.price, restaurant.currency)}
                          </p>
                        </div>
                        {item.description && (
                          <p className="mt-1 line-clamp-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                            {item.description}
                          </p>
                        )}
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        {quantity > 0 && !hasModifiers ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateQuantity(baseCartItemId, quantity - 1)}
                              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                              aria-label={`Decrease ${item.name}`}
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="w-8 text-center text-sm font-bold text-gray-900 dark:text-gray-100">
                              {quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(baseCartItemId, quantity + 1)}
                              className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white hover:bg-brand-700"
                              aria-label={`Increase ${item.name}`}
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <Button type="button" size="sm" className="gap-2" onClick={() => addItem(item)}>
                            <Plus className="h-4 w-4" />
                            {hasModifiers ? 'Customize' : 'Add'}
                          </Button>
                        )}
                      </div>

                      {isCustomizing && (
                        <div className="mt-3 space-y-3 border-t border-gray-200 pt-3 dark:border-gray-800">
                          {item.modifier_groups?.map((group) => {
                            const selections = modifierSelections[group.id] || []
                            const isMissingRequired = group.is_required && selections.length === 0

                            return (
                              <div key={group.id} className={`rounded-lg border p-3 ${isMissingRequired ? 'border-amber-300 bg-amber-50/60 dark:bg-amber-950/20' : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'}`}>
                                <div className="mb-2 flex items-start justify-between gap-2">
                                  <p className="min-w-0 break-words text-sm font-semibold text-gray-900 dark:text-gray-100">{group.name}</p>
                                  <span className="flex-shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
                                    {group.is_required ? 'Required' : 'Optional'}
                                  </span>
                                </div>
                                <div className="space-y-2">
                                  {group.modifiers?.map((modifier) => {
                                    const isSelected = selections.includes(modifier.id)

                                    return (
                                      <label
                                        key={modifier.id}
                                        className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg border p-2 text-sm ${
                                          isSelected
                                            ? 'border-brand-500 bg-brand-50 text-brand-900'
                                            : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200'
                                        }`}
                                      >
                                        <span className="flex min-w-0 items-center gap-2">
                                          <input
                                            type={group.is_multiselect ? 'checkbox' : 'radio'}
                                            name={`staff-group-${group.id}`}
                                            checked={isSelected}
                                            onChange={() => setModifierSelections((current) =>
                                              updateModifierSelection(current, group.id, modifier.id, group.is_multiselect)
                                            )}
                                            className="h-4 w-4 flex-shrink-0 text-brand-600 focus:ring-brand-500"
                                          />
                                          <span className="min-w-0 break-words">{modifier.name}</span>
                                        </span>
                                        {modifier.price > 0 && (
                                          <span className="flex-shrink-0 text-xs font-semibold">
                                            +{formatCurrency(modifier.price, restaurant.currency)}
                                          </span>
                                        )}
                                      </label>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => {
                                setCustomizingItemId(null)
                                setModifierSelections({})
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="flex-1"
                              disabled={!customSelectionValid}
                              onClick={() => confirmCustomizedItem(item)}
                            >
                              Add {formatCurrency(selectedPrice, restaurant.currency)}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState title="No menu items" description="No available items match this search." />
            )}
          </div>
        </div>

        <aside className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 lg:sticky lg:top-6 lg:self-start">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Cart</h2>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {cartCount} {cartCount === 1 ? 'item' : 'items'}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200">
              <ShoppingCart className="h-5 w-5" />
            </div>
          </div>

          {cartItems.length > 0 ? (
            <div className="mt-4 max-h-[50vh] space-y-3 overflow-y-auto pr-1">
              {cartItems.map((item) => (
                <div key={item.cartItemId} className="rounded-lg bg-gray-50 p-3 dark:bg-gray-950">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {item.menuItem.name}
                      </p>
                      {(item.modifiers || []).length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {item.modifiers.map((modifier) => (
                            <p key={modifier.id} className="break-words text-xs font-medium text-gray-500 dark:text-gray-400">
                              + {modifier.name}
                              {modifier.price > 0 ? ` (${formatCurrency(modifier.price, restaurant.currency)})` : ''}
                            </p>
                          ))}
                        </div>
                      )}
                      <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                        {formatCurrency(calculateItemTotal(item.menuItem.price, item.modifiers), restaurant.currency)} each
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.cartItemId)}
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remove ${item.menuItem.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                        aria-label={`Decrease ${item.menuItem.name}`}
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center text-sm font-bold text-gray-900 dark:text-gray-100">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white"
                        aria-label={`Increase ${item.menuItem.name}`}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      {formatCurrency(calculateItemTotal(item.menuItem.price, item.modifiers) * item.quantity, restaurant.currency)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Cart is empty" description="Add menu items to create an order." />
          )}

          <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
            <div className="flex items-center justify-between text-base font-bold text-gray-900 dark:text-gray-100">
              <span>Subtotal</span>
              <span>{formatCurrency(cartTotal, restaurant.currency)}</span>
            </div>
            <Button
              type="button"
              className="mt-4 w-full gap-2"
              disabled={!selectedTableId || cartItems.length === 0}
              isLoading={submitting}
              onClick={handleSubmit}
            >
              <ShoppingCart className="h-4 w-4" />
              Create Order
            </Button>
          </div>
        </aside>
      </div>
    </div>
  )
}

interface TableOrderCardProps {
  group: TableOrderGroup
  expanded: boolean
  onToggle: () => void
  onAccept: (orderId: string) => void
  onReject: (orderId: string) => void
  onUpdateStatus: (orderId: string, status: string) => void
  onCancelItem: (itemId: string, orderId: string) => void
  currency?: string
  updatingOrderId?: string | null
  cancellingItemId?: string | null
}

function TableOrderCard({
  group,
  expanded,
  onToggle,
  onAccept,
  onReject,
  onUpdateStatus,
  onCancelItem,
  currency,
  updatingOrderId,
  cancellingItemId,
}: TableOrderCardProps) {
  const activeCount = group.orders.filter((order) => activeStatuses.includes(order.status)).length

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Table {group.tableNumber}</span>
            <Badge status={group.status}>{group.status}</Badge>
          </div>
          <p className="mt-1 text-sm font-medium text-gray-500 dark:text-gray-400">
            {group.orders.length} {group.orders.length === 1 ? 'order' : 'orders'} - {activeCount} active - {formatTimeAgo(group.latestCreatedAt)}
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(group.total, currency)}</p>
          <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">{expanded ? 'Hide' : 'View'} orders</p>
        </div>
      </button>

      {expanded && (
        <div className="mt-4 space-y-3 border-t border-gray-100 pt-4 dark:border-gray-800">
          {group.orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onAccept={() => onAccept(order.id)}
              onReject={() => onReject(order.id)}
              onUpdateStatus={(status) => onUpdateStatus(order.id, status)}
              onCancelItem={(itemId) => onCancelItem(itemId, order.id)}
              currency={currency}
              isLoading={updatingOrderId === order.id}
              cancellingItemId={cancellingItemId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function OrdersContent() {
  const [orders, setOrders] = useState<OrderWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateOrder, setShowCreateOrder] = useState(false)
  const [activeTab, setActiveTab] = useState('active')
  const [page, setPage] = useState(0)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({})
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null)
  const [cancellingItemId, setCancellingItemId] = useState<string | null>(null)
  const { restaurant, loading: restaurantLoading } = useRestaurant()
  const supabase = createClient()

  const fetchOrders = useCallback(async () => {
    if (!restaurant) {
      setOrders([])
      setLoading(false)
      return
    }

    setLoading(true)
    const from = page * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('orders')
      .select('*, table:tables(table_number), items:order_items(*, menu_item:menu_items(name, price))')
      .eq('restaurant_id', restaurant.id)
      .order('created_at', { ascending: false })

    if (activeTab === 'active') {
      query = query.in('status', ['pending', 'accepted', 'preparing', 'ready'])
    } else if (activeTab === 'pending') {
      query = query.eq('status', 'pending')
    } else if (activeTab === 'completed') {
      query = query.in('status', ['completed', 'cancelled'])
    }

    const { data } = await query.range(from, to)
    const nextOrders = (data as OrderWithItems[]) || []
    setOrders(nextOrders)
    setHasNextPage(nextOrders.length === pageSize)
    setLoading(false)
  }, [restaurant, activeTab, page, supabase])

  const fetchOrderById = useCallback(async (orderId: string) => {
    if (!restaurant) return null

    const { data } = await supabase
      .from('orders')
      .select('*, table:tables(table_number), items:order_items(*, menu_item:menu_items(name, price))')
      .eq('restaurant_id', restaurant.id)
      .eq('id', orderId)
      .maybeSingle()

    return (data as OrderWithItems | null) || null
  }, [restaurant, supabase])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId)
    setPage(0)
  }

  // Realtime updates
  useRealtimeOrders(restaurant?.id || '', useCallback((update) => {
    if (update.type === 'DELETE') {
      setOrders((prev) => prev.filter((o) => o.id !== update.orderId))
      return
    }

    void fetchOrderById(update.orderId).then((order) => {
      if (!order) {
        setOrders((prev) => prev.filter((o) => o.id !== update.orderId))
        return
      }

      setOrders((prev) => {
        const withoutCurrent = prev.filter((o) => o.id !== order.id)
        if (!orderMatchesTab(order, activeTab)) {
          return withoutCurrent
        }

        return sortNewestFirst([order, ...withoutCurrent])
      })
    })
  }, [activeTab, fetchOrderById]))

  const applyOptimisticStatus = (orderId: string, status: OrderStatus) => {
    setOrders((prev) => {
      const next = prev.map((order) =>
        order.id === orderId ? { ...order, status } : order
      )
      return sortNewestFirst(next.filter((order) => orderMatchesTab(order, activeTab)))
    })
  }

  const handleAccept = async (orderId: string) => {
    if(updatingOrderId) return
    setUpdatingOrderId(orderId)

    const order = orders.find(o => o.id === orderId)
    const isServiceReq = order ? isServiceRequestOrder(order) : false;
    const newStatus: OrderStatus = isServiceReq ? 'completed' : 'accepted'

    applyOptimisticStatus(orderId, newStatus)
    const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)
    
    if (isServiceReq) {
      await supabase.from('service_requests').update({ status: 'completed' }).eq('legacy_order_id', orderId)
    }

    if (error) fetchOrders()
    if (!error && restaurant) {
      void writeAuditLog(supabase, {
        restaurantId: restaurant.id,
        action: 'order.status_changed',
        entityType: 'order',
        entityId: orderId,
        metadata: { status: newStatus },
      })
      toast.success(isServiceReq ? 'Request completed' : MESSAGES.staffOrder.accepted);
    }
    setUpdatingOrderId(null)
  }

  const handleReject = async (orderId: string) => {
    if(updatingOrderId) return 
    setUpdatingOrderId(orderId)
    applyOptimisticStatus(orderId, 'cancelled')
    const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId)
    if (error) fetchOrders()
    if (!error && restaurant) {
      void writeAuditLog(supabase, {
        restaurantId: restaurant.id,
        action: 'order.status_changed',
        entityType: 'order',
        entityId: orderId,
        metadata: { status: 'cancelled' },
      })
      toast.success(MESSAGES.staffOrder.rejected);
    }
    setUpdatingOrderId(null)
  }

  const handleUpdateStatus = async (orderId: string, status: string) => {
    if(updatingOrderId) return
    setUpdatingOrderId(orderId)
    const nextStatus = status as OrderStatus
    applyOptimisticStatus(orderId, nextStatus)
    const { error } = await supabase.from('orders').update({ status: nextStatus }).eq('id', orderId)
    if (error) {
      fetchOrders()
      setUpdatingOrderId(null)
      toast.error(MESSAGES.staffOrder.updateFailed);
      return
    }

    if (restaurant) {
      void writeAuditLog(supabase, {
        restaurantId: restaurant.id,
        action: 'order.status_changed',
        entityType: 'order',
        entityId: orderId,
        metadata: { status: nextStatus },
      })
      if (nextStatus === 'preparing') toast.success(MESSAGES.staffOrder.preparing)
      if (nextStatus === 'ready') toast.success(MESSAGES.staffOrder.ready)
    }

    if (nextStatus === 'completed' && restaurant) {
      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, restaurantId: restaurant.id }),
      })

      if (!response.ok) {
        fetchOrders()
      }
      if (nextStatus === 'completed') toast.success(MESSAGES.staffOrder.completed)
    }
    setUpdatingOrderId(null)
  }

  const handleCancelItem = async (itemId: string, orderId: string) => {
    if (cancellingItemId) return
    setCancellingItemId(itemId)

    try {
      const response = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderItemId: itemId, restaurantId: restaurant?.id }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        toast.error(result?.error || 'Failed to cancel item')
        return
      }

      // Optimistic update: mark item cancelled, recalc total, auto-cancel order if needed
      setOrders((prev) => prev.map((order) => {
        if (order.id !== orderId) return order
        const updatedItems = order.items.map((item) =>
          item.id === itemId ? { ...item, cancelled: true } : item
        )
        const allCancelled = updatedItems.every((item) => item.cancelled)
        const newTotal = updatedItems
          .filter((item) => !item.cancelled)
          .reduce((sum, item) => sum + item.quantity * (item.price_snapshot ?? 0), 0)
        return {
          ...order,
          items: updatedItems,
          status: allCancelled ? ('cancelled' as OrderStatus) : order.status,
          total_amount: newTotal,
        }
      }))

      if (result?.orderCancelled) {
        toast.success('All items cancelled — order cancelled automatically.')
      } else {
        toast.success('Item cancelled.')
      }
    } catch {
      toast.error('Network error — please try again.')
    } finally {
      setCancellingItemId(null)
    }
  }

  if (restaurantLoading || loading) {
    return <PageLoading />
  }

  if (showCreateOrder && restaurant) {
    return (
      <StaffPosOrderEntry
        restaurant={restaurant}
        onBack={() => setShowCreateOrder(false)}
        onOrderCreated={() => {
          setShowCreateOrder(false)
          fetchOrders()
        }}
      />
    )
  }

  const tableGroups = groupOrdersByTable(orders)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Orders</h1>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Manage incoming orders in real-time</p>
        </div>
        <Button type="button" className="gap-2 sm:self-start" onClick={() => setShowCreateOrder(true)}>
          <Plus className="h-4 w-4" />
          Create Order
        </Button>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={handleTabChange} />

      {tableGroups.length > 0 ? (
        <div className="space-y-3">
          {tableGroups.map((group) => (
            <TableOrderCard
              key={group.tableId}
              group={group}
              expanded={expandedTables[group.tableId] ?? true}
              onToggle={() => setExpandedTables((current) => ({
                ...current,
                [group.tableId]: !(current[group.tableId] ?? true),
              }))}
              onAccept={handleAccept}
              onReject={handleReject}
              onUpdateStatus={handleUpdateStatus}
              onCancelItem={handleCancelItem}
              currency={restaurant?.currency}
              updatingOrderId={updatingOrderId}
              cancellingItemId={cancellingItemId}
            />
          ))}
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}
            >
              Previous
            </Button>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Page {page + 1}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!hasNextPage}
              onClick={() => setPage((currentPage) => currentPage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : (
        <EmptyState
          title="No orders"
          description={`No ${activeTab} orders at the moment.`}
          icon={
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
      )}
    </div>
  )
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <OrdersContent />
    </Suspense>
  )
}
