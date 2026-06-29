import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { notFound, unstable_rethrow } from 'next/navigation'
import { hashTableAccessToken } from '@/utils/tableSession'
import { getCachedMenu } from '@/lib/menuCache'
import { MenuClient } from './MenuClient'

interface MenuPageProps {
  params: Promise<{ restaurantSlug: string }>
  searchParams: Promise<{ table?: string; t?: string }>
}

export async function generateMetadata({ params }: MenuPageProps) {
  const { restaurantSlug } = await params

  try {
    const supabase = await createClient()
    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('name')
      .eq('slug', restaurantSlug)
      .single()

    return {
      title: restaurant ? `${restaurant.name} - Menu` : 'Menu',
    }
  } catch {
    return { title: 'Menu' }
  }
}

export default async function MenuPage({ params, searchParams }: MenuPageProps) {
  const { restaurantSlug } = await params
  const { table: tableNumber, t: tableToken } = await searchParams

  try {
    const supabase = await createClient()

    // Get restaurant via the service-role client: the public RLS policy
    // (restaurants_select_public_active) only exposes is_active=true rows to
    // anon sessions, so a normal client query can never distinguish "this
    // restaurant doesn't exist" from "this restaurant is suspended" — both
    // come back empty. We need that distinction to show a "temporarily
    // unavailable" message (and keep the menu/cart from mounting) instead of
    // an indistinguishable 404.
    const { data: restaurant, error: restaurantError } = await supabaseAdmin
      .from('restaurants')
      .select('*')
      .eq('slug', restaurantSlug)
      .single()

    if (restaurantError) {
      console.error('Failed to load restaurant menu:', restaurantError)
    }

    if (!restaurant) {
      notFound()
    }

    if (!restaurant.is_active) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-bold text-gray-900">{restaurant.name}</h1>
            <p className="mt-4 text-gray-600">
              This menu is temporarily unavailable. Please check back later.
            </p>
          </div>
        </div>
      )
    }

    // Get table. Requires a valid tableToken matching the table's stored QR
    // token hash — without one, we don't resolve a table identity at all, so
    // nobody can spoof ?table=<number> without having scanned that table's
    // real QR code.
    let table = null
    if (tableNumber && tableToken) {
      const { data: tableData, error: tableError } = await supabase
        .from('tables')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('table_number', tableNumber)
        .eq('qr_token_hash', hashTableAccessToken(tableToken))
        .eq('is_active', true)
        .single()

      if (tableError) {
        console.error('Failed to load table for menu:', tableError)
      }

      table = tableData
    }

    // Get categories and items — cached briefly since this is the highest-traffic
    // page (every table scan hits it) and menu data rarely changes second-to-second.
    const { categories, items } = await getCachedMenu(restaurant.id)

    return (
      <MenuClient
        restaurant={restaurant}
        table={table}
        categories={categories || []}
        items={items || []}
        activeOrder={null}
        tableToken={tableToken}
      />
    )
  } catch (error) {
    unstable_rethrow(error)

    console.error('Failed to render menu page:', error)

    // If Supabase is not configured, show a helpful message
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-900">QR Order</h1>
          <p className="mt-4 text-gray-600">
            This restaurant menu is not available yet. Please make sure Supabase is configured correctly.
          </p>
          <div className="mt-6 rounded-lg bg-gray-100 p-4 text-left text-sm text-gray-600">
            <p className="font-medium">To set up:</p>
            <ol className="mt-2 list-decimal pl-4 space-y-1">
              <li>Create a Supabase project</li>
              <li>Copy your project URL and anon key</li>
              <li>Add them to <code className="bg-gray-200 px-1 rounded">.env.local</code></li>
              <li>Run the database schema</li>
            </ol>
          </div>
        </div>
      </div>
    )
  }
}
