export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-8 w-48 rounded-lg bg-gray-200" />
        <div className="mt-2 h-4 w-32 rounded-lg bg-gray-100" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-gray-100 bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-4 w-20 rounded bg-gray-100" />
                <div className="h-8 w-16 rounded bg-gray-200" />
              </div>
              <div className="h-12 w-12 rounded-lg bg-gray-100" />
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-3 h-6 w-32 rounded-lg bg-gray-200" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl border border-gray-100 bg-white" />
          ))}
        </div>
      </div>
    </div>
  )
}
