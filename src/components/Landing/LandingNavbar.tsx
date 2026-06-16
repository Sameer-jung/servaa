    "use client";

    import Image from "next/image";
    import { useRouter } from "next/navigation";
    import { Button } from "@/components/ui/Button";

    interface LandingNavbarProps {
    loadingAction: "register" | "login" | null;
    onStartTrial: () => void;
    onSignIn: () => void;
    }

    export function LandingNavbar({
    loadingAction,
    onStartTrial,
    onSignIn,
    }: LandingNavbarProps) {
    const router = useRouter();

    return (
        <header className="sticky top-0 z-50 border-b border-emerald-100/80 bg-white/85 backdrop-blur-xl">
        <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <button
            type="button"
            onClick={() => router.push("/")}
            className="flex items-center gap-3"
            aria-label="Go to homepage"
            >
            <Image
                src="/logo/servaa.png"
                alt="Servaa"
                width={44}
                height={44}
                priority
                className="h-11 w-11 rounded-2xl object-contain "
            />
            <Image
                src="/logo/servaa_logo.png"
                alt="Servaa"
                width={120}
                height={36}
                priority
                className="h-9 w-auto object-contain"
            />
            </button>

            <div className="hidden items-center gap-8 md:flex">
            <a
                href="#features"
                className="text-sm font-semibold text-gray-600 hover:text-brand-700"
            >
                Features
            </a>
            <a
                href="#pricing"
                className="text-sm font-semibold text-gray-600 hover:text-brand-700"
            >
                Pricing
            </a>
            <a
                href="#contact"
                className="text-sm font-semibold text-gray-600 hover:text-brand-700"
            >
                Contact Us
            </a>
            </div>

            <div className="flex items-center gap-3">
            <button
                type="button"
                onClick={onSignIn}
                className="hidden rounded-full px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 hover:text-gray-950 sm:inline-flex"
            >
                Sign In
            </button>

            <Button
                size="sm"
                isLoading={loadingAction === "register"}
                onClick={onStartTrial}
                className="rounded-full px-5 shadow-lg shadow-brand-600/20"
            >
                {loadingAction === "register" ? "Loading..." : "Start Free Trial"}
            </Button>
            </div>
        </nav>
        </header>
    );
    }
