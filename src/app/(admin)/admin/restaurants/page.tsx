import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUserEmailMap } from '@/lib/admin/users'
import { PlanBadge } from '@/components/admin/PlanBadge'
import { ClientDate } from '@/components/admin/ClientDate'
import { cn } from '@/utils/cn'

interface PageProps {
  searchParams: Promise<{ q?: string; status?: string; plan?: string }>
}

export default async function AdminRestaurantsPage({ searchParams }: PageProps) {
  const { q = '', status = 'all', plan = 'all' } = await searchParams

  // Strip characters that would otherwise break PostgREST's .or() filter
  // syntax (commas/parens are filter delimiters, not search input).
  const cleanQuery = q.replace(/[,()]/g, '').trim().slice(0, 100)

  let query = supabaseAdmin
    .from('restaurants')
    .select('id, name, slug, owner_id, is_active, plan, trial_ends_at, created_at')
    .order('created_at', { ascending: false })

  if (cleanQuery) {
    query = query.or(`name.ilike.%${cleanQuery}%,slug.ilike.%${cleanQuery}%`)
  }
  if (status === 'active') query = query.eq('is_active', true)
  if (status === 'suspended') query = query.eq('is_active', false)
  if (plan === 'trial' || plan === 'paid') query = query.eq('plan', plan)

  const { data: restaurants } = await query
  const ownerEmails = await getUserEmailMap((restaurants || []).map((r) => r.owner_id))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Restaurants</h1>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {restaurants?.length || 0} restaurant{restaurants?.length === 1 ? '' : 's'}
        </p>
      </div>

      <form className="flex flex-wrap gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name or slug"
          className="min-w-[200px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
        />
        <select
          name="status"
          defaultValue={status}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <select
          name="plan"
          defaultValue={plan}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
        >
          <option value="all">All plans</option>
          <option value="trial">Trial</option>
          <option value="paid">Paid</option>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Filter
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-xs uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {(restaurants || []).map((restaurant) => (
              <tr key={restaurant.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/restaurants/${restaurant.id}`}
                    className="font-semibold text-brand-600 hover:underline"
                  >
                    {restaurant.name}
                  </Link>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{restaurant.slug}</p>
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                  {ownerEmails.get(restaurant.owner_id) || '—'}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-semibold',
                      restaurant.is_active
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                    )}
                  >
                    {restaurant.is_active ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <PlanBadge plan={restaurant.plan} trialEndsAt={restaurant.trial_ends_at} />
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                  <ClientDate value={restaurant.created_at} />
                </td>
              </tr>
            ))}

            {(restaurants || []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  No restaurants match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
