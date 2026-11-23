import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // REG-774: campo «clay» bianco e incavato (come il mobile); al focus un
        // bordo interno nero, niente anello esterno.
        "file:text-foreground placeholder:text-[#b0b0b0] selection:bg-primary selection:text-primary-foreground flex h-11 w-full min-w-0 rounded-[14px] border-0 bg-white px-[18px] py-3.5 text-[15px] font-medium shadow-clay-sink outline-none transition-colors duration-200 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:shadow-clay-focus",
        "aria-invalid:shadow-[inset_0_0_0_1.5px_var(--destructive)]",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
