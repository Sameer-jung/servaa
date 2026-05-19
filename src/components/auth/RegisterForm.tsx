'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { generateSlug } from '@/utils/format'

export function RegisterForm() {
  const [restaurantName, setRestaurantName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [debugInfo, setDebugInfo] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setDebugInfo('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      setLoading(false)
      return
    }

    setDebugInfo('Creating account...')

    // Try sign up
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: restaurantName },
        emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/dashboard` : undefined,
      },
    })

    console.log('Auth response:', authData, authError)

    if (authError) {
      setError(`Auth error: ${authError.message}`)
      setLoading(false)
      return
    }

    // If signUp succeeded but no user returned, try signing in immediately
    // This works if email confirmation is OFF
    let user = authData?.user

    if (!user) {
      setDebugInfo('Signing in...')
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError(`Check your email (${email}) for confirmation link, then log in.`)
        setDebugInfo('Email confirmation required.')
        setLoading(false)
        return
      }

      user = signInData?.user
    }

    if (!user) {
      setError('Could not authenticate. Try logging in.')
      setLoading(false)
      return
    }

    setDebugInfo('Creating restaurant...')

    const slug = generateSlug(restaurantName)
    const { data: newRestaurant, error: restaurantError } = await supabase
      .from('restaurants')
      .insert({
        name: restaurantName,
        slug,
        owner_id: user.id,
      })
      .select()
      .single()

    if (restaurantError) {
      setError(`Restaurant error: ${restaurantError.message}`)
      setLoading(false)
      return
    }

    setDebugInfo('Adding permissions...')

    await supabase.from('staff_members').insert({
      restaurant_id: newRestaurant.id,
      user_id: user.id,
      role: 'owner',
    })

    setDebugInfo('Done! Redirecting...')
    setLoading(false)

    setTimeout(() => {
      router.push('/dashboard')
      router.refresh()
    }, 500)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}
      {debugInfo && !error && (
        <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-600 font-mono text-xs">
          {debugInfo}
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
  )
}