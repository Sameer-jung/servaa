'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import toast from 'react-hot-toast'
import { AlertTriangle, Boxes, ClipboardCheck, MinusCircle, PackagePlus, Plus, PlusCircle } from 'lucide-react'
import { useRestaurant } from '@/hooks/useRestaurant'
import { useRole } from '@/hooks/useRole'
import { PageLoading } from '@/components/dashboard/PageLoading'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { StatCard } from '@/components/dashboard/StatCard'
import { formatCurrency, formatDate } from '@/utils/format'
import type { InventoryItem, InventoryUnit, StockMovement } from '@/types'

const UNIT_OPTIONS: InventoryUnit[] = ['kg', 'g', 'l', 'ml', 'piece', 'bottle', 'packet', 'other']

// Restaurant stockroom categories — a practical set covering most kitchens.
const INVENTORY_CATEGORIES = [
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
  'Other',
]

function isLowStock(item: InventoryItem) {
  return item.reorder_threshold > 0 && item.current_quantity <= item.reorder_threshold
}

function InventoryContent() {
  const { restaurant, loading: restaurantLoading } = useRestaurant()
  const { isOwner } = useRole(restaurant?.id)
  const currency = restaurant?.currency || 'NPR'

  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null)
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null)
  const [archivingItem, setArchivingItem] = useState<InventoryItem | null>(null)
  const [archiveBusy, setArchiveBusy] = useState(false)

  const fetchItems = useCallback(async () => {
    if (!restaurant) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    const res = await fetch(`/api/inventory?restaurantId=${encodeURIComponent(restaurant.id)}`)
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      toast.error(data?.error || 'Failed to load inventory')
      setItems([])
    } else {
      setItems((data?.items as InventoryItem[]) || [])
    }
    setLoading(false)
  }, [restaurant])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const handleArchive = async () => {
    if (!archivingItem || !restaurant) return
    setArchiveBusy(true)
    const res = await fetch('/api/inventory', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: archivingItem.id, restaurantId: restaurant.id, is_active: false }),
    })
    setArchiveBusy(false)
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      toast.error(data?.error || 'Could not archive item')
      return
    }
    toast.success('Item archived')
    setArchivingItem(null)
    fetchItems()
  }

  if (restaurantLoading || loading) return <PageLoading />

  const lowStockItems = items.filter(isLowStock)
  const query = search.trim().toLowerCase()
  const baseItems = lowStockOnly ? lowStockItems : items

  // Distinct categories present (for the category filter chips).
  const categoryOf = (item: InventoryItem) => item.category?.trim() || 'Uncategorized'
  const categories = Array.from(new Set(items.map(categoryOf))).sort((a, b) => a.localeCompare(b))

  const visibleItems = baseItems.filter((item) => {
    if (categoryFilter !== 'all' && categoryOf(item) !== categoryFilter) return false
    if (!query) return true
    return (
      item.name.toLowerCase().includes(query) ||
      (item.category ?? '').toLowerCase().includes(query)
    )
  })
  const stockValue = items.reduce(
    (sum, item) => sum + Number(item.current_quantity) * Number(item.cost_per_unit ?? 0),
    0
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Inventory</h1>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Track stock levels and record purchases, usage, and counts.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingItem(null)
            setItemModalOpen(true)
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" /> Add Item
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard title="Items tracked" value={items.length} icon={<Boxes className="h-5 w-5" />} />
        <StatCard
          title="Low stock"
          value={lowStockItems.length}
          subtitle={lowStockItems.length > 0 ? 'Needs reordering' : 'All good'}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <StatCard
          title="Stock value"
          value={formatCurrency(stockValue, currency)}
          subtitle="At last known cost"
          icon={<PackagePlus className="h-5 w-5" />}
        />
      </div>

      {items.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-xs">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items by name…"
            />
          </div>
          <div className="flex w-fit overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            {(
              [
                { key: false, label: `All (${items.length})` },
                { key: true, label: `Low stock (${lowStockItems.length})` },
              ] as const
            ).map((tab) => (
              <button
                key={String(tab.key)}
                type="button"
                onClick={() => setLowStockOnly(tab.key)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  lowStockOnly === tab.key
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Category chips */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {(['all', ...categories]).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                categoryFilter === cat
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {cat === 'all' ? 'All categories' : cat}
            </button>
          ))}
        </div>
      )}

      {visibleItems.length === 0 ? (
        <EmptyState
          title={
            query
              ? 'No items match your search'
              : categoryFilter !== 'all'
                ? `No items in “${categoryFilter}”`
                : lowStockOnly
                  ? 'No low-stock items'
                  : 'No inventory items yet'
          }
          description={
            query
              ? `Nothing matches “${search.trim()}”.`
              : categoryFilter !== 'all'
                ? 'Try another category, or add an item here.'
                : lowStockOnly
                  ? 'Everything is above its reorder threshold.'
                  : 'Add the ingredients and supplies you want to keep an eye on.'
          }
          action={
            !lowStockOnly && !query && categoryFilter === 'all' ? (
              <Button onClick={() => { setEditingItem(null); setItemModalOpen(true) }}>
                <Plus className="mr-1.5 h-4 w-4" /> Add Item
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {visibleItems.map((item) => {
              const low = isLowStock(item)
              return (
                <div key={item.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {item.name}
                      </span>
                      {low && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          <AlertTriangle className="h-3 w-3" /> Low
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                      {item.category || 'Uncategorized'}
                      {item.reorder_threshold > 0 && ` · reorder at ${item.reorder_threshold} ${item.unit}`}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className={`text-base font-bold ${low ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'}`}>
                      {Number(item.current_quantity)} <span className="text-xs font-medium text-gray-400">{item.unit}</span>
                    </p>
                    {item.cost_per_unit != null && (
                      <p className="text-xs font-medium text-gray-400 dark:text-gray-500">
                        {formatCurrency(Number(item.cost_per_unit), currency)}/{item.unit}
                      </p>
                    )}
                  </div>

                  <div className="flex w-full gap-2 sm:w-auto">
                    <Button size="sm" onClick={() => setMovementItem(item)}>
                      Update stock
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setHistoryItem(item)}>
                      History
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setEditingItem(item); setItemModalOpen(true) }}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {restaurant && (
        <ItemModal
          isOpen={itemModalOpen}
          onClose={() => setItemModalOpen(false)}
          restaurantId={restaurant.id}
          item={editingItem}
          onArchive={() => { setItemModalOpen(false); setArchivingItem(editingItem) }}
          onSaved={() => { setItemModalOpen(false); fetchItems() }}
        />
      )}

      {restaurant && movementItem && (
        <MovementModal
          isOpen={Boolean(movementItem)}
          onClose={() => setMovementItem(null)}
          restaurantId={restaurant.id}
          item={movementItem}
          canLogExpense={isOwner}
          currency={currency}
          onSaved={() => { setMovementItem(null); fetchItems() }}
        />
      )}

      {restaurant && historyItem && (
        <HistoryModal
          isOpen={Boolean(historyItem)}
          onClose={() => setHistoryItem(null)}
          restaurantId={restaurant.id}
          item={historyItem}
          currency={currency}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(archivingItem)}
        title="Archive this item?"
        description={`"${archivingItem?.name ?? ''}" will be hidden from your inventory. Its history stays intact and you can re-add it later.`}
        confirmLabel="Archive"
        isLoading={archiveBusy}
        onConfirm={handleArchive}
        onCancel={() => setArchivingItem(null)}
      />
    </div>
  )
}

function ItemModal({
  isOpen,
  onClose,
  restaurantId,
  item,
  onArchive,
  onSaved,
}: {
  isOpen: boolean
  onClose: () => void
  restaurantId: string
  item: InventoryItem | null
  onArchive: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [unit, setUnit] = useState<InventoryUnit>('piece')
  const [category, setCategory] = useState('')
  const [threshold, setThreshold] = useState('')
  const [cost, setCost] = useState('')
  const [errors, setErrors] = useState<{ name?: string; threshold?: string; cost?: string }>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setName(item?.name ?? '')
      setUnit(item?.unit ?? 'piece')
      setCategory(item?.category ?? '')
      setThreshold(item ? String(item.reorder_threshold) : '')
      setCost(item?.cost_per_unit != null ? String(item.cost_per_unit) : '')
      setErrors({})
    }
  }, [isOpen, item])

  const validate = () => {
    const next: { name?: string; threshold?: string; cost?: string } = {}
    const trimmedName = name.trim()
    if (!trimmedName) next.name = 'Name is required'
    else if (trimmedName.length < 2) next.name = 'Name is too short'
    else if (trimmedName.length > 120) next.name = 'Name is too long (max 120)'

    if (threshold.trim() !== '') {
      const t = Number(threshold)
      if (Number.isNaN(t) || t < 0) next.threshold = 'Must be 0 or more'
      else if (t > 99999999.999) next.threshold = 'Too large'
    }

    if (cost.trim() !== '') {
      const c = Number(cost)
      if (Number.isNaN(c) || c < 0) next.cost = 'Must be 0 or more'
      else if (c > 99999999.99) next.cost = 'Too large'
    }
    return next
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setSaving(true)
    const payload = {
      restaurantId,
      name: name.trim(),
      unit,
      category: category.trim() || null,
      reorder_threshold: threshold === '' ? 0 : Number(threshold),
      cost_per_unit: cost === '' ? null : Number(cost),
    }
    const res = await fetch('/api/inventory', {
      method: item ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item ? { ...payload, itemId: item.id } : payload),
    })
    const data = await res.json().catch(() => null)
    setSaving(false)
    if (!res.ok) {
      toast.error(data?.error || 'Could not save item')
      return
    }
    toast.success(item ? 'Item updated' : 'Item added')
    onSaved()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={item ? 'Edit Item' : 'Add Item'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          value={name}
          maxLength={120}
          onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: undefined })) }}
          placeholder="Chicken breast"
          error={errors.name}
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-gray-200">Unit</label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as InventoryUnit)}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-base text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-gray-200">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-base text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">Uncategorized</option>
              {INVENTORY_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              {category && !INVENTORY_CATEGORIES.includes(category) && (
                <option value={category}>{category}</option>
              )}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Reorder threshold"
            type="number"
            min="0"
            step="0.001"
            inputMode="decimal"
            value={threshold}
            onChange={(e) => { setThreshold(e.target.value); setErrors((p) => ({ ...p, threshold: undefined })) }}
            placeholder="0"
            error={errors.threshold}
          />
          <Input
            label="Cost per unit"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={cost}
            onChange={(e) => { setCost(e.target.value); setErrors((p) => ({ ...p, cost: undefined })) }}
            placeholder="Optional"
            error={errors.cost}
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" isLoading={saving}>
            {item ? 'Save' : 'Add Item'}
          </Button>
        </div>
        {item && (
          <button
            type="button"
            onClick={onArchive}
            disabled={saving}
            className="w-full pt-1 text-center text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
          >
            Archive this item
          </button>
        )}
      </form>
    </Modal>
  )
}

function MovementModal({
  isOpen,
  onClose,
  restaurantId,
  item,
  canLogExpense,
  currency,
  onSaved,
}: {
  isOpen: boolean
  onClose: () => void
  restaurantId: string
  item: InventoryItem
  canLogExpense: boolean
  currency: string
  onSaved: () => void
}) {
  const [action, setAction] = useState<'add' | 'remove' | 'count'>('add')
  const [reason, setReason] = useState<'usage' | 'wastage'>('usage')
  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [vendor, setVendor] = useState('')
  const [note, setNote] = useState('')
  const [logExpense, setLogExpense] = useState(true)
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Online'>('Cash')
  const [errors, setErrors] = useState<{ quantity?: string; unitCost?: string }>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setAction('add')
      setReason('usage')
      setQuantity('')
      setUnitCost(item.cost_per_unit != null ? String(item.cost_per_unit) : '')
      setVendor('')
      setNote('')
      setLogExpense(true)
      setPaymentMethod('Cash')
      setErrors({})
    }
  }, [isOpen, item])

  const current = Number(item.current_quantity)
  const qtyNum = quantity === '' || Number.isNaN(Number(quantity)) ? null : Number(quantity)

  // Live preview of what the stock will become after this action.
  let projected: number | null = null
  if (qtyNum !== null) {
    if (action === 'add') projected = current + qtyNum
    else if (action === 'remove') projected = current - qtyNum
    else projected = qtyNum
  }

  const validate = () => {
    const next: { quantity?: string; unitCost?: string } = {}
    if (qtyNum === null) next.quantity = 'Enter a number'
    else if (action !== 'count' && qtyNum <= 0) next.quantity = 'Must be greater than 0'
    else if (qtyNum < 0) next.quantity = 'Cannot be negative'
    else if (qtyNum > 99999999.999) next.quantity = 'That number is too large'
    else if (projected !== null && projected < 0) next.quantity = `Only ${current} ${item.unit} in stock`

    if (action === 'add' && unitCost.trim() !== '') {
      const cost = Number(unitCost)
      if (Number.isNaN(cost) || cost < 0) next.unitCost = 'Invalid cost'
      else if (cost > 99999999.99) next.unitCost = 'Cost is too large'
    }
    return next
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setSaving(true)

    const movementType =
      action === 'add' ? 'purchase' : action === 'count' ? 'count' : reason

    const payload: Record<string, unknown> = {
      restaurantId,
      inventoryItemId: item.id,
      movement_type: movementType,
      note: note.trim() || null,
    }
    if (action === 'count') {
      payload.counted_quantity = qtyNum
    } else {
      payload.quantity = qtyNum
    }
    if (action === 'add') {
      payload.unit_cost = unitCost === '' ? null : Number(unitCost)
      payload.vendor = vendor.trim() || null
      const willLogExpense = canLogExpense && logExpense && unitCost !== ''
      payload.createExpense = willLogExpense
      if (willLogExpense) payload.payment_method = paymentMethod
    }

    const res = await fetch('/api/inventory/movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => null)
    setSaving(false)
    if (!res.ok) {
      toast.error(data?.error || 'Could not save')
      return
    }
    toast.success('Stock updated')
    onSaved()
  }

  const actions = [
    { key: 'add' as const, label: 'Add stock', hint: 'Bought / received', icon: PlusCircle },
    { key: 'remove' as const, label: 'Remove stock', hint: 'Used or wasted', icon: MinusCircle },
    { key: 'count' as const, label: 'Set count', hint: 'I counted it', icon: ClipboardCheck },
  ]

  const submitLabel = action === 'add' ? 'Add stock' : action === 'remove' ? 'Remove stock' : 'Update count'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Update stock · ${item.name}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 dark:bg-gray-950 dark:text-gray-400">
          On the shelf now: <span className="font-bold text-gray-900 dark:text-gray-100">{current} {item.unit}</span>
        </p>

        {/* Step 1: what happened */}
        <div>
          <p className="mb-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200">What happened?</p>
          <div className="grid grid-cols-3 gap-2">
            {actions.map((a) => {
              const Icon = a.icon
              const active = action === a.key
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setAction(a.key)}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-colors ${
                    active
                      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-950 dark:text-brand-300'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs font-semibold leading-tight">{a.label}</span>
                  <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500">{a.hint}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Step 2: the number */}
        <Input
          label={
            action === 'add'
              ? `How many did you add? (${item.unit})`
              : action === 'remove'
                ? `How many did you remove? (${item.unit})`
                : `Actual amount on the shelf now (${item.unit})`
          }
          type="number"
          min="0"
          step="0.001"
          inputMode="decimal"
          value={quantity}
          onChange={(e) => { setQuantity(e.target.value); setErrors((p) => ({ ...p, quantity: undefined })) }}
          placeholder="0"
          error={errors.quantity}
        />

        {/* Reason chips for removals */}
        {action === 'remove' && (
          <div>
            <p className="mb-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200">Reason</p>
            <div className="flex gap-2">
              {([
                { key: 'usage' as const, label: 'Used' },
                { key: 'wastage' as const, label: 'Wasted / spoiled' },
              ]).map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setReason(r.key)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    reason === r.key
                      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-950 dark:text-brand-300'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cost + expense for additions */}
        {action === 'add' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Cost each"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={unitCost}
                onChange={(e) => { setUnitCost(e.target.value); setErrors((p) => ({ ...p, unitCost: undefined })) }}
                placeholder="Optional"
                error={errors.unitCost}
              />
              <Input label="Bought from" value={vendor} maxLength={120} onChange={(e) => setVendor(e.target.value)} placeholder="Optional" />
            </div>
            {canLogExpense && (
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={logExpense}
                  onChange={(e) => setLogExpense(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                Also record this as an expense
                {unitCost !== '' && qtyNum !== null && (
                  <span className="text-xs text-gray-400">
                    ({formatCurrency(qtyNum * Number(unitCost || 0), currency)})
                  </span>
                )}
              </label>
            )}
            {canLogExpense && logExpense && unitCost !== '' && (
              <div>
                <p className="mb-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200">Paid with</p>
                <div className="flex gap-2">
                  {(['Cash', 'Online'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        paymentMethod === m
                          ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-950 dark:text-brand-300'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <Input label="Note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />

        {/* Live preview */}
        {projected !== null && (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-center text-xs font-medium text-gray-500 dark:bg-gray-950 dark:text-gray-400">
            New stock will be{' '}
            <span className={`font-bold ${projected < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
              {projected} {item.unit}
            </span>
            {projected < 0 && ' — that goes below zero, please check'}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" isLoading={saving} disabled={projected !== null && projected < 0}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function HistoryModal({
  isOpen,
  onClose,
  restaurantId,
  item,
  currency,
}: {
  isOpen: boolean
  onClose: () => void
  restaurantId: string
  item: InventoryItem
  currency: string
}) {
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    fetch(`/api/inventory/movements?restaurantId=${encodeURIComponent(restaurantId)}&inventoryItemId=${encodeURIComponent(item.id)}`)
      .then((res) => res.json())
      .then((data) => setMovements((data?.movements as StockMovement[]) || []))
      .catch(() => setMovements([]))
      .finally(() => setLoading(false))
  }, [isOpen, restaurantId, item.id])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`History · ${item.name}`}>
      {loading ? (
        <p className="py-6 text-center text-sm text-gray-400">Loading…</p>
      ) : movements.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">No movements recorded yet.</p>
      ) : (
        <div className="max-h-96 space-y-2 overflow-y-auto">
          {movements.map((m) => {
            const positive = Number(m.quantity_delta) >= 0
            return (
              <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-950">
                <div className="min-w-0">
                  <p className="text-sm font-semibold capitalize text-gray-900 dark:text-gray-100">{m.movement_type}</p>
                  <p className="truncate text-xs font-medium text-gray-500 dark:text-gray-400">
                    {formatDate(m.created_at)}
                    {m.note ? ` · ${m.note}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {positive ? '+' : ''}{Number(m.quantity_delta)} {item.unit}
                  </p>
                  {m.unit_cost != null && (
                    <p className="text-xs font-medium text-gray-400">{formatCurrency(Number(m.unit_cost), currency)}/{item.unit}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <InventoryContent />
    </Suspense>
  )
}
