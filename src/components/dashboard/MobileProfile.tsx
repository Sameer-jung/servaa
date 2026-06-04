    "use client";

    import { useEffect, useState } from "react";
    import { ChevronUp, Moon, User } from "lucide-react";
    import { LogoutButton } from "@/components/auth/LogoutButton";

    export function MobileProfile() {
    const [open, setOpen] = useState(false);
    const [darkMode, setDarkMode] = useState(false);

    useEffect(() => {
        const savedTheme = localStorage.getItem("theme");
        const isDark = savedTheme === "dark";

        setDarkMode(isDark);
        document.documentElement.classList.toggle("dark", isDark);
    }, []);

    const toggleDarkMode = () => {
        const nextValue = !darkMode;

        setDarkMode(nextValue);
        document.documentElement.classList.toggle("dark", nextValue);
        localStorage.setItem("theme", nextValue ? "dark" : "light");
    };

    return (
        <div className="relative">
        {open && (
            <div className="absolute top-full left-0 right-0 mb-3 rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-3 flex items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-950">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-100">
                S
                </div>
                <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Servaa Profile
                </p>
                <p className="truncate text-xs font-medium text-gray-500 dark:text-gray-400">
                    Restaurant owner
                </p>
                </div>
            </div>

            <button
                type="button"
                onClick={toggleDarkMode}
                className="mb-2 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
            >
                <span className="flex items-center gap-2">
                <Moon className="h-4 w-4" />
                Dark mode
                </span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {darkMode ? "On" : "Off"}
                </span>
            </button>

            <LogoutButton />
            </div>
        )}

        <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-2.5 text-left shadow-sm transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
        >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-100">
            <User className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                Servaa Profile
            </p>
            <p className="truncate text-xs font-medium text-gray-500 dark:text-gray-400">
                Manage account
            </p>
            </div>

            <ChevronUp className="h-4 w-4 text-gray-400 dark:text-gray-500" />
        </button>
        </div>
    );
    }
