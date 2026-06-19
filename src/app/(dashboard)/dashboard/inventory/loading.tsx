export default function InventoryLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-8 w-48 rounded-lg bg-gray-200 dark:bg-gray-800" />
        <div className="mt-2 h-4 w-56 rounded-lg bg-gray-100 dark:bg-gray-800" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl border border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900" />
        ))}
      </div>

      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 rounded-xl border border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900" />
        ))}
      </div>
    </div>
  )
}
