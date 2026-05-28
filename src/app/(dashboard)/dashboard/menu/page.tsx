'use client'

/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useCallback, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestaurant } from '@/hooks/useRestaurant'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoading } from '@/components/dashboard/PageLoading'
import { MenuCategory, MenuItem } from '@/types'
import { formatCurrency } from '@/utils/format'
import { writeAuditLog } from '@/utils/audit'
import { isUuid, readTrimmedString, validatePrice } from '@/utils/validation'

function readOptionalUrl(value: unknown) {
  const trimmed = readTrimmedString(value, 2048)
  if (!trimmed) return null

  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:' ? trimmed : null
  } catch {
    return null
  }
}

function MenuContent() {
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [showItemModal, setShowItemModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null)
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [error, setError] = useState('')
  const { restaurant, loading: restaurantLoading } = useRestaurant()
  const supabase = createClient()

  const fetchData = useCallback(async () => {
    if (!restaurant) {
      setCategories([])
      setItems([])
      setLoading(false)
      return
    }

    setLoading(true)
    const [{ data: cats }, { data: menuItems }] = await Promise.all([
      supabase.from('menu_categories').select('*').eq('restaurant_id', restaurant.id).order('sort_order'),
      supabase.from('menu_items').select('*, category:menu_categories(name)').eq('restaurant_id', restaurant.id).order('sort_order'),
    ])

    setCategories(cats || [])
    setItems(menuItems || [])
    setLoading(false)
  }, [restaurant, supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSaveCategory = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    if (!restaurant) return

    const form = e.currentTarget
    const name = readTrimmedString((form.elements.namedItem('name') as HTMLInputElement).value, 100)

    if (!name) {
      setError('Category name is required.')
      return
    }

    if (editingCategory) {
      const { error: categoryError } = await supabase.from('menu_categories').update({ name }).eq('id', editingCategory.id)
      if (categoryError) {
        console.error('[MenuPage] category update error:', categoryError.message)
        setError('Could not save category.')
        return
      }
    } else {
      const { error: categoryError } = await supabase.from('menu_categories').insert({
        restaurant_id: restaurant.id,
        name,
        sort_order: categories.length,
      })
      if (categoryError) {
        console.error('[MenuPage] category insert error:', categoryError.message)
        setError('Could not save category.')
        return
      }
    }

    setShowCategoryModal(false)
    setEditingCategory(null)
    fetchData()
  }

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Delete this category? Items will become uncategorized.')) return
    setError('')
    const { error: categoryError } = await supabase.from('menu_categories').delete().eq('id', id)
    if (categoryError) {
      console.error('[MenuPage] category delete error:', categoryError.message)
      setError('Could not delete category.')
      return
    }
    fetchData()
  }

  const handleSaveItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    if (!restaurant) return

    const form = e.currentTarget
    const name = readTrimmedString((form.elements.namedItem('name') as HTMLInputElement).value, 100)
    const description = readTrimmedString((form.elements.namedItem('description') as HTMLInputElement).value, 500)
    const rawImageUrl = (form.elements.namedItem('image_url') as HTMLInputElement).value
    const imageUrl = rawImageUrl.trim() ? readOptionalUrl(rawImageUrl) : null
    const price = validatePrice((form.elements.namedItem('price') as HTMLInputElement).value)
    const categoryIdValue = (form.elements.namedItem('category_id') as HTMLSelectElement).value
    const categoryId = categoryIdValue && isUuid(categoryIdValue) && categories.some((category) => category.id === categoryIdValue)
      ? categoryIdValue
      : null

    if (!name) {
      setError('Item name is required.')
      return
    }

    if (rawImageUrl.trim() && !imageUrl) {
      setError('Image URL must start with http:// or https://.')
      return
    }

    if (price === null) {
      setError('Price must be a valid amount.')
      return
    }

    if (categoryIdValue && !categoryId) {
      setError('Please choose a valid category.')
      return
    }

    const data = {
      name,
      description,
      image_url: imageUrl,
      price,
      category_id: categoryId,
      available: (form.elements.namedItem('available') as HTMLInputElement).checked,
    }

    if (editingItem) {
      const { error } = await supabase.from('menu_items').update(data).eq('id', editingItem.id)
      if (error) {
        console.error('[MenuPage] menu item update error:', error.message)
        setError('Could not save menu item.')
        return
      }

      void writeAuditLog(supabase, {
        restaurantId: restaurant.id,
        action: 'menu_item.updated',
        entityType: 'menu_item',
        entityId: editingItem.id,
        metadata: { name: data.name },
      })
    } else {
      const { data: newItem, error } = await supabase.from('menu_items').insert({
        ...data,
        restaurant_id: restaurant.id,
        sort_order: items.length,
      }).select('id').maybeSingle()

      if (error || !newItem) {
        if (error) console.error('[MenuPage] menu item insert error:', error.message)
        setError('Could not save menu item.')
        return
      }

      void writeAuditLog(supabase, {
        restaurantId: restaurant.id,
        action: 'menu_item.created',
        entityType: 'menu_item',
        entityId: newItem.id,
        metadata: { name: data.name },
      })
    }

    setShowItemModal(false)
    setEditingItem(null)
    fetchData()
  }

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Delete this item?')) return
    setError('')
    const { error } = await supabase.from('menu_items').delete().eq('id', id)
    if (error) {
      console.error('[MenuPage] menu item delete error:', error.message)
      setError('Could not delete menu item.')
      return
    }

    if (restaurant) {
      void writeAuditLog(supabase, {
        restaurantId: restaurant.id,
        action: 'menu_item.deleted',
        entityType: 'menu_item',
        entityId: id,
      })
    }
    fetchData()
  }

  const handleToggleAvailability = async (item: MenuItem) => {
    setError('')
    const { error: availabilityError } = await supabase.from('menu_items').update({ available: !item.available }).eq('id', item.id)
    if (availabilityError) {
      console.error('[MenuPage] menu item availability error:', availabilityError.message)
      setError('Could not update menu item.')
      return
    }
    fetchData()
  }

  const filteredItems = activeCategory
    ? items.filter((item) => item.category_id === activeCategory)
    : items

  if (restaurantLoading || loading) {
    return <PageLoading />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Menu</h1>
          <p className="text-sm text-gray-500">Manage your menu items and categories</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!restaurant} onClick={() => setShowCategoryModal(true)}>
            + Category
          </Button>
          <Button size="sm" disabled={!restaurant} onClick={() => setShowItemModal(true)}>
            + Item
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Categories */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory(null)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
            activeCategory === null ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <div key={cat.id} className="flex items-center gap-1">
            <button
              onClick={() => setActiveCategory(cat.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                activeCategory === cat.id ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {cat.name}
            </button>
            <button
              onClick={() => { setEditingCategory(cat); setShowCategoryModal(true) }}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            <button
              onClick={() => handleDeleteCategory(cat.id)}
              className="text-gray-400 hover:text-red-600"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Items */}
      {filteredItems.length > 0 ? (
        <div className="space-y-2">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={`flex items-center justify-between rounded-lg border p-3 ${
                item.available ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
              }`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-gray-300">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-gray-900">{item.name}</span>
                    {!item.available && (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-500">
                        Unavailable
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{formatCurrency(item.price, restaurant?.currency)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleAvailability(item)}
                  className={`rounded-lg px-2 py-1 text-xs font-medium ${
                    item.available ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {item.available ? 'Available' : 'Unavailable'}
                </button>
                <button
                  onClick={() => { setEditingItem(item); setShowItemModal(true) }}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDeleteItem(item.id)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No menu items"
          description="Add your first menu item to get started."
          icon={
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          }
        />
      )}

      {/* Category Modal */}
      <Modal
        isOpen={showCategoryModal}
        onClose={() => { setShowCategoryModal(false); setEditingCategory(null) }}
        title={editingCategory ? 'Edit Category' : 'New Category'}
      >
        <form onSubmit={handleSaveCategory} className="space-y-4">
          <Input
            name="name"
            label="Category Name"
            defaultValue={editingCategory?.name || ''}
            required
          />
          <Button type="submit" className="w-full">
            {editingCategory ? 'Update' : 'Create'}
          </Button>
        </form>
      </Modal>

      {/* Item Modal */}
      <Modal
        isOpen={showItemModal}
        onClose={() => { setShowItemModal(false); setEditingItem(null) }}
        title={editingItem ? 'Edit Item' : 'New Item'}
      >
        <form onSubmit={handleSaveItem} className="space-y-4">
          <Input name="name" label="Item Name" defaultValue={editingItem?.name || ''} required />
          <Input name="description" label="Description" defaultValue={editingItem?.description || ''} />
          <Input name="image_url" label="Image URL" type="url" placeholder="https://example.com/item.jpg" defaultValue={editingItem?.image_url || ''} />
          <Input name="price" label="Price" type="number" step="0.01" min="0" defaultValue={editingItem?.price || ''} required />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Category</label>
            <select name="category_id" defaultValue={editingItem?.category_id || ''} className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-base">
              <option value="">No Category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="available" defaultChecked={editingItem ? editingItem.available : true} className="h-4 w-4 rounded border-gray-300 text-brand-600" />
            <span className="text-sm text-gray-700">Available</span>
          </label>
          <Button type="submit" className="w-full">
            {editingItem ? 'Update' : 'Create'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}

export default function MenuPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <MenuContent />
    </Suspense>
  )
}
