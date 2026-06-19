import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import '@/lib/sentry'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/utils/audit'
import { hasRestaurantAccess } from '@/utils/roles'

export async function POST(request: Request) {
  let invoiceId: string | undefined
  let restaurantId: string | undefined
  try {
    const body = await request.json()
    invoiceId = body.invoiceId

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
      Sentry.captureException(invoiceError, { tags: { invoice_id: invoiceId } })
      return NextResponse.json({ error: invoiceError.message }, { status: 500 })
    }

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    restaurantId = invoice.restaurant_id

    const hasAccess = await hasRestaurantAccess(supabase, invoice.restaurant_id, user.id)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { error: updateError } = await supabaseAdmin
      .from('invoices')
      .update({
        notes: 'sent_to_table',
        sent_to_table_at: new Date().toISOString(),
      })
      .eq('id', invoiceId)

    if (updateError) {
      Sentry.captureException(updateError, { tags: { invoice_id: invoiceId, restaurant_id: restaurantId } })
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    void writeAuditLog(supabaseAdmin, {
      restaurantId: invoice.restaurant_id,
      actorUserId: user.id,
      action: 'invoice.sent_to_table',
      entityType: 'invoice',
      entityId: invoiceId,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    Sentry.captureException(error, { tags: { invoice_id: invoiceId, restaurant_id: restaurantId } })
    return NextResponse.json({ error: 'Failed to send invoice' }, { status: 500 })
  }
}
