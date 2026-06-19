'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/utils/cn'
import { MobileProfile } from './MobileProfile'
import { useRestaurant } from '@/hooks/useRestaurant'
import { useRole } from '@/hooks/useRole'
import Image from 'next/image'

export function MobileNav() {
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
      Home: true,
      Operations: true,
      Restaurant: true,
    });
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()
  const { restaurant } = useRestaurant()
  const { isOwner } = useRole(restaurant?.id)

  const navGroups = [
    {
      label: "Home",
      items: [
        { href: "/dashboard", label: "Overview" },
        { href: "/dashboard/orders", label: "Orders" },
        { href: "/dashboard/menu", label: "Menu" },
        { href: "/dashboard/tables", label: "Tables" },
      ],
    },
    {
      label: "Operations",
      items: [
        { href: "/dashboard/inventory", label: "Inventory" },
        ...(isOwner ? [{ href: "/dashboard/expenses", label: "Expenses" }] : []),
      ],
    },
    {
      label: "Restaurant",
      items: [
        { href: "/dashboard/billing", label: "Billing" },
        { href: "/dashboard/settings", label: "Settings" },
      ],
    },
  ];

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
        {navGroups.map((group) => (
          <div key={group.label} className="space-y-1">
            <button
              type="button"
              onClick={() =>
                setOpenGroups((current) => ({
                  ...current,
                  [group.label]: !current[group.label],
                }))
              }
              className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100"
            >
              {group.label}
              <span className="text-gray-400">
                {openGroups[group.label] ? '⌄' : '›'}
              </span>
            </button>

            {openGroups[group.label] &&
              group.items.map((item) => {
                const isActive =
                  item.href === '/dashboard'
                    ? pathname === '/dashboard'
                    : pathname === item.href || pathname?.startsWith(item.href + '/')

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={true}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      'ml-3 block rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-gray-100 text-gray-950 dark:bg-gray-800 dark:text-gray-50'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'
                    )}
                  >
                    {item.label}
                  </Link>
                )
              })}
          </div>
        ))}
        <div className="mt-2 border-t border-gray-200 p-2 dark:border-gray-800">
          <MobileProfile />
        </div>
      </div>
    </>
  );
}
