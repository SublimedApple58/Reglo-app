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
        "glass-panel glass-strong w-full overflow-visible p-2",
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
                  ? "border-[#324D7A] bg-[#324D7A] text-white shadow-[0_12px_24px_-14px_rgba(50,77,122,0.72)]"
                  : "border-white/80 bg-white/78 text-[#324D7A] hover:-translate-y-0.5 hover:border-[#AFE2D4] hover:bg-[#AFE2D4]/45 hover:shadow-[0_10px_18px_-14px_rgba(50,77,122,0.42)]",
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
