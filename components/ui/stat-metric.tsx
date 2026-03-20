import React from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * StatMetric — number + label card with optional accent band.
 * Used for dashboard/payments stats.
 */
export function StatMetric({
  label,
  value,
  accent = "default",
  icon,
  loading,
  suffix,
  className,
}: {
  label: string;
  value: string | number;
  accent?: "pink" | "yellow" | "green" | "default";
  icon?: React.ReactElement;
  loading?: boolean;
  suffix?: string;
  className?: string;
}) {
  const accentBorder = {
    pink: "border-l-primary",
    yellow: "border-l-yellow-400",
    green: "border-l-positive",
    default: "border-l-border",
  }[accent];

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-xl border border-border bg-white p-4 shadow-card",
        "border-l-[3px]",
        accentBorder,
        className,
      )}
    >
      <div className="min-w-0">
        <p className="ds-caption text-muted-foreground uppercase">{label}</p>
        <div className="mt-1.5">
          {loading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {value}
              {suffix && (
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  {suffix}
                </span>
              )}
            </p>
          )}
        </div>
      </div>
      {icon && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-yellow-50">
          {icon}
        </span>
      )}
    </div>
  );
}
