import Image from "next/image";
import { cn } from "@/lib/utils";

type RegloMarkProps = {
  className?: string;
  size?: number;
};

/** Logo Reglo corrente (lo stesso della top bar web app). */
export function RegloMark({ className, size = 48 }: RegloMarkProps) {
  return (
    <Image
      src="/images/nav/logo-reglo-tight.png"
      alt="Reglo"
      width={size}
      height={size}
      className={cn("select-none object-contain", className)}
      aria-hidden
    />
  );
}
