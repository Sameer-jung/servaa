'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { MESSAGES } from "@/utils/messages";
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { validateEmail, validatePassword } from '@/utils/validation'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

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

    setLoading(true)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPassword,
    })

    if (authError) {
      console.error('[LoginForm] auth error:', authError.message)
      const msg = authError.message.toLowerCase()
      if (msg.includes('invalid login credentials')) {
        toast.error(MESSAGES.auth.invalidCredentials);
      } else if (msg.includes('email not confirmed')) {
        toast.error('Please confirm your email before signing in.')
      } else {
        toast.error('Sign in failed. Please try again.')
      }
      setLoading(false)
      return
    }

    router.refresh()
    toast.success(MESSAGES.auth.loginSuccess);
    router.replace('/dashboard')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}
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
        placeholder="********"
        required
      />
      <Button type="submit" isLoading={loading} className="w-full">
        Sign In
      </Button>
    </form>
  )
}
