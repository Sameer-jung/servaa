    'use client'

    import Image from 'next/image'
    import { useRouter } from 'next/navigation'
    import { Button } from '@/components/ui/Button'

    interface LandingNavbarProps {
    loadingAction: 'register' | 'login' | null
    onStartTrial: () => void
    onSignIn: () => void
    }

    export function LandingNavbar({
    loadingAction,
    onStartTrial,
    onSignIn,
    }: LandingNavbarProps) {
    const router = useRouter()

    return (
        <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/90 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <button
            type="button"
            onClick={() => router.push('/')}
            className="flex items-center gap-3"
            aria-label="Go to homepage"
            >
            <Image
                src="/logo/servaa.png"
                alt="Servaa"
                width={40}
                height={40}
                priority
                className="h-10 w-10 rounded-lg object-contain"
            />

            <Image
                src="/logo/servaa_logo.png"
                alt="Servaa"
                width={112}
                height={32}
                priority
                className="h-8 w-auto object-contain"
            />
            </button>

            <div className="hidden items-center gap-8 md:flex">
            <a
                href="#pricing"
                className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
            >
                Pricing
            </a>
            <a
                href="#contact"
                className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
            >
                Contact Us
            </a>
            </div>

            <div className="flex items-center gap-3">
            <button
                type="button"
                onClick={onSignIn}
                className="hidden text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 sm:inline-flex"
            >
                Sign In
            </button>

            <Button
                size="sm"
                isLoading={loadingAction === 'register'}
                onClick={onStartTrial}
                className="rounded-full px-4"
            >
                {loadingAction === 'register' ? 'Loading...' : 'Start 15 days trial'}
            </Button>
            </div>
        </nav>
        </header>
    )
    }