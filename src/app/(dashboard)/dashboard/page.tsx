import { createClient } from '@/lib/supabase/server'
import { StatCard } from '@/components/dashboard/StatCard'
import { OrderCard } from '@/components/orders/OrderCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatCurrency } from '@/utils/format'
import { isServiceRequestOrder } from '@/utils/orders'
import { redirect } from 'next/navigation'


export const metadata = {
  title: 'Dashboard - QR Order',
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Get user's restaurant via staff_members first
  const { data: staffMember } = await supabase
    .from('staff_members')
    .select('restaurant_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  let restaurantId = staffMember?.restaurant_id

  // Fallback: check if user is owner
  if (!restaurantId) {
    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('id')
      .eq('owner_id', user.id)
      .single()
    restaurantId = restaurant?.id
  }

  // If no restaurant found, show inline creation form
  if (!restaurantId) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm max-w-md w-full">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-600 mb-4">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Finish Your Setup</h2>
          <p className="mt-2 text-sm text-gray-500">
            Your account is created. Now let&apos;s set up your restaurant profile.
          </p>
          <form
            action={async (formData: FormData) => {
              'use server'
              const supabase = await createClient()
              const { data: { user } } = await supabase.auth.getUser()
              if (!user) return

              const name = formData.get('name') as string
              const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

              const { data: restaurant } = await supabase
                .from('restaurants')
                .insert({ name, slug, owner_id: user.id })
                .select()
                .single()

              if (restaurant) {
                await supabase.from('staff_members').insert({
                  restaurant_id: restaurant.id,
                  user_id: user.id,
                  role: 'owner',
                })
              }
            }}
            className="mt-6 space-y-4 text-left"
          >
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Restaurant Name</label>
              <input
                name="name"
                type="text"
                required
                placeholder="My Restaurant"
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Create Restaurant
            </button>
          </form>
        </div>
      </div>
    )
  }

  // Normal dashboard with stats
  const today = new Date().toISOString().split('T')[0]

  const { count: activeOrders } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .in('status', ['pending', 'accepted', 'preparing', 'ready'])

  const { count: activeTables } = await supabase
    .from('tables')
    .select('*', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)

  const { data: todayOrders } = await supabase
    .from('orders')
    .select('total_amount')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', today)
    .eq('status', 'completed')

  const todaySales = todayOrders?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0

  const { count: pendingOrders } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .eq('status', 'pending')

  const { data: recentOrders } = await supabase
    .from('orders')
    .select('*, table:tables(table_number), items:order_items(*, menu_item:menu_items(name, price))')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(20)

  const billableRecentOrders = ((recentOrders || []) as any[])
    .filter((order) => !isServiceRequestOrder(order))
    .slice(0, 5)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">Overview of your restaurant</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Active Orders" value={activeOrders || 0} icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>} />
        <StatCard title="Active Tables" value={activeTables || 0} icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>} />
        <StatCard title="Today Sales" value={formatCurrency(todaySales)} subtitle="Completed orders" icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard title="Pending" value={pendingOrders || 0} icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Recent Orders</h2>
        {billableRecentOrders.length > 0 ? (
          <div className="space-y-3">
            {billableRecentOrders.map((order) => (
              <OrderCard key={order.id} order={order as any} compact />
            ))}
          </div>
        ) : (
          <EmptyState title="No orders yet" description="Orders will appear here when customers start ordering." icon={<svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>} />
        )}
      </div>
    </div>
  )
}
