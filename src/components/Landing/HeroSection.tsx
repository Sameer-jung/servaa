    "use client";

    import Image from "next/image";
    import { Button } from "@/components/ui/Button";

    interface HeroSectionProps {
    loadingAction: "register" | "login" | null;
    onGetStarted: () => void;
    onSignIn: () => void;
    }

    export function HeroSection({
    loadingAction,
    onGetStarted,
    onSignIn,
    }: HeroSectionProps) {
    return (
        <section className="relative overflow-hidden bg-gradient-to-br from-emerald-50 via-green-50 to-white">
        <div className="absolute left-[-120px] top-[-120px] h-80 w-80 rounded-full bg-brand-200/60 blur-3xl" />
        <div className="absolute bottom-[-160px] right-[-120px] h-96 w-96 rounded-full bg-emerald-300/30 blur-3xl" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-28">
            <div>
            <div className="mb-6 inline-flex items-center rounded-full border border-brand-200 bg-white/80 px-4 py-2 text-sm font-semibold text-brand-700 shadow-sm">
                Smart QR ordering for modern restaurants
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight text-gray-950 sm:text-5xl lg:text-6xl">
                Serve faster with a smarter restaurant ordering system.
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-gray-600">
                Servaa helps restaurants replace slow manual ordering with instant
                QR menus, live order tracking, table management, and simple billing
                — all from one dashboard.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                size="lg"
                isLoading={loadingAction === "register"}
                onClick={onGetStarted}
                >
                {loadingAction === "register" ? "Loading..." : "Get Started"}
                </Button>

                <Button
                size="lg"
                variant="outline"
                isLoading={loadingAction === "login"}
                onClick={onSignIn}
                >
                {loadingAction === "login" ? "Loading..." : "Sign In"}
                </Button>
            </div>
            </div>

            <div className="relative min-h-[420px]">
            <Image
                src="/view/1.png"
                alt="Servaa dashboard shown on laptop"
                width={920}
                height={620}
                priority
                className="w-full rounded-[2rem] object-contain drop-shadow-2xl"
            />

            <div className="absolute -bottom-8 -left-2 w-32 sm:-left-8 sm:w-44 md:w-52">
                <Image
                src="/view/2.png"
                alt="Servaa customer menu shown on mobile"
                width={300}
                height={600}
                priority
                className="w-full object-contain drop-shadow-2xl"
                />
            </div>
            </div>
        </div>
        </section>
    );
    }
