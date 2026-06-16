    "use client";

    import { Button } from "@/components/ui/Button";

    export function ContactSection() {
    const handleContactSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        alert("Thank you! We will contact you soon.");
        event.currentTarget.reset();
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

            <Button type="submit" className="mt-5 w-full sm:w-auto">
                Submit Message
            </Button>
            </form>
        </div>
        </section>
    );
    }
