"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { LogOut } from "lucide-react";

import { RegloMark } from "@/components/ui/reglo-mark";
import {
  backofficeSignOut,
} from "@/lib/actions/backoffice.actions";
import { getBackofficeSupportUnreadTotal } from "@/lib/actions/support.actions";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/backoffice", label: "Autoscuole" },
  { href: "/backoffice/support", label: "Assistenza" },
  { href: "/backoffice/feedback", label: "Feedback" },
] as const;

export function BackofficeHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [supportUnread, setSupportUnread] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      const res = await getBackofficeSupportUnreadTotal();
      if (active && res.success && res.data) setSupportUnread(res.data.unread);
    };
    void load();
    const interval = setInterval(() => void load(), 30_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [pathname]);

  const handleLogout = () => {
    startTransition(async () => {
      await backofficeSignOut();
      router.push("/backoffice-sign-in");
      router.refresh();
    });
  };

  const isActive = (href: string) => {
    const current = pathname?.replace(/^\/[a-z]{2}(?=\/)/, "") ?? "";
    if (href === "/backoffice") return current === "/backoffice";
    return current.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-6">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <RegloMark size={32} />
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-semibold text-foreground">
              Reglo Autoscuole
            </span>
            <span className="rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-pink-700">
              Admin
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-gray-100 text-foreground"
                  : "text-muted-foreground hover:bg-gray-50 hover:text-foreground",
              )}
            >
              {item.label}
              {item.href === "/backoffice/support" && supportUnread > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#c13515] px-1.5 text-[11px] font-bold text-white">
                  {supportUnread > 99 ? "99+" : supportUnread}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {/* Logout */}
        <button
          type="button"
          onClick={handleLogout}
          disabled={isPending}
          className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-gray-100 hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Esci</span>
        </button>
      </div>
    </header>
  );
}
