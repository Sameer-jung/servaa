import { Skeleton } from '@/components/ui/Skeleton'

export default function AdminAuditLogLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-44" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>

      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-2 border-b border-gray-100 pb-3 last:border-0 dark:border-gray-800">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}
