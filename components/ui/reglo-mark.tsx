import { cn } from "@/lib/utils";

type RegloMarkProps = {
  className?: string;
  glyphClassName?: string;
};

export function RegloMark({ className, glyphClassName }: RegloMarkProps) {
  return (
    <span
      className={cn(
        "inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f472b6] via-[#ec4899] to-[#db2777] shadow-md",
        className,
      )}
      aria-hidden
    >
      <span
        className={cn(
          "text-sm font-bold uppercase tracking-[0.18em] text-white",
          glyphClassName,
        )}
      >
        RG
      </span>
    </span>
  );
}
