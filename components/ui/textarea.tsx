import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "reglo-focus-ring flex min-h-[96px] w-full rounded-lg border border-input bg-secondary px-[18px] py-3.5 text-[15px] font-medium placeholder:text-muted-foreground transition-colors duration-[var(--motion-fast)] focus-visible:border-primary focus-visible:bg-white disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
