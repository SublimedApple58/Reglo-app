import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "reglo-focus-ring inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-white [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-[#FACC15]/15 text-[#CA8A04] [a&]:hover:bg-[#FACC15]/25",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/25 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border border-pink-200 bg-pink-50/50 text-primary [a&]:hover:bg-pink-100/50 [a&]:hover:text-foreground",
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
