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
        "w-full overflow-visible rounded-2xl border border-gray-100 bg-white p-2 shadow-[0_2px_12px_rgba(0,0,0,0.04)]",
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
                  : "border-gray-200 bg-gray-50 text-[#6B7280] hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5 hover:text-[#111]",
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
