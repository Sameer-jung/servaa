import { Card, CardContent } from '@/components/ui/Card'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
}

export function StatCard({ title, value, subtitle, icon }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-500 truncate dark:text-gray-400">{title}</p>
            <p className="mt-1 whitespace-nowrap text-base font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">{value}</p>
            {subtitle && <p className="mt-1 text-xs font-medium text-gray-400 dark:text-gray-500">{subtitle}</p>}
          </div>
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300 sm:h-12 sm:w-12">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
