import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAdminUser } from '@/utils/admin'
import { writeAdminAuditLog } from '@/lib/admin/auditLog'
import { isUuid } from '@/utils/validation'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Invalid message id' }, { status: 400 })
  }

  const adminUser = await getAdminUser()
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('support_messages')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }

  if (existing.status === 'handled') {
    return NextResponse.json({ error: 'Message is already marked handled' }, { status: 400 })
  }

  const { error: updateError } = await supabaseAdmin
    .from('support_messages')
    .update({ status: 'handled', handled_at: new Date().toISOString(), handled_by: adminUser.id })
    .eq('id', id)

  if (updateError) {
    console.error('[admin.messages.PATCH] update error:', updateError.message)
    return NextResponse.json({ error: 'Failed to update message' }, { status: 500 })
  }

  try {
    await writeAdminAuditLog({
      adminUserId: adminUser.id,
      action: 'support_message.handled',
      targetType: 'support_message',
      targetId: id,
      before: { status: existing.status },
      after: { status: 'handled' },
    })
  } catch (auditError) {
    console.error('[admin.messages.PATCH] audit log failed:', auditError)
    return NextResponse.json(
      { error: 'Message was updated but the audit log failed to record. Please verify and retry.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
