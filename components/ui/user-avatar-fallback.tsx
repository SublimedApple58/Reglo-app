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
        "rounded-lg border border-white/60 bg-[radial-gradient(circle_at_24%_18%,#6a89bd_0%,#3f5f92_45%,#324d7a_100%)] text-white shadow-[0_10px_24px_-16px_rgba(18,31,56,0.9),inset_0_1px_0_rgba(255,255,255,0.45)]",
        className,
      )}
    >
      <span className="text-sm font-semibold tracking-[0.08em]">
        {label}
      </span>
    </AvatarFallback>
  );
}
