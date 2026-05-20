import type { Json } from '@/types/database'

type SupabaseLike = {
  from: (table: string) => any
}

export type AuditLogEntry = {
  restaurantId: string
  actorUserId?: string | null
  action: string
  entityType: string
  entityId: string
  metadata?: Json
}

export async function writeAuditLog(supabase: SupabaseLike, entry: AuditLogEntry) {
  try {
    await supabase.from('audit_logs').insert({
      restaurant_id: entry.restaurantId,
      actor_user_id: entry.actorUserId || null,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      metadata: entry.metadata || {},
    })
  } catch {
    // Audit logging must never block restaurant operations.
  }
}
