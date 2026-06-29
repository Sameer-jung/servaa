'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { History, LayoutDashboard, LifeBuoy, Store, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'
import { LogoutButton } from '@/components/auth/LogoutButton'

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
}

export const navItems: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/restaurants', label: 'Restaurants', icon: Store },
  { href: '/admin/owners', label: 'Owners', icon: Users },
  { href: '/admin/messages', label: 'Support messages', icon: LifeBuoy },
  { href: '/admin/audit-log', label: 'Admin activity', icon: History },
]

export function AdminSidebar() {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin'
    return pathname === href || pathname?.startsWith(href + '/')
  }

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-gray-200 bg-white lg:flex dark:border-gray-800 dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-4 dark:border-gray-800">
        <p className="text-lg font-bold text-gray-900 dark:text-gray-100">Servaa Admin</p>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Platform control</p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-gray-100 text-gray-950 dark:bg-gray-800 dark:text-gray-50'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-gray-200 p-4 dark:border-gray-800">
        <LogoutButton />
      </div>
    </aside>
  )
}
