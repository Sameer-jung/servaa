'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'

export function LogoutButton() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    if(loading) return
    setLoading(true)

  try {
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
  } finally {
    setLoading(false)
  }
  }

  return (

    <Button variant="ghost" size="sm" isLoading={loading} onClick={handleLogout}>
      {loading? 'Signing out...' : 'Sign out'}
    </Button>
  )
}
