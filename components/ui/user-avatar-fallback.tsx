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
        "rounded-lg border border-pink-200 bg-[radial-gradient(circle_at_24%_18%,#f472b6_0%,#ec4899_45%,#db2777_100%)] text-white shadow-[0_10px_24px_-16px_rgba(219,39,119,0.5)]",
        className,
      )}
    >
      <span className="text-sm font-semibold tracking-[0.08em]">
        {label}
      </span>
    </AvatarFallback>
  );
}
