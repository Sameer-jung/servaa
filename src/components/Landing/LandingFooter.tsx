    import Image from "next/image";
    import { Facebook, Instagram, Music2, Twitter } from "lucide-react";

    export function LandingFooter() {
    return (
        <footer className="bg-gray-950 py-14 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 md:grid-cols-2 lg:grid-cols-5 lg:px-8">
            <div className="lg:col-span-2">
            <div className="flex items-center gap-3">
                <Image src="/logo/servaa.png" alt="Servaa" width={40} height={40} />
                <Image
                src="/logo/servaa_logo.png"
                alt="Servaa"
                width={116}
                height={36}
                className="h-9 w-auto brightness-0 invert"
                />
            </div>

            <p className="mt-5 max-w-md text-sm leading-6 text-gray-400">
                Servaa helps restaurants serve faster with QR ordering, digital
                menus, table management, billing, and a clean dashboard for daily
                operations.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
            <a
                href="#"
                aria-label="Instagram"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-gray-400 transition hover:bg-brand-600 hover:text-white"
            >
                <Instagram className="h-5 w-5" />
            </a>

            <a
                href="#"
                aria-label="TikTok"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-gray-400 transition hover:bg-brand-600 hover:text-white"
            >
                <Music2 className="h-5 w-5" />
            </a>

            <a
                href="#"
                aria-label="X"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-gray-400 transition hover:bg-brand-600 hover:text-white"
            >
                <Twitter className="h-5 w-5" />
            </a>

            <a
                href="#"
                aria-label="Facebook"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-gray-400 transition hover:bg-brand-600 hover:text-white"
            >
                <Facebook className="h-5 w-5" />
            </a>
            </div>
            </div>

            <div>
            <h3 className="font-semibold">Product</h3>
            <div className="mt-4 space-y-3 text-sm text-gray-400">
                <p>Features</p>
                <p>Pricing</p>
                <p>Free Trial</p>
                <p>Restaurant Dashboard</p>
            </div>
            </div>

            <div>
            <h3 className="font-semibold">Company</h3>
            <div className="mt-4 space-y-3 text-sm text-gray-400">
                <p>About Servaa</p>
                <p>Contact Us</p>
                <p>Help Center</p>
                <p>Support</p>
            </div>
            </div>

            <div>
            <h3 className="font-semibold">Contact</h3>
            <div className="mt-4 space-y-3 text-sm text-gray-400">
                <p>Kathmandu, Nepal</p>
                <p>+977 9800000000</p>
                <p>support@servaa.com</p>
                <p>Privacy Policy</p>
                <p>Terms and Conditions</p>
            </div>
            </div>
        </div>

        <div className="mx-auto mt-10 flex max-w-7xl flex-col gap-3 border-t border-white/10 px-4 pt-6 text-sm text-gray-500 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
            <p>© {new Date().getFullYear()} Servaa. All rights reserved.</p>
            <p>Built for restaurants, cafes, and modern food businesses.</p>
        </div>
        </footer>
    );
    }
