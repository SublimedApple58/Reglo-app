"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { cn } from "@/lib/utils";
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

/** Tab di sezione sottolineate (stile Airbnb/Linear). A 390 px scorrono a filo schermo. */
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
  const ref = React.useRef<HTMLDivElement>(null);
  // La voce attiva resta sempre in vista quando la barra scorre.
  React.useEffect(() => {
    const list = ref.current;
    const tab = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return;
    const left = tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2;
    list.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [value]);
  return (
    <nav
      ref={ref}
      aria-label="Sezioni di Road"
      data-testid="road-tabs"
      className="-mx-4 flex gap-7 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <Link
            key={it.value}
            href={hrefFor(it.value)}
            scroll={false}
            onClick={onSelect}
            aria-current={active ? "page" : undefined}
            data-testid={`road-tab-${it.value}`}
            className={cn(
              "relative flex shrink-0 items-center gap-2 whitespace-nowrap pb-3.5 pt-3 text-[14.5px] transition-colors duration-200",
              active ? "font-semibold text-[#111111]" : "font-medium text-[#5a5a5a] hover:text-[#111111]",
            )}
          >
            {render ? render(it) : it.label}
            {active ? (
              <span
                aria-hidden
                className="road-tab-bar absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-[#111111]"
              />
            ) : null}
          </Link>
        );
      })}
      <style>{`.road-tab-bar{animation:road-tab-in 240ms cubic-bezier(0.2,0,0,1)}@keyframes road-tab-in{from{opacity:0;transform:scaleX(.4)}to{opacity:1;transform:none}}`}</style>
    </nav>
  );
}
