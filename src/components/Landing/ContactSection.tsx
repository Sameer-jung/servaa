    "use client";

    import { useState } from "react";
    import toast from "react-hot-toast";
    import { Button } from "@/components/ui/Button";

    export function ContactSection() {
    const [submitting, setSubmitting] = useState(false);

    const handleContactSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = event.currentTarget;
        setSubmitting(true);

        try {
            const formData = new FormData(form);
            const response = await fetch("/api/contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formData.get("name"),
                    email: formData.get("email"),
                    phone: formData.get("phone"),
                    message: formData.get("message"),
                }),
            });

            if (!response.ok) {
                const result = await response.json().catch(() => null);
                toast.error(result?.error || "Unable to send message. Please try again.");
                return;
            }

            toast.success("Thank you! We will contact you soon.");
            form.reset();
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <section id="contact" className="bg-green-50 py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
            <div>
            <p className="text-sm font-bold uppercase tracking-wide text-brand-600">
                Contact us
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
                Want to bring Servaa to your restaurant?
            </h2>
            <p className="mt-5 text-gray-600">
                Send us a message and our team will help you set up your QR menu,
                dashboard, tables, and first trial account.
            </p>
            </div>

            <form
            onSubmit={handleContactSubmit}
            className="rounded-3xl bg-white p-6 shadow-xl sm:p-8"
            >
            <div className="grid gap-4 sm:grid-cols-2">
                <input
                className="rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-brand-500"
                name="name"
                placeholder="Name"
                required
                />
                <input
                className="rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-brand-500"
                name="email"
                type="email"
                placeholder="Email"
                required
                />
                <input
                className="rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-brand-500 sm:col-span-2"
                name="phone"
                placeholder="Phone number"
                required
                />
                <textarea
                className="min-h-32 rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-brand-500 sm:col-span-2"
                name="message"
                placeholder="Message"
                required
                />
            </div>

            <Button type="submit" isLoading={submitting} className="mt-5 w-full sm:w-auto">
                Submit Message
            </Button>
            </form>
        </div>
        </section>
    );
    }
