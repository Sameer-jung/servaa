'use client'

/* eslint-disable @next/next/no-img-element */

import toast from "react-hot-toast";
import { MESSAGES } from "@/utils/messages";
import { useState, useEffect, useCallback, Suspense } from 'react'
import { Layers, Plus, Trash2 } from 'lucide-react'
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
import { MAX_RAW_MENU_IMAGE_BYTES, deleteMenuImageIfOwned, uploadMenuImage } from '@/lib/menuImages'
import { cn } from '@/utils/cn'

type EditableModifier = {
  id: string
  name: string
  price: number
  isNew?: boolean
}

type EditableModifierGroup = {
  id: string
  name: string
  is_required: boolean
  is_multiselect: boolean
  modifiers: EditableModifier[]
  isNew?: boolean
}

function createDraftId() {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createEmptyModifierGroup(): EditableModifierGroup {
  return {
    id: createDraftId(),
    name: '',
    is_required: false,
    is_multiselect: false,
    modifiers: [{ id: createDraftId(), name: '', price: 0, isNew: true }],
    isNew: true,
  }
}

function normalizeModifierGroups(item: MenuItem | null): EditableModifierGroup[] {
  return (item?.modifier_groups || []).map((group) => ({
    id: group.id,
    name: group.name,
    is_required: group.is_required,
    is_multiselect: group.is_multiselect,
    modifiers: (group.modifiers || []).map((modifier) => ({
      id: modifier.id,
      name: modifier.name,
      price: validatePrice(modifier.price) || 0,
    })),
  }))
}

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
  const [modifierGroups, setModifierGroups] = useState<EditableModifierGroup[]>([])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [itemImageUrl, setItemImageUrl] = useState('')
  const [originalImageUrl, setOriginalImageUrl] = useState('')
  const [imageUrlMode, setImageUrlMode] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
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
      supabase.from('menu_items').select('*, category:menu_categories(name), modifier_groups(*, modifiers(*))').eq('restaurant_id', restaurant.id).order('sort_order'),
    ])

    setCategories(cats || [])
    setItems(menuItems || [])
    setLoading(false)
  }, [restaurant, supabase])

  // Fire-and-forget: clears the short-lived public menu cache so customer
  // tables see edits without waiting for it to expire on its own.
  const notifyMenuChanged = useCallback(() => {
    if (!restaurant) return
    fetch('/api/menu/revalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId: restaurant.id }),
    }).catch(() => {})
  }, [restaurant])

  const openNewItemModal = () => {
    setEditingItem(null)
    setModifierGroups([])
    setItemImageUrl('')
    setOriginalImageUrl('')
    setImageUrlMode(false)
    setShowItemModal(true)
  }

  const openEditItemModal = (item: MenuItem) => {
    setEditingItem(item)
    setModifierGroups(normalizeModifierGroups(item))
    setItemImageUrl(item.image_url || '')
    setOriginalImageUrl(item.image_url || '')
    setImageUrlMode(false)
    setShowItemModal(true)
  }

  // Resets modal state without touching storage — used after a successful
  // save, where the current itemImageUrl is now the live, saved image.
  const resetItemModalState = () => {
    setShowItemModal(false)
    setEditingItem(null)
    setModifierGroups([])
    setItemImageUrl('')
    setOriginalImageUrl('')
    setImageUrlMode(false)
  }

  // Used for cancel (X button / backdrop click): if the admin uploaded or
  // pasted a new photo but never saved, delete the now-unreferenced upload
  // so it doesn't sit in storage forever.
  const closeItemModal = () => {
    if (itemImageUrl && itemImageUrl !== originalImageUrl) {
      void deleteMenuImageIfOwned(supabase, itemImageUrl)
    }
    resetItemModalState()
  }

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !restaurant) return

    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file.')
      return
    }

    if (file.size > MAX_RAW_MENU_IMAGE_BYTES) {
      toast.error('Image is too large (max 15MB).')
      return
    }

    setImageUploading(true)
    try {
      const newUrl = await uploadMenuImage(supabase, restaurant.id, file)
      // The image being replaced was uploaded this session and never saved
      // anywhere, so it's safe to delete outright rather than leaving it orphaned.
      if (itemImageUrl && itemImageUrl !== originalImageUrl) {
        void deleteMenuImageIfOwned(supabase, itemImageUrl)
      }
      setItemImageUrl(newUrl)
    } catch (uploadError) {
      console.error('[MenuPage] image upload error:', uploadError)
      toast.error(uploadError instanceof Error ? uploadError.message : 'Image upload failed. Please try again.')
    } finally {
      setImageUploading(false)
    }
  }

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
      toast.error("Category name is required.");
      return
    }

    if (editingCategory) {
      const { error: categoryError } = await supabase.from('menu_categories').update({ name }).eq('id', editingCategory.id)
      if (categoryError) {
        console.error('[MenuPage] category update error:', categoryError.message)
        toast.error(MESSAGES.menu.saveFailed);
        return
      }
      toast.success(MESSAGES.menu.categoryUpdateSuccess);
    } else {
      const { error: categoryError } = await supabase.from('menu_categories').insert({
        restaurant_id: restaurant.id,
        name,
        sort_order: categories.length,
      })
      if (categoryError) {
        console.error('[MenuPage] category insert error:', categoryError.message)
        toast.error(MESSAGES.menu.saveFailed);
        return
      }
      toast.success(MESSAGES.menu.categoryCreateSuccess);
    }
    setShowCategoryModal(false)
    setEditingCategory(null)
    notifyMenuChanged()
    fetchData()
  }

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Delete this category? Items will become uncategorized.')) return
    setError('')
    const { error: categoryError } = await supabase.from('menu_categories').delete().eq('id', id)
    if (categoryError) {
      console.error('[MenuPage] category delete error:', categoryError.message)
      toast.error(MESSAGES.menu.saveFailed);
      return
    }
    toast.success(MESSAGES.menu.categoryDeleteSuccess);
    notifyMenuChanged()
    fetchData()
  }

  const saveModifierGroups = async (menuItemId: string) => {
    if (!restaurant) return true

    const cleanedGroups = modifierGroups.map((group, groupIndex) => ({
      ...group,
      name: group.name.trim(),
      sort_order: groupIndex,
      modifiers: group.modifiers.map((modifier, modifierIndex) => ({
        ...modifier,
        name: modifier.name.trim(),
        price: validatePrice(modifier.price) || 0,
        sort_order: modifierIndex,
      })).filter((modifier) => modifier.name),
    })).filter((group) => group.name)

    const existingGroupIds = (editingItem?.modifier_groups || []).map((group) => group.id)
    const nextExistingGroupIds = cleanedGroups
      .filter((group) => !group.isNew && isUuid(group.id))
      .map((group) => group.id)
    const deletedGroupIds = existingGroupIds.filter((groupId) => !nextExistingGroupIds.includes(groupId))

    if (deletedGroupIds.length > 0) {
      const { error } = await supabase
        .from('modifier_groups')
        .delete()
        .eq('restaurant_id', restaurant.id)
        .in('id', deletedGroupIds)

      if (error) {
        console.error('[MenuPage] modifier group delete error:', error.message)
        toast.error(MESSAGES.menu.saveFailed)
        return false
      }
    }

    for (const group of cleanedGroups) {
      let groupId = group.id

      if (group.isNew || !isUuid(group.id)) {
        const { data, error } = await supabase
          .from('modifier_groups')
          .insert({
            restaurant_id: restaurant.id,
            menu_item_id: menuItemId,
            name: group.name,
            is_required: group.is_required,
            is_multiselect: group.is_multiselect,
            sort_order: group.sort_order,
          })
          .select('id')
          .maybeSingle()

        if (error || !data) {
          if (error) console.error('[MenuPage] modifier group insert error:', error.message)
          toast.error(MESSAGES.menu.saveFailed)
          return false
        }

        groupId = data.id
      } else {
        const { error } = await supabase
          .from('modifier_groups')
          .update({
            name: group.name,
            is_required: group.is_required,
            is_multiselect: group.is_multiselect,
            sort_order: group.sort_order,
          })
          .eq('restaurant_id', restaurant.id)
          .eq('id', group.id)

        if (error) {
          console.error('[MenuPage] modifier group update error:', error.message)
          toast.error(MESSAGES.menu.saveFailed)
          return false
        }
      }

      const originalGroup = editingItem?.modifier_groups?.find((candidate) => candidate.id === group.id)
      const existingModifierIds = (originalGroup?.modifiers || []).map((modifier) => modifier.id)
      const nextExistingModifierIds = group.modifiers
        .filter((modifier) => !modifier.isNew && isUuid(modifier.id))
        .map((modifier) => modifier.id)
      const deletedModifierIds = existingModifierIds.filter((modifierId) => !nextExistingModifierIds.includes(modifierId))

      if (deletedModifierIds.length > 0) {
        const { error } = await supabase
          .from('modifiers')
          .delete()
          .eq('restaurant_id', restaurant.id)
          .in('id', deletedModifierIds)

        if (error) {
          console.error('[MenuPage] modifier delete error:', error.message)
          toast.error(MESSAGES.menu.saveFailed)
          return false
        }
      }

      for (const modifier of group.modifiers) {
        if (modifier.isNew || !isUuid(modifier.id)) {
          const { error } = await supabase
            .from('modifiers')
            .insert({
              restaurant_id: restaurant.id,
              group_id: groupId,
              name: modifier.name,
              price: modifier.price,
              sort_order: modifier.sort_order,
            })

          if (error) {
            console.error('[MenuPage] modifier insert error:', error.message)
            toast.error(MESSAGES.menu.saveFailed)
            return false
          }
        } else {
          const { error } = await supabase
            .from('modifiers')
            .update({
              name: modifier.name,
              price: modifier.price,
              sort_order: modifier.sort_order,
            })
            .eq('restaurant_id', restaurant.id)
            .eq('id', modifier.id)

          if (error) {
            console.error('[MenuPage] modifier update error:', error.message)
            toast.error(MESSAGES.menu.saveFailed)
            return false
          }
        }
      }
    }

    return true
  }

  const handleSaveItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    if (!restaurant) return

    const form = e.currentTarget
    const name = readTrimmedString((form.elements.namedItem('name') as HTMLInputElement).value, 100)
    const description = readTrimmedString((form.elements.namedItem('description') as HTMLInputElement).value, 500)
    const rawImageUrl = itemImageUrl
    const imageUrl = rawImageUrl.trim() ? readOptionalUrl(rawImageUrl) : null
    const price = validatePrice((form.elements.namedItem('price') as HTMLInputElement).value)
    const categoryIdValue = (form.elements.namedItem('category_id') as HTMLSelectElement).value
    const categoryId = categoryIdValue && isUuid(categoryIdValue) && categories.some((category) => category.id === categoryIdValue)
      ? categoryIdValue
      : null

    if (!name) {
      toast.error('Item name is required.')
      return
    }

    if (rawImageUrl.trim() && !imageUrl) {
      toast.error('Image URL must start with http:// or https://.')
      return
    }

    if (price === null) {
      toast.error('Price must be a valid amount.')
      return
    }

    if (categoryIdValue && !categoryId) {
      toast.error('Please choose a valid category.')
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
        toast.error(MESSAGES.menu.saveFailed);
        return
      }

      // image_url is already committed above, so clean up the old file now —
      // independent of whether the modifier-group save below succeeds.
      if (originalImageUrl && originalImageUrl !== imageUrl) {
        void deleteMenuImageIfOwned(supabase, originalImageUrl)
      }

      const modifiersSaved = await saveModifierGroups(editingItem.id)
      if (!modifiersSaved) return

      void writeAuditLog(supabase, {
        restaurantId: restaurant.id,
        action: 'menu_item.updated',
        entityType: 'menu_item',
        entityId: editingItem.id,
        metadata: { name: data.name },
      })
      toast.success(MESSAGES.menu.itemUpdateSuccess);
    } else {
      const { data: newItem, error } = await supabase.from('menu_items').insert({
        ...data,
        restaurant_id: restaurant.id,
        sort_order: items.length,
      }).select('id').maybeSingle()

      if (error || !newItem) {
        if (error) console.error('[MenuPage] menu item insert error:', error.message)
        toast.error(MESSAGES.menu.saveFailed);
        return
      }

      const modifiersSaved = await saveModifierGroups(newItem.id)
      if (!modifiersSaved) return

      void writeAuditLog(supabase, {
        restaurantId: restaurant.id,
        action: 'menu_item.created',
        entityType: 'menu_item',
        entityId: newItem.id,
        metadata: { name: data.name },
      })
      toast.success(MESSAGES.menu.itemCreateSuccess);
    }

    resetItemModalState()
    notifyMenuChanged()
    fetchData()
  }

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Delete this item?')) return
    setError('')
    const deletedItem = items.find((item) => item.id === id)
    const { error } = await supabase.from('menu_items').delete().eq('id', id)
    if (error) {
      console.error('[MenuPage] menu item delete error:', error.message)
      toast.error(MESSAGES.menu.saveFailed);
      return
    }

    if (deletedItem?.image_url) {
      void deleteMenuImageIfOwned(supabase, deletedItem.image_url)
    }

    if (restaurant) {
      void writeAuditLog(supabase, {
        restaurantId: restaurant.id,
        action: 'menu_item.deleted',
        entityType: 'menu_item',
        entityId: id,
      })
    }
    toast.success(MESSAGES.menu.itemDeleteSuccess);
    notifyMenuChanged()
    fetchData()
  }

  const handleToggleAvailability = async (item: MenuItem) => {
    setError('')
    const { error: availabilityError } = await supabase.from('menu_items').update({ available: !item.available }).eq('id', item.id)
    if (availabilityError) {
      console.error('[MenuPage] menu item availability error:', availabilityError.message)
      toast.error(MESSAGES.menu.saveFailed);
      return
    }
    toast.success(MESSAGES.menu.availabilityUpdated);
    notifyMenuChanged()
    fetchData()
  }

  const updateModifierGroup = (groupId: string, updates: Partial<EditableModifierGroup>) => {
    setModifierGroups((current) =>
      current.map((group) => group.id === groupId ? { ...group, ...updates } : group)
    )
  }

  const addModifierOption = (groupId: string) => {
    setModifierGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? {
              ...group,
              modifiers: [...group.modifiers, { id: createDraftId(), name: '', price: 0, isNew: true }],
            }
          : group
      )
    )
  }

  const updateModifierOption = (
    groupId: string,
    modifierId: string,
    updates: Partial<EditableModifier>
  ) => {
    setModifierGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? {
              ...group,
              modifiers: group.modifiers.map((modifier) =>
                modifier.id === modifierId ? { ...modifier, ...updates } : modifier
              ),
            }
          : group
      )
    )
  }

  const removeModifierOption = (groupId: string, modifierId: string) => {
    setModifierGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? { ...group, modifiers: group.modifiers.filter((modifier) => modifier.id !== modifierId) }
          : group
      )
    )
  }

  const filteredItems = activeCategory
    ? items.filter((item) => item.category_id === activeCategory)
    : items

  if (restaurantLoading || loading) {
    return <PageLoading />
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-16 z-30 space-y-4 border-b border-gray-200 bg-gray-50 pb-4 pt-1 dark:border-gray-800 dark:bg-gray-950 lg:top-0">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Menu</h1>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Manage your menu items and categories</p>
          </div>
          <div className="flex flex-shrink-0 gap-2">
            <Button size="sm" variant="outline" disabled={!restaurant} onClick={() => setShowCategoryModal(true)}>
              + Category
            </Button>
            <Button size="sm" disabled={!restaurant} onClick={openNewItemModal}>
              + Item
            </Button>
          </div>
        </div>

        {/* Categories */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory(null)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              activeCategory === null ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center gap-1">
              <button
                onClick={() => setActiveCategory(cat.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  activeCategory === cat.id ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                }`}
              >
                {cat.name}
              </button>
              <button
                onClick={() => { setEditingCategory(cat); setShowCategoryModal(true) }}
                className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
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
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Items */}
      {filteredItems.length > 0 ? (
        <div className="space-y-2">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={`flex items-center justify-between rounded-lg border p-3 ${
                item.available ? 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900' : 'border-gray-100 bg-gray-50 opacity-60 dark:border-gray-800 dark:bg-gray-950'
              }`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-gray-300 dark:text-gray-500">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-gray-900 dark:text-gray-100">{item.name}</span>
                    {!item.available && (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                        Unavailable
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{formatCurrency(item.price, restaurant?.currency)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleAvailability(item)}
                  className={`rounded-lg px-2 py-1 text-xs font-medium ${
                    item.available ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                  }`}
                >
                  {item.available ? 'Available' : 'Unavailable'}
                </button>
                <button
                  onClick={() => openEditItemModal(item)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
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
        onClose={closeItemModal}
        title={editingItem ? 'Edit Item' : 'New Item'}
      >
        <form onSubmit={handleSaveItem} className="flex max-h-[70vh] flex-col overflow-y-auto space-y-4">
          <Input name="name" label="Item Name" defaultValue={editingItem?.name || ''} required />
          <Input name="description" label="Description" defaultValue={editingItem?.description || ''} />
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-gray-200">Photo</label>
            <div className="flex items-center gap-3">
              <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                {itemImageUrl ? (
                  <img src={itemImageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-300 dark:text-gray-500">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                {imageUrlMode ? (
                  <Input
                    type="url"
                    placeholder="https://example.com/item.jpg"
                    value={itemImageUrl}
                    onChange={(event) => setItemImageUrl(event.target.value)}
                  />
                ) : (
                  <label className="inline-flex cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
                    {imageUploading ? 'Uploading…' : 'Upload Photo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={imageUploading}
                      onChange={handleImageFileChange}
                    />
                  </label>
                )}
                <button
                  type="button"
                  disabled={imageUploading}
                  className="block text-xs font-medium text-brand-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => setImageUrlMode((current) => !current)}
                >
                  {imageUrlMode ? 'Upload a photo instead' : 'Paste an image URL instead'}
                </button>
              </div>
            </div>
          </div>
          <Input name="price" label="Price" type="number" step="0.01" min="0" defaultValue={editingItem?.price || ''} required />
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-gray-200">Category</label>
            <select name="category_id" defaultValue={editingItem?.category_id || ''} className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-base text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
              <option value="">No Category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="available" defaultChecked={editingItem ? editingItem.available : true} className="h-4 w-4 rounded border-gray-300 text-brand-600" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Available</span>
          </label>

          <div className="space-y-3 border-t border-gray-100 pt-4 dark:border-gray-800">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10">
                  <Layers className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Customize Options</h3>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    For things customers pick before ordering — e.g. a &ldquo;Size&rdquo; group with &ldquo;Small / Medium / Large&rdquo; choices. Most items don&apos;t need this.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-shrink-0 gap-1.5"
                onClick={() => setModifierGroups((current) => [...current, createEmptyModifierGroup()])}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Group
              </Button>
            </div>

            {modifierGroups.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-4 text-sm font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400">
                No customize options yet — this item will be added to cart as-is. Click &ldquo;Add Group&rdquo; if customers should pick a size, flavor, or extra first.
              </div>
            ) : (
              <div className="space-y-3">
                {modifierGroups.map((group, groupIndex) => (
                  <div key={group.id} className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                        Group {groupIndex + 1}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                        onClick={() => setModifierGroups((current) => current.filter((candidate) => candidate.id !== group.id))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove group
                      </Button>
                    </div>

                    <Input
                      label="What is this choice called?"
                      value={group.name}
                      placeholder="e.g. Size, Toppings, Spice Level"
                      onChange={(event) => updateModifierGroup(group.id, { name: event.target.value })}
                    />

                    <div className="grid gap-2 sm:grid-cols-2">
                      <label
                        className={cn(
                          'flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors',
                          group.is_required
                            ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
                            : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={group.is_required}
                          onChange={(event) => updateModifierGroup(group.id, { is_required: event.target.checked })}
                          className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-brand-600"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">Customer must choose</span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400">They can&apos;t add this item without picking one first.</span>
                        </span>
                      </label>
                      <label
                        className={cn(
                          'flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors',
                          group.is_multiselect
                            ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
                            : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={group.is_multiselect}
                          onChange={(event) => updateModifierGroup(group.id, { is_multiselect: event.target.checked })}
                          className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-brand-600"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">Allow more than one</span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400">E.g. picking several toppings instead of just one.</span>
                        </span>
                      </label>
                    </div>

                    <div className="space-y-2 border-t border-gray-200 pt-3 dark:border-gray-800">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Choices customers will see</p>
                        <Button type="button" size="sm" variant="secondary" className="gap-1.5" onClick={() => addModifierOption(group.id)}>
                          <Plus className="h-3.5 w-3.5" />
                          Add Choice
                        </Button>
                      </div>

                      {group.modifiers.length === 0 ? (
                        <p className="rounded-lg bg-white p-3 text-sm font-medium text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                          Add at least one choice, e.g. &ldquo;Small&rdquo;, &ldquo;Medium&rdquo;, &ldquo;Large&rdquo;.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {group.modifiers.map((modifier) => (
                            <div key={modifier.id} className="grid items-end gap-2 rounded-lg bg-white p-2.5 dark:bg-gray-900 sm:grid-cols-[minmax(0,1fr)_7rem_auto]">
                              <Input
                                label="Name"
                                value={modifier.name}
                                placeholder="e.g. Large"
                                onChange={(event) => updateModifierOption(group.id, modifier.id, { name: event.target.value })}
                              />
                              <Input
                                label="Extra cost"
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0"
                                value={modifier.price}
                                onChange={(event) => updateModifierOption(group.id, modifier.id, { price: validatePrice(event.target.value) || 0 })}
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="self-end text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                                aria-label="Remove choice"
                                onClick={() => removeModifierOption(group.id, modifier.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={imageUploading}>
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
