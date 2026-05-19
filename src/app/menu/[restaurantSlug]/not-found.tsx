export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900">404</h1>
        <p className="mt-2 text-gray-600">Restaurant not found</p>
        <p className="mt-1 text-sm text-gray-400">This menu link may be incorrect or the restaurant is no longer active.</p>
      </div>
    </div>
  )
}
