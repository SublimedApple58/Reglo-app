import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "reglo-focus-ring inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[15px] font-medium transition-colors duration-[var(--motion-fast)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 active:scale-[0.97] transition-transform",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-cta hover:bg-pink-600",
        destructive:
          "border border-destructive bg-white text-destructive hover:bg-destructive/5 focus-visible:ring-destructive/25",
        outline:
          "border border-border bg-white text-foreground shadow-card hover:bg-secondary",
        secondary:
          "border border-accent bg-white text-yellow-700 hover:bg-yellow-50",
        ghost:
          "text-foreground hover:bg-pink-50 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-[48px] px-5 py-2.5 has-[>svg]:px-4",
        sm: "h-9 gap-1.5 px-3 has-[>svg]:px-2.5 text-sm",
        lg: "min-h-[52px] px-6 has-[>svg]:px-5 text-base",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
