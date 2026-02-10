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
        "glass-panel glass-strong p-2 shadow-[0_12px_30px_-24px_rgba(50,77,122,0.45)]",
        className,
      )}
    >
      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto">
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
                "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200",
                isActive
                  ? "border-[#324D7A] bg-[#324D7A] text-white shadow-[0_8px_18px_-10px_rgba(50,77,122,0.65)]"
                  : "border-white/70 bg-white/70 text-[#324D7A] hover:border-[#AFE2D4] hover:bg-[#AFE2D4]/45",
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

