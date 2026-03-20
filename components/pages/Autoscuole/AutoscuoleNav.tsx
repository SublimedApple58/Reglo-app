"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import Link from "next/link";

import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", tab: null, href: null },
  { label: "Allievi", tab: "students", href: null },
  { label: "Agenda", tab: "agenda", href: null },
  { label: "Configurazione", tab: "settings", href: null },
  { label: "Pagamenti", tab: "payments", href: null },
  { label: "Segretaria", tab: "voice", href: null },
  { label: "Users", tab: null, href: "/admin/users" },
];

export function AutoscuoleNav() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const locale = useLocale();

  const currentTab = searchParams.get("tab") ?? null;
  const basePath = `/${locale}/user/autoscuole`;

  // Handle both ?tab= navigation and standalone path navigation
  const isOnAutoscuolePage = pathname === basePath || pathname.startsWith(`${basePath}?`);

  return (
    <nav className="flex items-center gap-1 rounded-full bg-pink-50/80 p-1.5 border border-pink-200/50 shadow-[0_1px_3px_rgba(0,0,0,0.12)] backdrop-blur-md">
      {navItems.map((item) => {
        let isActive: boolean;
        if (item.href) {
          // Standalone path (e.g. /admin/users)
          const fullHref = `/${locale}${item.href}`;
          isActive = pathname === fullHref || pathname.startsWith(`${fullHref}/`);
        } else if (isOnAutoscuolePage) {
          // Tab-based navigation (AutoscuoleTabsPage)
          isActive = currentTab === item.tab;
        } else {
          // Standalone path navigation (e.g. /user/autoscuole/voice)
          const itemPath = item.tab ? `${basePath}/${item.tab}` : basePath;
          isActive =
            pathname === itemPath ||
            (item.tab !== null && pathname.startsWith(`${itemPath}/`));
        }

        // Build href
        const href = item.href
          ? `/${locale}${item.href}`
          : item.tab === "voice"
            ? `${basePath}/voice`
            : item.tab
              ? `${basePath}?tab=${item.tab}`
              : basePath;

        return (
          <Link
            key={item.label}
            href={href}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all duration-[var(--motion-fast)]",
              isActive
                ? "bg-white text-primary shadow-sm border border-pink-200/60"
                : "text-pink-800/50 hover:text-pink-800",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
