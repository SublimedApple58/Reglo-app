import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "reglo-focus-ring reglo-interactive file:text-foreground placeholder:text-muted-foreground/90 selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input/70 flex h-10 w-full min-w-0 rounded-2xl border bg-white/82 px-3 py-2 text-base shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_8px_18px_-16px_rgba(50,78,122,0.35)] backdrop-blur file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "hover:bg-white/90 focus-visible:border-primary/35",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
