import { cn } from "@/lib/utils";

/**
 * Skeleton "vivo": base neutra + sweep di luce (shimmer) invece del semplice
 * pulse. Drop-in: stessa API di prima, si dimensiona con className.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-[10px] bg-black/[0.06]",
        "after:absolute after:inset-0 after:-translate-x-full after:animate-[skeleton-shimmer_1.6s_ease-in-out_infinite] after:bg-gradient-to-r after:from-transparent after:via-white/60 after:to-transparent",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
