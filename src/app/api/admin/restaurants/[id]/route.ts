import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAdminUser } from '@/utils/admin'
import { writeAdminAuditLog } from '@/lib/admin/auditLog'
import { isUuid } from '@/utils/validation'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Invalid restaurant id' }, { status: 400 })
  }

  const adminUser = await getAdminUser()
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('restaurants')
    .select('id, is_active, plan, trial_ends_at')
    .eq('id', id)
    .maybeSingle()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = {}
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  let action: string | null = null

  if (typeof body.isActive === 'boolean') {
    updates.is_active = body.isActive
    before.is_active = existing.is_active
    after.is_active = body.isActive
    action = body.isActive ? 'restaurant.activated' : 'restaurant.suspended'
  }

  if (body.plan !== undefined) {
    if (body.plan !== 'trial' && body.plan !== 'paid') {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }
    updates.plan = body.plan
    before.plan = existing.plan
    after.plan = body.plan
    action = action || 'restaurant.plan_updated'
  }

  if (body.trialEndsAt !== undefined) {
    if (body.trialEndsAt !== null && Number.isNaN(Date.parse(body.trialEndsAt))) {
      return NextResponse.json({ error: 'Invalid trial end date' }, { status: 400 })
    }
    updates.trial_ends_at = body.trialEndsAt
    before.trial_ends_at = existing.trial_ends_at
    after.trial_ends_at = body.trialEndsAt
    action = action || 'restaurant.plan_updated'
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
  }

  const { error: updateError } = await supabaseAdmin.from('restaurants').update(updates).eq('id', id)
  if (updateError) {
    console.error('[admin.restaurants.PATCH] update error:', updateError.message)
    return NextResponse.json({ error: 'Failed to update restaurant' }, { status: 500 })
  }

  // Admin mutations are the deliberate exception to fire-and-forget audit
  // logging — await it and surface a failure instead of swallowing it.
  try {
    await writeAdminAuditLog({
      adminUserId: adminUser.id,
      action: action || 'restaurant.updated',
      targetType: 'restaurant',
      targetId: id,
      before,
      after,
    })
  } catch (auditError) {
    console.error('[admin.restaurants.PATCH] audit log failed:', auditError)
    return NextResponse.json(
      { error: 'Restaurant was updated but the audit log failed to record. Please verify and retry.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
