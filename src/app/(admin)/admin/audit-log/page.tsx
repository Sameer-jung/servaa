import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUserEmailMap } from '@/lib/admin/users'
import { AuditLogList } from '@/components/admin/AuditLogList'

export default async function AdminAuditLogPage() {
  const { data: logs } = await supabaseAdmin
    .from('admin_audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  const adminEmails = await getUserEmailMap((logs || []).map((log) => log.admin_user_id).filter(Boolean))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Admin activity</h1>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Every suspend/activate, plan/trial edit, and message handled — most recent 200.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <AuditLogList logs={logs || []} adminEmails={adminEmails} showTarget />
      </div>
    </div>
  )
}
