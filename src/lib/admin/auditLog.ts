import { supabaseAdmin } from '@/lib/supabase/admin'

export type AdminAuditLogEntry = {
  adminUserId: string
  action: string
  targetType: string
  targetId: string
  before?: unknown
  after?: unknown
}

/**
 * Deliberate exception to the fire-and-forget pattern in src/utils/audit.ts.
 * Admin mutations are rare and privileged, so callers must await this and
 * propagate a failure instead of swallowing it — never call this with `void`.
 */
export async function writeAdminAuditLog(entry: AdminAuditLogEntry) {
  const { error } = await supabaseAdmin.from('admin_audit_logs').insert({
    admin_user_id: entry.adminUserId,
    action: entry.action,
    target_type: entry.targetType,
    target_id: entry.targetId,
    before: entry.before ?? null,
    after: entry.after ?? null,
  })

  if (error) {
    throw new Error(`Failed to write admin audit log: ${error.message}`)
  }
}
