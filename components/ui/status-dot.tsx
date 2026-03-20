import { cn } from "@/lib/utils";

/**
 * StatusDot — colored dot with optional label.
 * Replaces inline cn() chains for live status indicators.
 */
const COLORS = {
  green: "bg-positive",
  yellow: "bg-yellow-400",
  red: "bg-destructive",
  pink: "bg-primary",
  gray: "bg-muted-foreground/40",
  blue: "bg-blue-400",
} as const;

export function StatusDot({
  color,
  pulse,
  label,
  className,
}: {
  color: keyof typeof COLORS;
  pulse?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "inline-block h-2 w-2 shrink-0 rounded-full",
          COLORS[color],
          pulse && "animate-pulse",
        )}
      />
      {label && (
        <span className="text-xs text-muted-foreground">{label}</span>
      )}
    </span>
  );
}
