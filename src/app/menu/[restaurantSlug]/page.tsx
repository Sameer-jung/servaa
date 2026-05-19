import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { MenuClient } from './MenuClient'

interface MenuPageProps {
  params: Promise<{ restaurantSlug: string }>
  searchParams: Promise<{ table?: string }>
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
  const { table: tableNumber } = await searchParams

  try {
    const supabase = await createClient()

    // Get restaurant
    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('*')
      .eq('slug', restaurantSlug)
      .eq('is_active', true)
      .single()

    if (!restaurant) {
      notFound()
    }

    // Get table
    let table = null
    if (tableNumber) {
      const { data: tableData } = await supabase
        .from('tables')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('table_number', tableNumber)
        .eq('is_active', true)
        .single()
      table = tableData
    }

    // Get categories and items
    const [{ data: categories }, { data: items }] = await Promise.all([
      supabase
        .from('menu_categories')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('sort_order'),
      supabase
        .from('menu_items')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('sort_order'),
    ])

    // Get active orders for this table
    let activeOrders = null
    if (table) {
      const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .eq('table_id', table.id)
        .in('status', ['pending', 'accepted', 'preparing', 'ready'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      activeOrders = orders
    }

    return (
      <MenuClient
        restaurant={restaurant}
        table={table}
        categories={categories || []}
        items={items || []}
        activeOrder={activeOrders}
      />
    )
  } catch (error) {
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
