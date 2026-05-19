import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateQRCodeDataUrl, getTableQRUrl } from '@/utils/qr'

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

    const url = getTableQRUrl(restaurantSlug, tableNumber)
    const qrCodeDataUrl = await generateQRCodeDataUrl(url)

    // Store the generated PNG data URL directly. This avoids requiring a
    // separate Supabase Storage bucket and policy just for QR codes.
    const { error: updateError } = await supabase
      .from('tables')
      .update({ qr_code: qrCodeDataUrl })
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
