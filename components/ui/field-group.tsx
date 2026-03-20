import React from "react";
import { cn } from "@/lib/utils";

/**
 * FieldGroup — label + optional description + input wrapper.
 * Replaces repeated space-y-1.5 > text-xs pattern across settings forms.
 */
export function FieldGroup({
  label,
  description,
  children,
  className,
  required,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-xs font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-primary">*</span>}
      </label>
      {children}
      {description && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}
