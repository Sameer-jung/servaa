'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/utils/cn'

const navItems = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/orders', label: 'Orders' },
  { href: '/dashboard/menu', label: 'Menu' },
  { href: '/dashboard/tables', label: 'Tables' },
  { href: '/dashboard/billing', label: 'Billing' },
  { href: '/dashboard/settings', label: 'Settings' },
]

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 lg:hidden">
        <Link href="/dashboard" className="text-lg font-bold text-brand-600" onClick={() => setIsOpen(false)}>
          Servaa
        </Link>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-700 active:bg-gray-100"
          aria-label="Open navigation menu"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>

      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 lg:hidden" 
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Menu panel */}
      <div 
        className={cn(
          'fixed left-3 right-3 top-20 z-50 rounded-xl bg-white p-2 shadow-xl transition-all duration-200 lg:hidden',
          isOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
        )}
      >
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
          const isOrders = item.label === 'Orders'
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              onClick={() => setIsOpen(false)}
              className={cn(
                'block rounded-lg px-4 py-3 font-medium transition-colors',
                isOrders ? 'text-base' : 'text-sm',
                isActive
                  ? isOrders
                    ? 'bg-red-50 text-red-700'
                    : 'bg-brand-50 text-brand-700'
                  : isOrders
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-gray-600 hover:bg-gray-50'
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </>
  )
}
