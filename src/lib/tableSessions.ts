import type { SupabaseClient } from '@supabase/supabase-js'

// A customer's ordering window lasts 20 hours from their most recent valid
// table-token presentation (see database/013_table_session_expiry.sql for the
// full rationale). Re-presenting the token — e.g. reloading the menu link —
// resets this window; it is not extended by activity alone.
export const TABLE_SESSION_TTL_MS = 20 * 60 * 60 * 1000

export async function touchTableSession(
  supabaseAdmin: SupabaseClient,
  tableId: string,
  customerSessionId: string
): Promise<string> {
  const expiresAt = new Date(Date.now() + TABLE_SESSION_TTL_MS).toISOString()

  await supabaseAdmin
    .from('table_sessions')
    .upsert(
      {
        table_id: tableId,
        customer_session_id: customerSessionId,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'table_id,customer_session_id' }
    )

  return expiresAt
}

export async function isTableSessionActive(
  supabaseAdmin: SupabaseClient,
  tableId: string,
  customerSessionId: string | null | undefined
): Promise<boolean> {
  if (!customerSessionId) return false

  const { data } = await supabaseAdmin
    .from('table_sessions')
    .select('expires_at')
    .eq('table_id', tableId)
    .eq('customer_session_id', customerSessionId)
    .maybeSingle()

  if (!data) return false

  return new Date(data.expires_at).getTime() > Date.now()
}
