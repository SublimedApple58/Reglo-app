import Image from "next/image";
import { cn } from "@/lib/utils";
import regloLogo from "@/assets/reglo_new_logo.png";

type RegloMarkProps = {
  className?: string;
  size?: number;
};

export function RegloMark({ className, size = 48 }: RegloMarkProps) {
  return (
    <Image
      src={regloLogo}
      alt="Reglo"
      width={size}
      height={size}
      className={cn("rounded-xl", className)}
      aria-hidden
    />
  );
}
