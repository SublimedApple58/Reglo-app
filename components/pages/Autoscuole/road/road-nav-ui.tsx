"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import { UnderlineTabs } from "@/components/ui/underline-tabs";
import { canGoBackTo } from "./road-nav";

/**
 * REG-716: il ritorno delle pagine figlie di Road, al posto del breadcrumb.
 * Dice dove si torna («‹ Storico», «‹ Giulia Longo»). Se la pagina prima nella
 * cronologia è proprio `href`, torna con `router.back()` (scroll e lista come
 * li avevi lasciati); altrimenti è un link normale.
 */
export function RoadBackLink({ href, label, className }: { href: string; label: string; className?: string }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      data-testid="road-back"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        if (canGoBackTo(href)) {
          e.preventDefault();
          router.back();
        }
      }}
      className={cn(
        "-ml-2 inline-flex h-9 max-w-full items-center gap-1 rounded-full pl-1 pr-3 text-[14.5px] font-semibold text-[#111111] transition-colors duration-200 hover:bg-[#f4f4f4]",
        className,
      )}
    >
      <ChevronLeft className="size-[18px] shrink-0" strokeWidth={2.2} />
      <span className="truncate">{label}</span>
    </Link>
  );
}

/**
 * Tab di sezione sottolineate. REG-778: è la tab bar condivisa della web app;
 * a 390 px scorre a filo schermo e tiene in vista la voce attiva.
 */
export function RoadTabs<T extends string>({
  items,
  value,
  hrefFor,
  onSelect,
  render,
}: {
  items: Array<{ value: T; label: string }>;
  value: T;
  hrefFor: (v: T) => string;
  onSelect?: () => void;
  render?: (item: { value: T; label: string }) => React.ReactNode;
}) {
  return (
    <UnderlineTabs
      ariaLabel="Sezioni di Road"
      testId="road-tabs"
      className="-mx-4 px-4 sm:mx-0 sm:px-0"
      items={items.map((it) => ({
        key: it.value,
        label: render ? render(it) : it.label,
        href: hrefFor(it.value),
        testId: `road-tab-${it.value}`,
      }))}
      value={value}
      onChange={onSelect ? () => onSelect() : undefined}
    />
  );
}
