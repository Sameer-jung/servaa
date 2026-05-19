import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

async function verifyRestaurantAccess(userId: string, restaurantId: string) {
  const supabase = await createClient()

  const { data: ownedRestaurant } = await supabase
    .from('restaurants')
    .select('id')
    .eq('id', restaurantId)
    .eq('owner_id', userId)
    .maybeSingle()

  if (ownedRestaurant) return true

  const { data: staffMember } = await supabase
    .from('staff_members')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  return Boolean(staffMember)
}

export async function POST(request: Request) {
  try {
    const { invoiceId } = await request.json()

    if (!invoiceId) {
      return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('id, restaurant_id')
      .eq('id', invoiceId)
      .maybeSingle()

    if (invoiceError) {
      return NextResponse.json({ error: invoiceError.message }, { status: 500 })
    }

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const hasAccess = await verifyRestaurantAccess(user.id, invoice.restaurant_id)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { error: updateError } = await supabaseAdmin
      .from('invoices')
      .update({ notes: 'sent_to_table' })
      .eq('id', invoiceId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to send invoice' }, { status: 500 })
  }
}
