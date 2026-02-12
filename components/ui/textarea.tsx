import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "reglo-focus-ring reglo-interactive flex min-h-[96px] w-full rounded-2xl border border-input/70 bg-white/82 px-3 py-2 text-base placeholder:text-muted-foreground/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_8px_18px_-16px_rgba(50,78,122,0.35)] backdrop-blur hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
