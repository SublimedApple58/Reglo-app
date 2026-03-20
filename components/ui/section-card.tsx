"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * SectionCard — clean white card with optional icon header.
 * Replaces all glass-panel sections across autoscuole pages.
 */
export function SectionCard({
  icon: Icon,
  iconClassName,
  title,
  description,
  children,
  className,
  headerRight,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  headerRight?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-white p-5 shadow-card",
        className,
      )}
    >
      {(Icon || title) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {Icon && (
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-yellow-50",
                  iconClassName,
                )}
              >
                <Icon className="h-4 w-4 text-yellow-600" />
              </span>
            )}
            {title && (
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {title}
                </h3>
                {description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {description}
                  </p>
                )}
              </div>
            )}
          </div>
          {headerRight}
        </div>
      )}
      {children}
    </div>
  );
}
