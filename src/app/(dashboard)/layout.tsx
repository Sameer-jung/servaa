import { DashboardSidebar } from '@/components/dashboard/Sidebar'
import { MobileNav } from '@/components/dashboard/MobileNav'
import { OrderNotifications } from '@/components/dashboard/OrderNotifications'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardSidebar />
      <main className="pt-16 lg:ml-64 lg:pt-0">
        <div className="mx-auto max-w-6xl p-4 lg:p-6">
          {children}
        </div>
      </main>
      <MobileNav />
      <OrderNotifications />
    </div>
  )
}
