'use client'

import { Button } from '@/components/ui/Button'
import { useState } from 'react'
import {useRouter} from 'next/navigation'

export default function HomePage() {

  const router = useRouter()
  const [loadingAction, setLoadingAction] = useState <"register" | "login" | null> (null)

  const goToRegister = () => {
    if(loadingAction) return 
    setLoadingAction('register')
    router.push('/register')
  }

  const goToLogin = () => {
    if(loadingAction) return
    setLoadingAction('login')
    router.push('/login')
  }
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Servaa
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            The simplest in-restaurant QR ordering system for cafes and restaurants.
          </p>
          <div className="mt-8 flex justify-center gap-4">
              <Button size="lg" isLoading = {loadingAction === "register"} onClick={goToRegister}>
                {loadingAction === 'register' ? 'Loading...' : 'Get Started Free'}
                </Button>
              <Button size="lg" variant="outline" isLoading = {loadingAction === "login"} onClick={goToLogin

              }>
                {loadingAction === 'login' ? 'Loading...' : 'Sign In'}
                </Button>
          </div>
        </div>

        {/* Features */}
        <div className="mt-20 grid gap-8 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-6">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900">QR Code Ordering</h3>
            <p className="mt-2 text-sm text-gray-500">
              Customers scan QR codes at their table to browse the menu and place orders instantly.
            </p>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-6">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900">Real-time Updates</h3>
            <p className="mt-2 text-sm text-gray-500">
              Orders appear instantly on your dashboard. No refresh needed. Track status live.
            </p>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-6">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900">Simple Billing</h3>
            <p className="mt-2 text-sm text-gray-500">
              Generate invoices with automatic tax calculation. Mark payments as paid with one click.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="mx-auto max-w-5xl px-4 text-center text-sm text-gray-500">
          QR Order - Built for restaurants, by restaurants.
        </div>
      </footer>
    </div>
  )
}
