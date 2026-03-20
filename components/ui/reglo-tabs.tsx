"use client";

import React from "react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";
import { spring, tapScale } from "@/lib/motion";

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
        "w-full overflow-visible rounded-lg border border-border bg-white p-2 shadow-card",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 overflow-visible">
        {items.map((item) => {
          const isActive = activeKey === item.key;
          return (
            <motion.button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(item.key)}
              whileTap={tapScale.standard}
              transition={spring.snappy}
              className={cn(
                "reglo-focus-ring relative shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors duration-[var(--motion-fast)]",
                isActive
                  ? "border-yellow-200 bg-yellow-50 text-yellow-700"
                  : "border-border bg-white text-foreground hover:bg-yellow-50/50",
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="reglo-tab-indicator"
                  className="absolute inset-0 rounded-full bg-yellow-50 border border-yellow-200"
                  style={{ zIndex: -1 }}
                  transition={spring.snappy}
                />
              )}
              {item.label}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
