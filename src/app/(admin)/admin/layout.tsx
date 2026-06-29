import { redirect } from 'next/navigation'
import { getAdminUser } from '@/utils/admin'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminMobileNav } from '@/components/admin/AdminMobileNav'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Middleware already requires a logged-in session for /admin; this is the
  // actual platform-admin check (the DB lookup middleware deliberately skips).
  const adminUser = await getAdminUser()
  if (!adminUser) {
    redirect('/')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <AdminSidebar />
      <AdminMobileNav />
      <main className="p-6 lg:ml-64">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  )
}
