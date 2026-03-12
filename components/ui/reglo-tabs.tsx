"use client";

import React from "react";

import { cn } from "@/lib/utils";

export type RegloTabItem<T extends string = string> = {
  key: T;
  label: string;
};

export function RegloTabs<T extends string>({
  items,
  activeKey,
  onChange,
  ariaLabel,
  className,
}: {
  items: RegloTabItem<T>[];
  activeKey: T;
  onChange: (key: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "w-full overflow-visible rounded-2xl border border-pink-200 bg-gradient-to-r from-pink-50/80 to-white p-2 shadow-[0_4px_20px_rgba(236,72,153,0.08)]",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 overflow-visible">
        {items.map((item) => {
          const isActive = activeKey === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(item.key)}
              className={cn(
                "reglo-focus-ring reglo-interactive shrink-0 rounded-full border px-4 py-2 text-sm font-semibold",
                isActive
                  ? "border-primary bg-primary text-white shadow-[0_12px_24px_-14px_rgba(236,72,153,0.4)]"
                  : "border-pink-200 bg-white text-[#6B7280] hover:-translate-y-0.5 hover:border-primary/40 hover:bg-pink-50 hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
