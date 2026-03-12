import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "reglo-focus-ring reglo-interactive inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-white hover:bg-[#DB2777] hover:-translate-y-0.5 transition-all",
        destructive:
          "bg-destructive text-white hover:bg-destructive/92 hover:-translate-y-0.5 focus-visible:ring-destructive/25 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border-2 border-[#111]/15 bg-white text-[#111] hover:border-[#111]/30 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all",
        secondary:
          "bg-[#FACC15] text-[#111] hover:bg-[#EAB308] hover:-translate-y-0.5 transition-all",
        ghost:
          "text-[#6B7280] hover:bg-gray-50 hover:text-[#111]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-7 py-2 font-bold has-[>svg]:px-3",
        sm: "h-8 gap-1.5 px-5 has-[>svg]:px-2.5",
        lg: "h-10 px-8 has-[>svg]:px-4",
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
