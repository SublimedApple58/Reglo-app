import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Page header del redesign Airbnb: titolo 28/700 con tracking stretto e
 * sottotitolo grigio muted a segmenti separati da "·". Le azioni vanno a
 * destra, allineate al titolo.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: React.ReactNode;
  /** Stringa singola o segmenti separati da "·" */
  subtitle?: React.ReactNode | React.ReactNode[];
  actions?: React.ReactNode;
  className?: string;
}) {
  const segments = Array.isArray(subtitle) ? subtitle : subtitle != null ? [subtitle] : [];
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div>
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.3px] text-foreground">
          {title}
        </h1>
        {segments.length > 0 && (
          <div className="mt-1.5 flex items-center gap-2 text-[13px] font-medium text-[#929292]">
            {segments.map((seg, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="text-[#c1c1c1]">·</span>}
                <span>{seg}</span>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
