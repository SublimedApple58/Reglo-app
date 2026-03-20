import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-pill border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default:
          "border-pink-200 bg-pink-50 text-primary",
        success:
          "border-[#BBF7D0] bg-[#F0FDF4] text-[#16A34A]",
        warning:
          "border-yellow-200 bg-yellow-50 text-yellow-600",
        destructive:
          "border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]",
        outline:
          "border-border bg-white text-foreground",
        secondary:
          "border-pink-200 bg-pink-50 text-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
