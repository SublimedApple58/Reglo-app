import type { ReactNode } from "react";
import { Nunito } from "next/font/google";

/**
 * Round pre-seed: l'outreach agli investitori. Dati riservati: l'accesso è
 * protetto dal layout del backoffice (`requireGlobalAdmin`) e ogni action lo
 * ripete; nessun endpoint pubblico.
 */
export const dynamic = "force-dynamic";

/** Font tondo e amichevole per i numeri grandi del round. */
const nunito = Nunito({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-round", display: "swap" });

export default function RoundLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${nunito.variable} min-h-[calc(100dvh-4rem)] bg-[#fffaf3]`}>
      <div className="mx-auto max-w-[1080px] overflow-hidden px-4 pb-24 pt-10 sm:px-6 md:pt-14">{children}</div>
    </div>
  );
}
