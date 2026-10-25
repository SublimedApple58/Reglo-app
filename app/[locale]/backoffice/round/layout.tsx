import type { ReactNode } from "react";

/**
 * Round pre-seed: l'outreach agli investitori. Dati riservati: l'accesso è
 * protetto dal layout del backoffice (`requireGlobalAdmin`) e ogni action lo
 * ripete; nessun endpoint pubblico.
 */
export const dynamic = "force-dynamic";

export default function RoundLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-[1080px] overflow-hidden px-4 pb-24 pt-10 sm:px-6 md:pt-14">{children}</div>;
}
