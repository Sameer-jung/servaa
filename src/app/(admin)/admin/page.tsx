import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase/admin'

async function getStats() {
  const sevenDaysFromNow = new Date(Date.now() + 7 * 86_400_000).toISOString()

  const [
    { count: restaurantCount },
    { count: paidCount },
    { count: trialCount },
    { count: trialsNeedingAttentionCount },
    { count: orderCount },
    { data: ownerRows },
  ] = await Promise.all([
    supabaseAdmin.from('restaurants').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('restaurants').select('id', { count: 'exact', head: true }).eq('plan', 'paid'),
    supabaseAdmin.from('restaurants').select('id', { count: 'exact', head: true }).eq('plan', 'trial'),
    // Expiring within 7 days OR already expired — both need admin follow-up.
    supabaseAdmin
      .from('restaurants')
      .select('id', { count: 'exact', head: true })
      .eq('plan', 'trial')
      .not('trial_ends_at', 'is', null)
      .lte('trial_ends_at', sevenDaysFromNow),
    supabaseAdmin.from('orders').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('restaurants').select('owner_id'),
  ])

  const ownerCount = new Set((ownerRows || []).map((row) => row.owner_id)).size

  return {
    restaurantCount: restaurantCount || 0,
    ownerCount,
    paidCount: paidCount || 0,
    trialCount: trialCount || 0,
    trialsNeedingAttentionCount: trialsNeedingAttentionCount || 0,
    orderCount: orderCount || 0,
  }
}

export default async function AdminDashboardPage() {
  const stats = await getStats()

  const cards = [
    { label: 'Restaurants', value: stats.restaurantCount, href: '/admin/restaurants' },
    { label: 'Owners', value: stats.ownerCount, href: '/admin/owners' },
    { label: 'Active subscriptions', value: stats.paidCount, href: '/admin/restaurants?plan=paid' },
    { label: 'Trials', value: stats.trialCount, href: '/admin/restaurants?plan=trial' },
    {
      label: 'Trials needing attention',
      value: stats.trialsNeedingAttentionCount,
      href: '/admin/restaurants?plan=trial',
      highlight: stats.trialsNeedingAttentionCount > 0,
    },
    { label: 'Total orders', value: stats.orderCount, href: null },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Platform Dashboard</h1>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Totals across every restaurant on Servaa.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const content = (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {card.label}
              </p>
              <p
                className={`mt-2 text-3xl font-bold ${
                  card.highlight ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'
                }`}
              >
                {card.value}
              </p>
            </>
          )

          const className =
            'rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900' +
            (card.href ? ' block transition hover:border-brand-300' : '')

          return card.href ? (
            <Link key={card.label} href={card.href} className={className}>
              {content}
            </Link>
          ) : (
            <div key={card.label} className={className}>
              {content}
            </div>
          )
        })}
      </div>
    </div>
  )
}
