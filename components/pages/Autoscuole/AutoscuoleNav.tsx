"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";

import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", href: "/user/autoscuole" },
  { label: "Allievi", href: "/user/autoscuole/students" },
  { label: "Pratiche", href: "/user/autoscuole/cases" },
  { label: "Agenda", href: "/user/autoscuole/agenda" },
  { label: "Documenti", href: "/user/autoscuole/documents" },
  { label: "Pagamenti", href: "/user/autoscuole/payments" },
  { label: "Comunicazioni", href: "/user/autoscuole/comunicazioni" },
];

export function AutoscuoleNav() {
  const pathname = usePathname() ?? "";
  const locale = useLocale();

  return (
    <div className="glass-panel glass-strong flex flex-wrap items-center gap-2 p-2">
      {navItems.map((item) => {
        const href = `/${locale}${item.href}`;
        const isActive =
          pathname === href ||
          (item.href !== "/user/autoscuole" && pathname.startsWith(href));
        return (
          <Link
            key={item.href}
            href={href}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition",
              isActive
                ? "bg-foreground text-background shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-white/70",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
