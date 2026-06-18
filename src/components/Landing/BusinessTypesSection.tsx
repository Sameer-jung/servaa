    import {
    Building2,
    ChefHat,
    Coffee,
    Hotel,
    Store,
    Utensils,
    } from "lucide-react";

    const businessTypes = [
    {
        title: "Restaurants",
        description: "Full-service dining spaces with table ordering and billing.",
        icon: Utensils,
    },
    {
        title: "Cafes",
        description: "Quick ordering for drinks, snacks, bakery items, and tables.",
        icon: Coffee,
    },
    {
        title: "Cloud Kitchens",
        description: "Organized menus and order flow for delivery-first kitchens.",
        icon: ChefHat,
    },
    {
        title: "Food Courts",
        description:
        "Simple QR ordering for shared dining and fast-moving counters.",
        icon: Store,
    },
    {
        title: "Hotels",
        description: "Useful for in-room dining, restaurants, lounges, and cafes.",
        icon: Hotel,
    },
    ];

    export function BusinessTypesSection() {
    return (
        <section className="border-b border-gray-100 bg-white py-16">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-brand-600 sm:text-4xl">
            Built for different styles of hospitality.
            </h2>

            <p className="mx-auto mt-4 max-w-2xl text-gray-600">
            Whether you run a small cafe or a growing restaurant, Servaa adapts to
            your ordering workflow.
            </p>

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {businessTypes.map((item) => {
                const Icon = item.icon;

                return (
                <div
                    key={item.title}
                    className="rounded-3xl border border-gray-100 bg-gray-50 p-6 text-left transition hover:-translate-y-1 hover:border-brand-200 hover:bg-brand-50 hover:shadow-lg"
                >
                    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-sm">
                    <Icon className="h-6 w-6" />
                    </div>

                    <h3 className="font-bold text-gray-950">{item.title}</h3>

                    <p className="mt-3 text-sm leading-6 text-gray-600">
                    {item.description}
                    </p>
                </div>
                );
            })}
            </div>

            <div className="mx-auto mt-10 flex max-w-xl items-center justify-center gap-3 rounded-full border border-emerald-100 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800">
            <Building2 className="h-4 w-4" />
            One platform that can grow with your restaurant business.
            </div>
        </div>
        </section>
    );
    }
