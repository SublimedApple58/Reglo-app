"use client";

import { AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type UserAvatarFallbackProps = {
  initials: string;
  className?: string;
};

export function UserAvatarFallback({
  initials,
  className,
}: UserAvatarFallbackProps) {
  const label = (initials || "R").trim().slice(0, 1).toUpperCase();

  return (
    <AvatarFallback
      className={cn(
        "rounded-full bg-navy-900 text-white",
        className,
      )}
    >
      <span className="text-sm font-semibold tracking-[0.08em]">
        {label}
      </span>
    </AvatarFallback>
  );
}
