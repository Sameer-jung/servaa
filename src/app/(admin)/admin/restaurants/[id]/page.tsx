import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUserEmailMap } from '@/lib/admin/users'
import { SuspendToggleButton } from '@/components/admin/SuspendToggleButton'
import { PlanEditForm } from '@/components/admin/PlanEditForm'
import { PlanBadge } from '@/components/admin/PlanBadge'
import { AuditLogList } from '@/components/admin/AuditLogList'
import { ClientDate } from '@/components/admin/ClientDate'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AdminRestaurantDetailPage({ params }: PageProps) {
  const { id } = await params

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!restaurant) {
    notFound()
  }

  const { count: orderCount } = await supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', id)

  const { data: auditLogs } = await supabaseAdmin
    .from('admin_audit_logs')
    .select('*')
    .eq('target_type', 'restaurant')
    .eq('target_id', id)
    .order('created_at', { ascending: false })
    .limit(10)

  // One combined lookup instead of two separate listUsers() round trips.
  const emails = await getUserEmailMap([
    restaurant.owner_id,
    ...(auditLogs || []).map((log) => log.admin_user_id).filter(Boolean),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{restaurant.name}</h1>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{restaurant.slug}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Overview</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Owner</dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100">
                {emails.get(restaurant.owner_id) || '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Status</dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100">
                {restaurant.is_active ? 'Active' : 'Suspended'}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Plan</dt>
              <dd>
                <PlanBadge plan={restaurant.plan} trialEndsAt={restaurant.trial_ends_at} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Phone</dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100">{restaurant.phone || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Address</dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100">{restaurant.address || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Total orders</dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100">{orderCount || 0}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Created</dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100">
                <ClientDate value={restaurant.created_at} />
              </dd>
            </div>
          </dl>

          <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
            <SuspendToggleButton restaurantId={restaurant.id} isActive={restaurant.is_active} />
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Plan &amp; trial</h2>
            <PlanBadge plan={restaurant.plan} trialEndsAt={restaurant.trial_ends_at} />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Plain metadata only — editing this has no billing effect and does not enforce anything.
            {restaurant.plan === 'trial' && restaurant.trial_ends_at && (
              <> Trial ends on <ClientDate value={restaurant.trial_ends_at} />.</>
            )}
          </p>
          <PlanEditForm
            restaurantId={restaurant.id}
            plan={restaurant.plan}
            trialEndsAt={restaurant.trial_ends_at}
          />
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Recent admin activity</h2>
        <AuditLogList logs={auditLogs || []} adminEmails={emails} />
      </div>
    </div>
  )
}
