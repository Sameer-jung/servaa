import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUserEmailMap } from '@/lib/admin/users'
import { cn } from '@/utils/cn'

export default async function AdminOwnersPage() {
  const { data: restaurants } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, owner_id, is_active, created_at')
    .order('created_at', { ascending: false })

  const ownerEmails = await getUserEmailMap((restaurants || []).map((r) => r.owner_id))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Owners</h1>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Read-only — owner accounts and the restaurant each one is linked to.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-xs uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Restaurant</th>
              <th className="px-4 py-3">Account status</th>
            </tr>
          </thead>
          <tbody>
            {(restaurants || []).map((restaurant) => (
              <tr key={restaurant.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                  {ownerEmails.get(restaurant.owner_id) || '—'}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/restaurants/${restaurant.id}`} className="text-brand-600 hover:underline">
                    {restaurant.name}
                  </Link>
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
              </tr>
            ))}

            {(restaurants || []).length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  No owners yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
