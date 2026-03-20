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
        "rounded-lg border border-pink-200 bg-gradient-to-br from-pink-500 to-pink-700 text-white shadow-cta",
        className,
      )}
    >
      <span className="text-sm font-semibold tracking-[0.08em]">
        {label}
      </span>
    </AvatarFallback>
  );
}
