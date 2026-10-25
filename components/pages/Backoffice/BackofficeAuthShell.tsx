import type { ReactNode } from "react";
import { Shield } from "lucide-react";

import { RegloMark } from "@/components/ui/reglo-mark";

/** Guscio comune delle pagine di accesso al backoffice (login e attivazione). */
export function BackofficeAuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-[#fafafa] px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute -left-24 top-12 h-72 w-72 rounded-full bg-[#111111]/[0.06] blur-[100px]" />
      <div className="pointer-events-none absolute -right-24 bottom-12 h-72 w-72 rounded-full bg-[#e6e6e6]/60 blur-[100px]" />

      <div className="w-full max-w-[420px] space-y-8">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-3">
            <RegloMark size={44} />
            <div>
              <p className="text-lg font-semibold text-[#111111]">Reglo Autoscuole</p>
              <p className="text-xs text-[#6a6a6a]">Pannello di amministrazione</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-[#e4e4e4] bg-white px-3 py-1">
            <Shield className="h-3 w-3 text-[#222222]" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#444444]">
              Accesso riservato
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-[#ececec] bg-white p-7 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.12)] sm:p-8">
          {children}
        </div>

        <p className="text-center text-xs text-[#9a9a9a]">Reglo Autoscuole · Amministrazione</p>
      </div>
    </div>
  );
}
