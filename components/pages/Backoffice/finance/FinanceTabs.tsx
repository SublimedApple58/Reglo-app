"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

// Le viste arrivano una fase alla volta: qui solo quelle già pronte.
const TABS = [
  { href: "/backoffice/finanza", label: "Panoramica", exact: true },
  { href: "/backoffice/finanza/movimenti", label: "Movimenti", exact: false },
  { href: "/backoffice/finanza/spese-fisse", label: "Spese fisse", exact: false },
] as const;

export function FinanceTabs() {
  const pathname = usePathname() ?? "";
  const current = pathname.replace(/^\/[a-z]{2}(?=\/)/, "");
  return (
    <nav className="mb-7 flex w-max max-w-full gap-1 overflow-x-auto rounded-xl bg-[#f1f1f2] p-1">
      {TABS.map((tab) => {
        const active = tab.exact ? current === tab.href : current.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "whitespace-nowrap rounded-[9px] px-3.5 py-[7px] text-sm transition-colors",
              active
                ? "bg-white font-semibold text-[#111111] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                : "text-[#71717a] hover:text-[#111111]",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
