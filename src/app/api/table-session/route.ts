import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import '@/lib/sentry'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { hashTableAccessToken } from '@/utils/tableSession'
import { touchTableSession } from '@/lib/tableSessions'
import { isUuid, readTrimmedString } from '@/utils/validation'

// Called once per fresh menu page load that carries a valid table token (i.e.
// a real or repeated QR scan/link open) — starts or refreshes the customer's
// 20-hour ordering window for that table. See
// database/013_table_session_expiry.sql for why this is separate from the
// table token itself.
export async function POST(req: NextRequest) {
  let tableId: string | undefined

  try {
    const body = await req.json().catch(() => null)
    tableId = isUuid(body?.tableId) ? body.tableId : undefined
    const tableToken = readTrimmedString(body?.tableToken, 256)
    const customerSessionId = readTrimmedString(body?.customerSessionId, 128)

    if (!tableId || !tableToken || !customerSessionId) {
      return NextResponse.json({ error: 'Missing tableId, tableToken, or customerSessionId' }, { status: 400 })
    }

    const { data: table, error: tableError } = await supabaseAdmin
      .from('tables')
      .select('id')
      .eq('id', tableId)
      .eq('qr_token_hash', hashTableAccessToken(tableToken))
      .eq('is_active', true)
      .maybeSingle()

    if (tableError) {
      Sentry.captureException(tableError, { tags: { table_id: tableId } })
      return NextResponse.json({ error: 'Could not validate table.' }, { status: 500 })
    }

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 })
    }

    const expiresAt = await touchTableSession(supabaseAdmin, tableId, customerSessionId)

    return NextResponse.json({ success: true, expiresAt })
  } catch (error) {
    Sentry.captureException(error, { tags: { table_id: tableId } })
    return NextResponse.json({ error: 'Could not start table session.' }, { status: 500 })
  }
}
