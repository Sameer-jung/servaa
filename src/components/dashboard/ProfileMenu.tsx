    "use client";

    import { useEffect, useState } from "react";
    import { LogoutButton } from "@/components/auth/LogoutButton";

    export function ProfileMenu() {
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
            <div className="absolute bottom-full left-0 right-0 mb-3 rounded-lg border border-gray-200 bg-white p-4 shadow-lg dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-4">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Profile
                </p>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Restaurant owner
                </p>
            </div>

            <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Dark mode
                </span>
                <button
                type="button"
                onClick={toggleDarkMode}
                className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800"
                >
                {darkMode ? "On" : "Off"}
                </button>
            </div>

            <LogoutButton />
            </div>
        )}

        <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
        >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-100">
            S
            </div>

            <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                Servaa Profile
            </p>
            <p className="truncate text-xs font-medium text-gray-500 dark:text-gray-400">
                Manage account
            </p>
            </div>

            <span className="text-gray-400 dark:text-gray-500">^</span>
        </button>
        </div>
    );
    }
