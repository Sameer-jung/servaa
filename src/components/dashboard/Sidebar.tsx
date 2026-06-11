'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useMemo } from "react";
import Image from "next/image"
import {
  ChevronRight,
  ExternalLink,
  Home,
  LayoutDashboard,
  LifeBuoy,
  Receipt,
  Settings,
  ShoppingBag,
  Store,
  Table2,
  Utensils,
  ChevronDown,
} from "lucide-react";
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'
import { ProfileMenu } from './ProfileMenu'
import { createClient } from "@/lib/supabase/client";
import { useRestaurant } from "@/hooks/useRestaurant";

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  badge?: string
}

type NavGroup = NavItem & {
  items?: NavItem[]
}


export function DashboardSidebar() {
  const pathname = usePathname();


  const { restaurant } = useRestaurant();

  
  const supabase = useMemo (() => createClient(), []);


  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Home: true,
    Restaurant: true,
  });

  
  const [activeOrderCount, setActiveOrderCount] = useState(0);

  
  useEffect(() => {
    if (!restaurant) return;

    const fetchCount = async () => {
      const { count } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurant.id)
        .in("status", ["pending", "accepted", "preparing", "ready"]);

      setActiveOrderCount(count || 0);
    };

    fetchCount();
  }, [restaurant, supabase]);

  
  const navGroups: NavGroup[] = [
    {
      label: "Home",
      href: "/dashboard",
      icon: Home,
      items: [
        { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
        {
          href: "/dashboard/orders",
          label: "Orders",
          icon: ShoppingBag,
          badge: activeOrderCount > 0 ? String(activeOrderCount) : undefined,
        },
        { href: "/dashboard/menu", label: "Menu", icon: Utensils },
        { href: "/dashboard/tables", label: "Tables", icon: Table2 },
      ],
    },
    {
      label: "Restaurant",
      href: "/dashboard/settings",
      icon: Store,
      items: [
        { href: "/dashboard/billing", label: "Billing", icon: Receipt },
        { href: "/dashboard/settings", label: "Settings", icon: Settings },
      ],
    },
  ];

  // MOVE footerItems here so customer menu can use restaurant.slug
  const footerItems: NavItem[] = [
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
    { href: "#", label: "Support", icon: LifeBuoy, badge: "Online" },
    {
      href: restaurant?.slug ? `/menu/${restaurant.slug}` : "#",
      label: "Open customer menu",
      icon: ExternalLink,
    },
  ];
  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname?.startsWith(href + "/");
  };
  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-gray-200 bg-white lg:flex dark:border-gray-800 dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-4 dark:border-gray-800">
        <Link href="/dashboard" className="flex items-center gap-3">
          <Image
            src="/logo/servaa.png"
            alt="Servaa"
            width={40}
            height={40}
            priority
            className="h-10 w-10 rounded-lg object-contain"
          />

          <Image
            src="/logo/servaa_logo.png"
            alt="Servaa"
            width={112}
            height={32}
            priority
            className="h-8 w-auto object-contain"
          />
        </Link>
      </div>

      {restaurant && (
        <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-950">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
              {restaurant.name}
            </p>
            <p className="mt-1 truncate text-xs font-medium text-gray-500 dark:text-gray-400">
              Restaurant profile
            </p>
          </div>
        </div>
      )}

      <nav className="flex-1 space-y-5 overflow-y-auto p-4">
        {navGroups.map((group) => {
          const GroupIcon = group.icon;
          const groupActive =
            group.items?.some((item) => isActive(item.href)) ||
            isActive(group.href);

          return (
            <div key={group.label} className="space-y-1">
              <button
                type="button"
                onClick={() =>
                  setOpenGroups((current) => ({
                    ...current,
                    [group.label]: !current[group.label],
                  }))
                }
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold",
                  groupActive
                    ? "text-gray-900 dark:text-gray-100"
                    : "text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white",
                )}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <GroupIcon className="h-5 w-5 flex-shrink-0" />
                  <span className="truncate">{group.label}</span>
                </span>

                {openGroups[group.label] ? (
                  <ChevronDown className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                )}
              </button>

              {openGroups[group.label] &&
                group.items?.map((item) => {
                  const ItemIcon = item.icon;
                  const itemActive = isActive(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={true}
                      className={cn(
                        "ml-4 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        itemActive
                          ? "bg-gray-100 text-gray-950 dark:bg-gray-800 dark:text-gray-50"
                          : "text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white",
                      )}
                    >
                      <ItemIcon className="h-4 w-4 flex-shrink-0" />
                      <span className="min-w-0 flex-1 truncate">
                        {item.label}
                      </span>

                      {item.badge && (
                        <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-200">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
            </div>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
        {footerItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-gray-100 text-gray-950 dark:bg-gray-800 dark:text-gray-50"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white",
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>

              {item.badge && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="border-t border-gray-200 p-4 dark:border-gray-800">
        <ProfileMenu />
      </div>
    </aside>
  );
}
