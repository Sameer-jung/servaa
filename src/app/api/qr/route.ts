import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateQRCodeDataUrl, getTableQRUrl } from '@/utils/qr'
import { generateTableAccessToken, hashTableAccessToken } from '@/utils/tableSession'

export async function POST(request: Request) {
  try {
    const { tableId, restaurantSlug, tableNumber } = await request.json()

    if (!tableId || !restaurantSlug || !tableNumber) {
      return NextResponse.json(
        { error: 'Missing tableId, restaurantSlug, or tableNumber' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Verify user has access
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: table, error: tableError } = await supabase
      .from('tables')
      .select('id, table_number, restaurant:restaurants(id, slug)')
      .eq('id', tableId)
      .maybeSingle()

    if (tableError) {
      return NextResponse.json({ error: tableError.message }, { status: 500 })
    }

    if (!table) {
      return NextResponse.json({ error: 'Table not found or access denied' }, { status: 404 })
    }

    const token = generateTableAccessToken()
    const url = getTableQRUrl(restaurantSlug, tableNumber, request, token)
    const qrCodeDataUrl = await generateQRCodeDataUrl(url)

    // Keep qr_code populated for existing UI while adding token/url fields for
    // future table-scoped API validation and storage migration.
    const { error: updateError } = await supabase
      .from('tables')
      .update({
        qr_code: qrCodeDataUrl,
        qr_code_data_url: qrCodeDataUrl,
        qr_url: url,
        qr_token_hash: hashTableAccessToken(token),
        qr_token_created_at: new Date().toISOString(),
      })
      .eq('id', tableId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ qrCodeUrl: qrCodeDataUrl, url })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate QR code'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
