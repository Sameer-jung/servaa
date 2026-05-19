import Link from 'next/link'
import { RegisterForm } from '@/components/auth/RegisterForm'

export const metadata = {
  title: 'Create Account - QR Order',
}

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-brand-600">QR Order</h1>
          <p className="mt-1 text-sm text-gray-500">Get started with your restaurant</p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Create Account</h2>
          <RegisterForm />
        </div>
        <p className="mt-4 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
