    import { Button } from "@/components/ui/Button";

    interface PricingSectionProps {
    onChoosePlan: () => void;
    }

    const plans = [
    {
        name: "Demo",
        price: "Free",
        subtitle: "15 days trial",
        description: "Best for testing Servaa with your team.",
        borderClass: "border-gray-200",
        cardClass: "bg-white",
        buttonVariant: "outline" as const,
        features: [
        "QR customer menu",
        "Basic order dashboard",
        "Menu and category setup",
        "Table QR setup",
        "Trial support",
        ],
    },
    {
        name: "Standard",
        price: "NPR 1,999",
        subtitle: "per month",
        description: "Best for small and growing restaurants.",
        borderClass: "border-emerald-300",
        cardClass: "bg-emerald-50/60",
        buttonVariant: "primary" as const,
        features: [
        "Everything in Demo",
        "Unlimited menu updates",
        "Order status management",
        "Billing management",
        "Basic analytics",
        ],
    },
    {
        name: "Premium",
        price: "NPR 3,999",
        subtitle: "per month",
        description: "Best for teams that want more control.",
        borderClass: "border-brand-600",
        cardClass: "bg-white ring-2 ring-brand-600",
        buttonVariant: "primary" as const,
        features: [
        "Everything in Standard",
        "Advanced analytics",
        "Priority support",
        "Custom branding",
        "Multi-restaurant ready",
        ],
    },
    ];

    export function PricingSection({ onChoosePlan }: PricingSectionProps) {
    return (
        <section
        id="pricing"
        className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8"
        >
        <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-wide text-brand-600">
            Subscription
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
            Start free, upgrade when you are ready.
            </h2>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {plans.map((plan) => (
            <div
                key={plan.name}
                className={`rounded-3xl border p-8 shadow-sm ${plan.borderClass} ${plan.cardClass}`}
            >
                <h3 className="text-xl font-bold text-gray-950">{plan.name}</h3>
                <p className="mt-2 text-sm text-gray-500">{plan.description}</p>

                <div className="mt-6">
                <span className="text-4xl font-extrabold text-gray-950">
                    {plan.price}
                </span>
                <p className="mt-1 text-sm text-gray-500">{plan.subtitle}</p>
                </div>

                <ul className="mt-8 space-y-3">
                {plan.features.map((feature) => (
                    <li key={feature} className="text-sm text-gray-600">
                    ✓ {feature}
                    </li>
                ))}
                </ul>

                <Button
                className="mt-8 w-full"
                variant={plan.buttonVariant}
                onClick={onChoosePlan}
                >
                Choose {plan.name}
                </Button>
            </div>
            ))}
        </div>
        </section>
    );
    }
