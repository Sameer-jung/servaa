'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestaurant } from '@/hooks/useRestaurant'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'

const currencyOptions = ['NPR', 'USD', 'INR', 'EUR', 'GBP', 'AUD', 'CAD']

export default function SettingsPage() {
  const { restaurant, loading } = useRestaurant()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [menuUrl, setMenuUrl] = useState('')
  const supabase = createClient()

  useEffect(() => {
    if (restaurant?.slug) {
      const base = typeof window !== 'undefined' ? window.location.origin : ''
      setMenuUrl(`${base}/menu/${restaurant.slug}`)
    }
  }, [restaurant])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!restaurant) return

    setSaving(true)
    const form = e.currentTarget
    const data = {
      name: (form.elements.namedItem('name') as HTMLInputElement).value,
      address: (form.elements.namedItem('address') as HTMLInputElement).value,
      phone: (form.elements.namedItem('phone') as HTMLInputElement).value,
      tax_rate: parseFloat((form.elements.namedItem('tax_rate') as HTMLInputElement).value) || 0,
      currency: (form.elements.namedItem('currency') as HTMLSelectElement).value || 'NPR',
    }

    await supabase.from('restaurants').update(data).eq('id', restaurant.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Manage your restaurant details</p>
      </div>

      {/* Restaurant Name Card */}
      {restaurant && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Restaurant Name</p>
          <p className="text-lg font-semibold text-gray-900">{restaurant.name}</p>
          <p className="text-xs text-gray-400 mt-1">Slug: {restaurant.slug}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
        <Input
          name="name"
          label="Restaurant Name"
          defaultValue={restaurant?.name || ''}
          required
        />
        <Input
          name="address"
          label="Address"
          defaultValue={restaurant?.address || ''}
        />
        <Input
          name="phone"
          label="Phone"
          defaultValue={restaurant?.phone || ''}
        />
        <Input
          name="tax_rate"
          label="Tax Rate (%)"
          type="number"
          step="0.01"
          min="0"
          max="100"
          defaultValue={restaurant?.tax_rate || 0}
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Currency</label>
          <select
            name="currency"
            defaultValue={restaurant?.currency || 'NPR'}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            {currencyOptions.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </div>
        <div className="pt-2">
          <Button type="submit" isLoading={saving}>
            {saved ? 'Saved!' : 'Save Changes'}
          </Button>
        </div>
      </form>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="font-medium text-gray-900">Menu URL</h3>
        <p className="mt-1 text-sm text-gray-500">Share this URL with customers</p>
        <code className="mt-2 block rounded bg-white p-2 text-sm text-gray-700 break-all">
          {menuUrl || 'Loading...'}
        </code>
      </div>
    </div>
  )
}
