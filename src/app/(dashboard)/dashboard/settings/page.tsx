'use client'

import toast from "react-hot-toast";
import { MESSAGES } from "@/utils/messages";
import { useState, useEffect,useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestaurant } from '@/hooks/useRestaurant'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { readTrimmedString, validatePrice, validateRestaurantName, validateSlug } from '@/utils/validation'

const currencyOptions = ['NPR', 'USD', 'INR', 'EUR', 'GBP', 'AUD', 'CAD']

export default function SettingsPage() {
  const { restaurant, loading } = useRestaurant()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [menuUrl, setMenuUrl] = useState('')
  const [error, setError] = useState('')
  const supabase = useMemo(() => createClient(), [])
  const [loginEmail, setLoginEmail] = useState('')

  useEffect(() => {
    const slug = validateSlug(restaurant?.slug)
    if (slug) {
      const base = typeof window !== 'undefined' ? window.location.origin : ''
      setMenuUrl(`${base}/menu/${slug}`)
    }
  }, [restaurant])

  useEffect(()=> {
      const loadUserEmail = async () => {
        const { data } = await supabase.auth.getUser();
        setLoginEmail(data.user?.email || "");
      };
      loadUserEmail();
  }, [supabase])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!restaurant) return

    setSaving(true)
    setError('')
    setSaved(false)
    const form = e.currentTarget
    const name = validateRestaurantName((form.elements.namedItem('name') as HTMLInputElement).value)
    const rawTaxRate = (form.elements.namedItem('tax_rate') as HTMLInputElement).value || 0
    const parsedTaxRate = validatePrice(rawTaxRate)
    const taxRate = parsedTaxRate === null ? null : Math.min(100, parsedTaxRate)
    const currency = (form.elements.namedItem('currency') as HTMLSelectElement).value

    if (!name) {
      setError('Restaurant name must be between 2 and 100 characters.')
      toast.error("Restaurant name must be between 2 and 100 characters.");
      setSaving(false)
      return
    }

    if (taxRate === null) {
      setError('Tax rate must be a valid number.')
      toast.error('Tax rate must be a valid number.')
      setSaving(false)
      return
    }

    if (!currencyOptions.includes(currency)) {
      setError('Please choose a valid currency.')
      toast.error("Please choose a valid currency.");
      setSaving(false)
      return
    }

    const data = {
      name,
      address: readTrimmedString((form.elements.namedItem('address') as HTMLInputElement).value, 500),
      phone: readTrimmedString((form.elements.namedItem('phone') as HTMLInputElement).value, 50),
      tax_rate: taxRate,
      currency,
    }

    const { error: updateError } = await supabase.from('restaurants').update(data).eq('id', restaurant.id)
    if (updateError) {
      console.error('[SettingsPage] restaurant update error:', updateError.message)
      toast.error(MESSAGES.settings.saveFailed)
      setSaving(false)
      return
    }
    toast.success(MESSAGES.settings.saveSuccess);
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Settings
        </h1>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Manage restaurant profile, billing defaults, and customer menu access.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          {restaurant && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Restaurant
              </p>
              <h2 className="mt-2 truncate text-xl font-bold text-gray-900 dark:text-gray-100">
                {restaurant.name}
              </h2>
              <p className="mt-1 text-sm font-medium text-gray-500 dark:text-gray-400">
                Slug: {restaurant.slug}
              </p>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              Customer Menu URL
            </h3>
            <p className="mt-1 text-sm font-medium text-gray-500 dark:text-gray-400">
              Share this URL with customers.
            </p>
            <code className="mt-3 block rounded-lg bg-gray-50 p-3 text-sm text-gray-700 break-all dark:bg-gray-950 dark:text-gray-200">
              {menuUrl || "Loading..."}
            </code>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
        >
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Restaurant Details
            </h2>
            <p className="mt-1 text-sm font-medium text-gray-500 dark:text-gray-400">
              These details appear in your dashboard and customer menu.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input
                name="email"
                label="Login Email"
                type="email"
                value={loginEmail || "Loading..."}
                readOnly
                disabled
              />
            </div>
            <div className="sm:col-span-2">
              <Input
                name="name"
                label="Restaurant Name"
                defaultValue={restaurant?.name || ""}
                required
              />
            </div>

            <div className="sm:col-span-2">
              <Input
                name="address"
                label="Address"
                defaultValue={restaurant?.address || ""}
              />
            </div>

            <Input
              name="phone"
              label="Phone"
              defaultValue={restaurant?.phone || ""}
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
              <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-gray-200">
                Currency
              </label>
              <select
                name="currency"
                defaultValue={restaurant?.currency || "NPR"}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-base text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              >
                {currencyOptions.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button type="submit" isLoading={saving}>
              {saved ? "Saved!" : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
