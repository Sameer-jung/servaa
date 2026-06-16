    import {
    BadgeCheck,
    Clock3,
    Palette,
    Smartphone,
    Sparkles,
    Zap,
    } from "lucide-react";

    const reasons = [
    {
        title: "Faster service flow",
        description:
        "Customers order directly from the table, helping your team reduce waiting time and manual order taking.",
        icon: Zap,
    },
    {
        title: "No customer app needed",
        description:
        "Guests only scan a QR code. No download, no account, no complicated setup before ordering.",
        icon: Smartphone,
    },
    {
        title: "Restaurant-first design",
        description:
        "Your menu, brand, pricing, and restaurant identity stay at the center of the customer experience.",
        icon: Palette,
    },
    {
        title: "Ready for rush hours",
        description:
        "Orders stay organized when your restaurant gets busy, so staff can focus on service instead of confusion.",
        icon: Clock3,
    },
    ];

    export function WhyChooseUsSection() {
    return (
        <section className="relative overflow-hidden bg-gray-950 py-20 text-white">
        <div className="absolute right-[-120px] top-[-120px] h-80 w-80 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute bottom-[-160px] left-[-120px] h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-400/20 ring-1 ring-brand-300/30">
                <Sparkles className="h-7 w-7 text-brand-300" />
            </div>

            <p className="text-sm font-bold uppercase tracking-wide text-brand-400">
                Why choose us
            </p>

            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Made to feel simple for customers and powerful for restaurants.
            </h2>

            <p className="mt-5 text-gray-300">
                Servaa is not just a QR menu. It connects customer ordering, staff
                workflow, table sessions, and billing into one smooth restaurant
                system.
            </p>
            </div>

            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {reasons.map((reason) => {
                const Icon = reason.icon;

                return (
                <div
                    key={reason.title}
                    className="group rounded-3xl border border-white/10 bg-white/[0.06] p-6 transition hover:-translate-y-1 hover:bg-white/[0.09]"
                >
                    <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-400/20 text-brand-300 ring-1 ring-brand-300/30 transition group-hover:bg-brand-400/30">
                    <Icon className="h-6 w-6" />
                    </div>

                    <h3 className="text-lg font-bold text-white">{reason.title}</h3>

                    <p className="mt-3 text-sm leading-6 text-gray-300">
                    {reason.description}
                    </p>
                </div>
                );
            })}
            </div>

            <div className="mt-10 grid gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:grid-cols-3">
            {[
                ["Less waiting", "Customers order when they are ready."],
                ["Less confusion", "Staff sees table and order details clearly."],
                ["More control", "Owners manage menu, tables, and billing easily."],
            ].map(([title, description]) => (
                <div key={title} className="flex gap-3">
                <BadgeCheck className="mt-1 h-5 w-5 shrink-0 text-brand-300" />
                <div>
                    <p className="font-bold text-white">{title}</p>
                    <p className="mt-1 text-sm text-gray-300">{description}</p>
                </div>
                </div>
            ))}
            </div>
        </div>
        </section>
    );
    }
