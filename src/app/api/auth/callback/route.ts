import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import '@/lib/sentry'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { origin } = new URL(request.url)

  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const rawNext = searchParams.get('next') ?? '/dashboard'
    // Only allow safe relative paths to prevent open-redirect phishing via ?next=//evil.com
    const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard'

    if (code) {
      const supabase = await createClient()
      // An error here (expired/invalid/reused code) is normal auth failure,
      // not a bug — it's handled by the redirect below, not captured.
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }

    return NextResponse.redirect(`${origin}/login?error=auth`)
  } catch (error) {
    Sentry.captureException(error)
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }
}
