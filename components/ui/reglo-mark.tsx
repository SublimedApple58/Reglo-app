import { cn } from "@/lib/utils";

type RegloMarkProps = {
  className?: string;
  glyphClassName?: string;
};

export function RegloMark({ className, glyphClassName }: RegloMarkProps) {
  return (
    <span
      className={cn(
        "inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5fc4c4] via-[#4f8ac4] to-[#324e7a] shadow-md",
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
