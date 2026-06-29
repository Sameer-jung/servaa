import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import '@/lib/sentry'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { readTrimmedString, validateEmail } from '@/utils/validation'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export async function POST(request: NextRequest) {
  try {
    // Public and unauthenticated — throttle per IP so a script can't flood
    // the support inbox. A genuine visitor submits this once, maybe twice.
    const rateLimitKey = `contact:${getClientIp(request)}`
    if (!checkRateLimit(rateLimitKey, 5, 60_000)) {
      return NextResponse.json({ error: 'Too many requests, please slow down.' }, { status: 429 })
    }

    const body = await request.json().catch(() => null)
    const name = readTrimmedString(body?.name, 100)
    const email = validateEmail(body?.email)
    const phone = readTrimmedString(body?.phone, 50)
    const message = readTrimmedString(body?.message, 2000)

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'Name, email, and message are required.' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('support_messages').insert({
      name,
      email,
      phone,
      message,
    })

    if (error) {
      Sentry.captureException(error)
      console.error('[contact.POST] insert error:', error.message)
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    Sentry.captureException(error)
    console.error('[contact.POST] error:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
