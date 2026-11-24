"use client";

import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * REG-778 — l'unica tab bar della web app: testo, linea grigia sotto e una
 * linea nera che si allarga sotto la scheda attiva (250 ms, senza rimbalzo).
 * Nata nel drawer dell'allievo (REG-775), ora la usano anche Impostazioni,
 * Road e il backoffice. I segmentati (`SegmentedPill`/`SegmentedControl`)
 * restano per i filtri e le scelte di valore: questa è navigazione.
 *
 * - `fill`: schede a larghezza uguale (drawer). Altrimenti schede a misura di
 *   testo che, se non ci stanno (390 px), scorrono e tengono in vista l'attiva.
 * - Con `href` le schede sono link (`aria-current`), altrimenti bottoni
 *   `role="tab"`.
 */
export type UnderlineTabItem<T extends string> = {
  key: T;
  label: React.ReactNode;
  href?: string;
  testId?: string;
};

const EASE = "ease-[cubic-bezier(.22,.7,.24,1)]";

export function UnderlineTabs<T extends string>({
  items,
  value,
  onChange,
  fill = false,
  ariaLabel,
  className,
  testId,
}: {
  items: ReadonlyArray<UnderlineTabItem<T>>;
  value: T;
  onChange?: (key: T) => void;
  fill?: boolean;
  ariaLabel?: string;
  className?: string;
  testId?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const asLinks = items.some((item) => item.href);

  // La scheda attiva resta sempre in vista quando la barra scorre.
  React.useEffect(() => {
    const list = ref.current;
    if (!list || fill || list.scrollWidth <= list.clientWidth) return;
    const tab = list.querySelector<HTMLElement>('[data-active="true"]');
    if (!tab) return;
    const left = tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2;
    list.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [value, fill]);

  return (
    <div
      ref={ref}
      role={asLinks ? "navigation" : "tablist"}
      aria-label={ariaLabel}
      data-testid={testId}
      className={cn(
        // La linea grigia è un'ombra interna: un bordo verrebbe tagliato
        // dall'overflow e la linea nera non ci si sovrapporrebbe.
        "relative flex shadow-[inset_0_-1px_0_#efefef]",
        fill
          ? "items-stretch"
          : "gap-x-7 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.key === value;
        const classes = cn(
          "relative cursor-pointer select-none whitespace-nowrap py-3 text-sm transition-colors duration-200",
          fill ? "flex-1 px-1 text-center sm:px-2" : "flex shrink-0 items-center gap-2 px-px",
          active ? "font-semibold text-foreground" : "font-medium text-[#6a6a6a] hover:text-foreground",
        );
        const bar = (
          <span
            aria-hidden
            className={cn(
              "absolute inset-x-0 bottom-0 h-[2px] origin-center bg-[#222222] transition-transform duration-[250ms]",
              EASE,
              active ? "scale-x-100" : "scale-x-0",
            )}
          />
        );
        if (item.href) {
          return (
            <Link
              key={item.key}
              href={item.href}
              scroll={false}
              onClick={() => onChange?.(item.key)}
              aria-current={active ? "page" : undefined}
              data-active={active}
              data-testid={item.testId}
              className={classes}
            >
              {item.label}
              {bar}
            </Link>
          );
        }
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active}
            data-testid={item.testId}
            onClick={() => onChange?.(item.key)}
            className={classes}
          >
            {item.label}
            {bar}
          </button>
        );
      })}
    </div>
  );
}
