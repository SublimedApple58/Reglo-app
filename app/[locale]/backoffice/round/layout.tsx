import type { ReactNode } from "react";

import { RoundTabs } from "@/components/pages/Backoffice/round/RoundTabs";

/**
 * Round pre-seed: l'outreach agli investitori. Dati riservati: l'accesso è
 * protetto dal layout del backoffice (`requireGlobalAdmin`) e ogni action lo
 * ripete; nessun endpoint pubblico.
 */
export const dynamic = "force-dynamic";

export default function RoundLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl overflow-hidden px-4 pb-16 pt-8 lg:px-6">
      <div className="mb-5">
        <h1 className="text-[26px] font-semibold tracking-[-0.01em] text-[#111111]">Round pre-seed</h1>
        <p className="mt-1 text-sm text-[#71717a]">Outreach agli investitori · prima angel, club e follower, i lead dopo</p>
      </div>
      <RoundTabs />
      {children}
    </div>
  );
}
