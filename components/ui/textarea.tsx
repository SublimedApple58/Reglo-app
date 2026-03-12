import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "reglo-focus-ring reglo-interactive flex min-h-[96px] w-full rounded-2xl border border-pink-200 bg-pink-50/30 px-3 py-2 text-base placeholder:text-muted-foreground/90 shadow-[0_4px_12px_rgba(236,72,153,0.06)] hover:bg-pink-50/50 focus:bg-white focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
