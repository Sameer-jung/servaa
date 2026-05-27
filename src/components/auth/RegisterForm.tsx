'use client'

import { useState } from 'react'
import {toast} from "react-hot-toast"
import {MESSAGES} from "@/utils/messages"
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { generateSlug } from '@/utils/format'
import { writeAuditLog } from '@/utils/audit'
import { validateEmail, validatePassword, validateRestaurantName } from '@/utils/validation'

export function RegisterForm() {
  const [restaurantName, setRestaurantName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successEmail, setSuccessEmail] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const cleanName = validateRestaurantName(restaurantName)
    if (!cleanName) {
      toast.error('Restaurant name must be between 2 and 100 characters.')
      return
    }

    const cleanEmail = validateEmail(email)
    if (!cleanEmail) {
      toast.error('Please enter a valid email address.')
      return
    }

    const cleanPassword = validatePassword(password)
    if (!cleanPassword) {
      toast.error('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match.')
      return
    }

    setLoading(true)

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: cleanEmail,
      password: cleanPassword,
      options: {
        data: { full_name: cleanName },
        emailRedirectTo: typeof window !== 'undefined'
          ? `${window.location.origin}/dashboard`
          : undefined,
      },
      
    })

    if (authError) {
      console.error('[RegisterForm] auth error:', authError.message)
      const msg = authError.message.toLowerCase()
      if (msg.includes('already registered')) {
        toast.error('An account with this email already exists.')
      } else if (msg.includes('email rate limit exceeded')) {
        toast.error('Too many sign-up attempts. Please wait a few minutes and try again.')
      } else if (msg.includes('password')) {
        toast.error('Password must be at least 8 characters.')
      } else {
        setError('Registration failed. Please try again.')
        toast.error(MESSAGES.common.unexpectedError);
      }
      setLoading(false)
      return
    }

    let user = authData?.user

    if (!user) {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      })

      if (signInError) {
        // Email confirmation is required — show success state, not an error
        setSuccessEmail(cleanEmail)
        setLoading(false)
        return
      }

      user = signInData?.user
    }

    if (!user) {
      setError('Could not authenticate. Please try signing in.')
      setLoading(false)
      return
    }

    const slug = generateSlug(cleanName)
    const { data: newRestaurant, error: restaurantError } = await supabase
      .from('restaurants')
      .insert({ name: cleanName, slug, owner_id: user.id })
      .select()
      .single()

    if (restaurantError) {
      console.error('[RegisterForm] restaurant insert error:', restaurantError.message)
      setError('Could not create your restaurant. Please try again.')
      setLoading(false)
      return
    }

    const { error: staffError } = await supabase.from('staff_members').insert({
      restaurant_id: newRestaurant.id,
      user_id: user.id,
      role: 'owner',
    })

    if (!staffError) {
      void writeAuditLog(supabase, {
        restaurantId: newRestaurant.id,
        actorUserId: user.id,
        action: 'staff.added',
        entityType: 'staff_member',
        entityId: user.id,
        metadata: { role: 'owner' },
      })
    }

    setLoading(false)

    // Wait for Supabase to fully commit restaurant and staff_members rows
    // before the dashboard server component runs its queries.
    // 1500ms prevents the race condition that shows the restaurant setup form
    // to users who just registered successfully.
    await new Promise(resolve => setTimeout(resolve, 1500))
    toast.success(MESSAGES.auth.registerSuccess);
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <>
      {successEmail ? (
        <div className="rounded-xl bg-green-50 border border-green-200 p-6 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-green-900">Check your inbox</h3>
          <p className="text-sm text-green-700">
            We sent a confirmation link to
          </p>
          <p className="text-sm font-medium text-green-900 break-all">{successEmail}</p>
          <p className="text-sm text-green-700">
            Click the link in that email to activate your account, then come back and sign in.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}
          <Input
            label="Restaurant Name"
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
            placeholder="My Restaurant"
            required
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@restaurant.com"
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          <Input
            label="Confirm Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          <Button type="submit" isLoading={loading} className="w-full">
            Create Account
          </Button>
        </form>
      )}
    </>
  )
}
