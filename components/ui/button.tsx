import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { LoadingDots } from "@/components/ui/loading-dots";
import { cn } from "@/lib/utils";

/**
 * REG-774 — bottoni del design system «clay leggero» (come il mobile, vedi
 * reglo-mobile docs/design-system.md §0.4): sempre a capsula. La primaria è
 * nera con volume (luce interna in alto, ombra interna in basso) e premuta
 * sprofonda; la secondaria è bianca in rilievo. Le ombre non si animano: si
 * scambiano al tocco, si anima solo la scala (200 ms, senza rimbalzo).
 */
const buttonVariants = cva(
  "reglo-focus-ring relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full text-[15px] font-semibold transition-[transform,background-color,color,opacity] duration-200 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:cursor-default [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[#1e1e1e] text-white shadow-clay-cta hover:bg-[#2a2a2a] active:shadow-clay-cta-pressed disabled:bg-[#d9d9d9] disabled:text-white disabled:shadow-none",
        destructive:
          "bg-white text-[#c13515] shadow-clay-raise hover:bg-[#fdf7f5] active:shadow-clay-raise-pressed disabled:opacity-50 focus-visible:ring-destructive/25",
        outline:
          "bg-white text-foreground shadow-clay-raise hover:bg-[#fafafa] active:shadow-clay-raise-pressed disabled:opacity-50",
        secondary:
          "bg-white text-foreground shadow-clay-raise hover:bg-[#fafafa] active:shadow-clay-raise-pressed disabled:opacity-50",
        ghost: "font-medium text-foreground hover:bg-[#f2f2f2] disabled:opacity-50",
        link: "font-medium text-foreground underline decoration-[1.5px] underline-offset-4 hover:decoration-2 disabled:opacity-50",
      },
      size: {
        default: "min-h-[48px] px-5 py-2.5 has-[>svg]:px-4",
        sm: "h-9 gap-1.5 px-3.5 has-[>svg]:px-3 text-sm",
        lg: "min-h-[54px] px-6 has-[>svg]:px-5 text-base",
        icon: "size-9",
        /** Misure decise da chi lo usa (bottoni nati a mano, REG-774): niente altezza né padding. */
        bare: "",
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
  loading = false,
  disabled,
  children,
  onClick,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /**
     * In attesa della risposta: i puntini prendono il posto dell'etichetta, che
     * resta invisibile e tiene la larghezza (mai cambio di testo). Il bottone
     * non reagisce ai clic ma non si sbiadisce.
     */
    loading?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";
  const showLoading = loading && !asChild;

  return (
    <Comp
      data-slot="button"
      data-loading={showLoading ? "" : undefined}
      aria-busy={showLoading || undefined}
      aria-disabled={showLoading || undefined}
      disabled={disabled}
      onClick={
        showLoading
          ? (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault()
          : onClick
      }
      className={cn(buttonVariants({ variant, size, className }), showLoading && "pointer-events-none")}
      {...props}
    >
      {showLoading ? (
        <>
          <span className="invisible inline-flex items-center gap-[inherit]">{children}</span>
          <span className="absolute inset-0 flex items-center justify-center">
            <LoadingDots className="scale-[0.85]" />
          </span>
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
