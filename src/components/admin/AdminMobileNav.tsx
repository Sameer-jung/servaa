'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/utils/cn'
import { navItems } from './AdminSidebar'
import { LogoutButton } from '@/components/auth/LogoutButton'

export function AdminMobileNav() {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin'
    return pathname === href || pathname?.startsWith(href + '/')
  }

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white lg:hidden dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="font-bold text-gray-900 dark:text-gray-100">Servaa Admin</p>
        <LogoutButton />
      </div>
      <nav className="flex gap-1 overflow-x-auto px-4 pb-3 text-sm">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex-shrink-0 rounded-lg px-3 py-1.5 font-medium',
              isActive(item.href)
                ? 'bg-gray-100 text-gray-950 dark:bg-gray-800 dark:text-gray-50'
                : 'text-gray-600 dark:text-gray-300'
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  )
}
