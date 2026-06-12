'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/utils/cn'
import { MobileProfile } from './MobileProfile'
import Image from 'next/image'

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
      <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 lg:hidden dark:border-gray-800 dark:bg-gray-900">
                <Link href="/dashboard" className="flex items-center gap-3">
                  <Image
                    src="/logo/servaa.png"
                    alt="Servaa"
                    width={40}
                    height={40}
                    priority
                    className="h-10 w-10 rounded-lg object-contain"
                  />
        
                  <Image
                    src="/logo/servaa_logo.png"
                    alt="Servaa"
                    width={112}
                    height={32}
                    priority
                    className="h-8 w-auto object-contain"
                  />
                </Link>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-700 active:bg-gray-100 dark:text-gray-200 dark:active:bg-gray-800"
          aria-label="Open navigation menu"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
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
          "fixed left-3 right-3 top-20 z-50 rounded-xl bg-white p-2 shadow-xl transition-all duration-200 lg:hidden dark:bg-gray-900",
          isOpen
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0",
        )}
      >
        {navItems.map((item) => {
          const isActive = (() => {
            if (item.href === "/dashboard") return pathname === "/dashboard";
            return (
              pathname === item.href || pathname?.startsWith(item.href + "/")
            );
          })();
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              onClick={() => setIsOpen(false)}
              className={cn(
                "block rounded-lg px-4 py-3 font-medium transition-colors",
                "text-sm",
                isActive
                  ? "bg-gray-100 text-gray-950 dark:bg-gray-800 dark:text-gray-50"
                  : "text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white",
              )}
            >
              {item.label}
            </Link>
          );
        })}
        <div className="mt-2 border-t border-gray-200 p-2 dark:border-gray-800">
          <MobileProfile />
        </div>
      </div>
    </>
  );
}
