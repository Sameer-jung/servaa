    import Image from "next/image";
    import {
    BadgeCheck,
    CreditCard,
    LayoutDashboard,
    ListChecks,
    QrCode,
    } from "lucide-react";

    const features = [
    {
        title: "Live Order Management",
        description:
        "Receive customer orders instantly from every table and keep your team updated during busy hours.",
        image: "/features/order.png",
        icon: LayoutDashboard,
        points: [
        "Track pending, preparing, ready, and completed orders",
        "Reduce confusion between kitchen and service staff",
        "Keep every table order visible in one dashboard",
        ],
    },
    {
        title: "Digital Menu Control",
        description:
        "Manage your menu without reprinting or manually explaining unavailable items to customers.",
        image: "/features/menu.png",
        icon: ListChecks,
        points: [
        "Create and organize menu categories",
        "Update prices, item names, and descriptions anytime",
        "Hide unavailable items instantly",
        ],
    },
    {
        title: "Smart Table QR Setup",
        description:
        "Give every table its own QR flow so customer orders stay connected to the correct session.",
        image: "/features/Qr.png",
        icon: QrCode,
        points: [
        "Generate QR codes for individual tables",
        "Connect orders to the correct table automatically",
        "Make customer ordering simple without app downloads",
        ],
    },
    {
        title: "Billing Made Simple",
        description:
        "Handle bill requests, taxes, and payment status from the same restaurant dashboard.",
        image: "/features/billing.png",
        icon: CreditCard,
        points: [
        "Let customers request bills from their table",
        "Calculate taxes clearly for each order",
        "Track paid and unpaid bills easily",
        ],
    },
    ];

    export function FeaturesSection() {
    return (
        <section
        id="features"
        className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8"
        >
        <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-wide text-brand-600">
            Features
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
            Everything your restaurant needs, explained clearly.
            </h2>
            <p className="mt-3 text-gray-600">
            From QR ordering to billing, each feature is designed to keep your
            restaurant workflow smooth.
            </p>
        </div>

        <div className="mt-12 space-y-12">
            {features.map((feature, index) => {
            const Icon = feature.icon;

            const imageBlock = (
                <div className="flex justify-center">
                <div className="mx-auto w-full max-w-lg rounded-[1.5rem] border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-3 shadow-lg">
                    <Image
                    src={feature.image}
                    alt={feature.title}
                    width={560}
                    height={360}
                    className="h-auto w-full rounded-[1.2rem] object-contain"
                    />
                </div>
                </div>
            );

            const contentBlock = (
                <div className="flex justify-center">
                <div className="mx-auto w-full max-w-lg">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 text-brand-700 ring-1 ring-brand-200">
                    <Icon className="h-6 w-6" />
                    </div>

                    <h3 className="text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">
                    {feature.title}
                    </h3>

                    <p className="mt-3 text-base leading-7 text-gray-600">
                    {feature.description}
                    </p>

                    <ul className="mt-4 space-y-2.5">
                    {feature.points.map((point) => (
                        <li
                        key={point}
                        className="flex gap-3 text-sm font-medium leading-6 text-gray-700"
                        >
                        <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                        <span>{point}</span>
                        </li>
                    ))}
                    </ul>
                </div>
                </div>
            );

            return (
            <div
                key={feature.title}
                className="mx-auto grid max-w-6xl items-center gap-8 lg:grid-cols-2"
            >
                {index % 2 === 0 ? (
                <>
                    {imageBlock}
                    {contentBlock}
                </>
                ) : (
                <>
                    {contentBlock}
                    {imageBlock}
                </>
                )}
            </div>
            );
            })}
        </div>
        </section>
    );
    }
