import { createClient } from '@/lib/supabase/server'
import { DashboardOverview } from '@/components/dashboard/DashboardOverview'
import { redirect } from 'next/navigation'
import { writeAuditLog } from '@/utils/audit'
import { generateSlug } from '@/utils/format'


export const metadata = {
  title: 'Dashboard - Servaa',
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
              const slug = generateSlug(name)

              const { data: restaurant } = await supabase
                .from('restaurants')
                .insert({ name, slug, owner_id: user.id })
                .select()
                .single()

              if (restaurant) {
                const { error: staffError } = await supabase.from('staff_members').insert({
                  restaurant_id: restaurant.id,
                  user_id: user.id,
                  role: 'owner',
                })

                if (!staffError) {
                  void writeAuditLog(supabase, {
                    restaurantId: restaurant.id,
                    actorUserId: user.id,
                    action: 'staff.added',
                    entityType: 'staff_member',
                    entityId: user.id,
                    metadata: { role: 'owner' },
                  })
                }
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

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('currency')
    .eq('id', restaurantId)
    .maybeSingle()

  return <DashboardOverview restaurantId={restaurantId} currency={restaurant?.currency || 'NPR'} />
}
